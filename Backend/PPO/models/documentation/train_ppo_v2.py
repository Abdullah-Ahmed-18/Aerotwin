"""
train_ppo_v2.py — Schedule-aware PPO (v2) built on the v1 foundation.

Upgrades from v1 (train_ppo7.py):
  1. Observation: 7-dim → 15-dim (adds PAX, flights, peak_hour, flow ratio)
  2. PAX: fixed 50 → variable 50–500 per flight, 1–5 flights per episode
  3. Reward: log-normalized → direct IATA compliance (+50 green / -25 red / 100)
  4. Decoder: int(round()) removed during training → continuous gradients
  5. Action scaler: rebuilt from lane-based PAX sweep (PAX → lanes, not PAX → staffing)
  6. Warm-start: no IQL (v1 IQL is 7-dim, incompatible) → linear scaling baseline BC

What stays from v1:
  - Behavior cloning warm-start pattern (proven to work: MSE < 0.001)
  - Separate pi=[256,256] / vf=[512,512] network sizes
  - Post-warm-start verification gate
  - EarlyStopCallback structure
  - run_sim_in_memory() approach
  - structural_decoder.py (updated with continuous=True flag)

Usage:
    python train_ppo_v2.py

Files needed in same directory:
    des_engine.py, des_models.py, des_output.py
    parse_iql_v2.py
    iata_reward.py
    structural_decoder.py  (updated version with continuous=True)
"""
import copy
import json
import os
import random
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
import gymnasium
from gymnasium import spaces
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback, CallbackList
from stable_baselines3.common.utils import get_linear_fn
from stable_baselines3.common.vec_env import DummyVecEnv

from des_engine import (load_aero_config, load_abs_config,
                        generate_passengers, simulate)
from des_output import write_stats
from parse_iql_v2 import featurize_absconfig, _mmss_to_min, ALL_CHECKPOINTS
from iata_reward import IATA_LOS
from structural_decoder import (action_to_aeroconfig_structural,
                                 get_operational_stations)

# ═══════════════════════════════════════════════════════════════
# PATHS — edit these
# ═══════════════════════════════════════════════════════════════
ABS_CONFIG_DIR = r"path\to\Inputs\ABSConfigs"
BASELINE_PATH  = r"path\to\Inputs\baseline.json"
OUTPUT_DIR     = r"path\to\Outputs\ppo_v2_runs"

TOTAL_STEPS = 50_000
EVAL_EVERY  = 500
SEED        = 42

# ═══════════════════════════════════════════════════════════════
# LANE SCALING CONSTANTS  (from baseline inspection)
# PAX drives lane count — per-lane staffing stays fixed (1-3)
# ═══════════════════════════════════════════════════════════════
BASELINE_PAX = 200
PER_LANE_STAFF_RANGE = (1, 3)
PER_LANE_CAP = 30
MAX_LANES = 10
BASELINE_LANES = {
    "1ST-SEC": 3, "CHK-BAG": 5, "DIG-CHK": 3, "SLF-BAG": 3,
    "PAS-CHK": 2, "2ND-SEC": 2, "BRD-GAT": 1, "ARV-GAT": 1,
    "PAS-CTRL": 3, "BAG-CLM": 1, "EXIT-SEC": 3,
}

# ═══════════════════════════════════════════════════════════════
# OBSERVATION — 15-DIM SCHEDULE FEATURIZER
# ═══════════════════════════════════════════════════════════════

def schedule_to_obs(schedule: list) -> np.ndarray:
    """
    Convert a flight schedule to a 15-dim observation vector.

    Dims 0-6:  weighted ABS class proportions across all flights
    Dim  7:    total_pax / 2000          — demand scale
    Dim  8:    num_flights / 10          — schedule density
    Dim  9:    peak_pax / 1000           — busiest single flight
    Dim 10:    dep_pax / total_pax       — departure proportion
    Dim 11:    arr_pax / total_pax       — arrival proportion
    Dim 12:    first_flight_hour / 24    — time of day
    Dim 13:    unique_abs_count / 5      — passenger diversity
    Dim 14:    avg_pax_per_flight / 500  — average flight size
    """
    if not schedule:
        return np.zeros(15, dtype=np.float32)

    total_pax  = sum(f["pax_count"] for f in schedule)
    dep_pax    = sum(f["pax_count"] for f in schedule if f["flow"] == "departure")
    arr_pax    = sum(f["pax_count"] for f in schedule if f["flow"] == "arrival")
    peak_pax   = max(f["pax_count"] for f in schedule)
    first_hour = min(f["hour"] for f in schedule)
    unique_abs = len(set(f["abs_id"] for f in schedule))

    # PAX-weighted ABS class mix
    weighted = np.zeros(7, dtype=np.float32)
    for f in schedule:
        w = np.asarray(f["abs_weights"], dtype=np.float32)
        w = w / (w.sum() + 1e-9)
        weighted += w * (f["pax_count"] / max(total_pax, 1))
    weighted = weighted / (weighted.sum() + 1e-9)

    obs = np.concatenate([
        weighted,
        [total_pax  / 2000.0],
        [len(schedule) / 10.0],
        [peak_pax   / 1000.0],
        [dep_pax    / max(total_pax, 1)],
        [arr_pax    / max(total_pax, 1)],
        [first_hour / 24.0],
        [unique_abs / 5.0],
        [(total_pax / max(len(schedule), 1)) / 500.0],
    ]).astype(np.float32)

    return np.clip(obs, 0.0, 1.0)


# ═══════════════════════════════════════════════════════════════
# SCHEDULE SAMPLER
# ═══════════════════════════════════════════════════════════════

class ScheduleSampler:
    def __init__(self, abs_config_dir: str):
        self.abs_paths = sorted(
            Path(abs_config_dir).glob("absconfig_*.json"))
        if not self.abs_paths:
            raise FileNotFoundError(
                f"No absconfig_*.json found in {abs_config_dir}")
        self._weights_cache = {}
        for p in self.abs_paths:
            cfg = json.loads(p.read_text(encoding="utf-8-sig"))
            self._weights_cache[str(p)] = cfg["weights"]

    def sample(self, pax_range=(50, 500), flight_range=(1, 5)) -> list:
        num_flights = random.randint(*flight_range)
        schedule = []
        for i in range(num_flights):
            abs_path = random.choice(self.abs_paths)
            schedule.append({
                "flight_id":   i,
                "pax_count":   random.randint(*pax_range),
                "flow":        random.choice(["departure", "arrival"]),
                "hour":        random.randint(6, 22),
                "abs_path":    str(abs_path),
                "abs_id":      abs_path.stem,
                "abs_weights": self._weights_cache[str(abs_path)],
            })
        return schedule


# ═══════════════════════════════════════════════════════════════
# REWARD — DIRECT IATA COMPLIANCE (v2, no log normalization)
# ═══════════════════════════════════════════════════════════════

def compute_iata_reward_v2(stats: dict) -> tuple:
    """
    IATA 3-level reward: Optimum / Sub-Optimum / Over-Design.
    Near-green bonus for Sub-Optimum within 50% of the band.
    """
    per_ck = stats.get("per_checkpoint", {})
    if not per_ck:
        return -1000.0, {"compliance_rate": 0.0, "green": 0, "near_green": 0, "total": 0}

    total_bonus   = 0.0
    total_penalty = 0.0
    green = 0
    near_green = 0
    checked = 0

    for cid, data in per_ck.items():
        los = IATA_LOS.get(cid)
        if not los or not los.economy:
            continue
        
        p95 = data.get("p95", 0.0)
        lo, hi = los.economy
        checked += 1

        if lo <= p95 <= hi:
            # ── OPTIMUM (Green) ──
            total_bonus += 100.0
            green += 1

        elif p95 < lo:
            # ── OVER-DESIGN ──
            # Was too cheap. Now -10 to discourage waste.
            total_penalty += 10.0 * (lo - p95) / max(lo, 1e-6)

        else:
            # ── SUB-OPTIMUM ──
            if p95 <= hi * 1.5:
                # Near-green: within 50% above band. Partial credit.
                total_bonus += 20.0
                near_green += 1
            else:
                # Deep sub-optimum: far above band. Penalty.
                total_penalty += 15.0 * (p95 - hi) / max(hi, 1e-6)

    throughput_bonus = stats.get("total_throughput", 0) * 0.05
    completion_bonus = stats.get("completion_rate", 0) * 20.0
    raw = total_bonus - total_penalty + throughput_bonus + completion_bonus

    return raw, {
        "compliance_rate": green / max(checked, 1),
        "near_green_rate": near_green / max(checked, 1),
        "green": green,
        "near_green": near_green,
        "total_checked": checked,
        "completion": stats.get("completion_rate", 0),
    }


def compute_compliance_rate(stats: dict) -> float:
    per_ck = stats.get("per_checkpoint", {})
    green = total = 0
    for cid, d in per_ck.items():
        los = IATA_LOS.get(cid)
        if not los or not los.economy:
            continue
        total += 1
        lo, hi = los.economy
        if lo <= d.get("p95", 0) <= hi:
            green += 1
    return green / max(total, 1)


# ═══════════════════════════════════════════════════════════════
# ACTION SCALER — lane-based PAX sweep
# ═══════════════════════════════════════════════════════════════

def pax_to_lanes(pax_count: int, baseline_lanes: int,
                 rng: np.random.Generator) -> int:
    """PAX drives lane count. Per-lane staffing stays fixed."""
    scale  = pax_count / BASELINE_PAX
    factor = float(rng.uniform(0.7, 1.3))
    return int(np.clip(round(baseline_lanes * scale * factor), 1, MAX_LANES))


def build_action_scaler_v2(baseline_cfg: dict, n_samples: int = 500,
                            pax_range: tuple = (50, 500)) -> dict:
    """
    Build action scaler from variable-PAX lane-based sweep.

    Correct relationship: PAX → lanes → total staffing
    NOT: PAX → staffing per lane (which is fixed at 1-3)
    """
    print(f"Building v2 action scaler ({n_samples} samples, PAX {pax_range[0]}-{pax_range[1]})...")
    print(f"  Logic: PAX → open lanes, each lane has {PER_LANE_STAFF_RANGE} staff, cap {PER_LANE_CAP}")
    rng     = np.random.default_rng(42)
    actions = []
    from parse_iql_v2 import extract_action

    for i in range(n_samples):
        pax = int(rng.integers(pax_range[0], pax_range[1] + 1))
        cfg = copy.deepcopy(baseline_cfg)

        for flow in ("Departure", "Arrival"):
            for ck in cfg.get(flow, {}).get("Checkpoints", []):
                cid   = ck["Checkpoint_ID"]
                op_st = [s for s in ck["Stations"]
                         if s.get("Staffing_No", 0) > 0
                         or s.get("Avg_Service_Time", 0) > 0]
                if not op_st:
                    continue

                base_lanes   = BASELINE_LANES.get(cid, len(op_st))
                target_lanes = pax_to_lanes(pax, base_lanes, rng)

                # Adjust station count
                while len(ck["Stations"]) < target_lanes:
                    t = copy.deepcopy(op_st[0])
                    t["Station_ID"] = f"{op_st[0]['Station_ID']}_PAR{len(ck['Stations']):02d}"
                    ck["Stations"].append(t)
                if target_lanes < len(op_st):
                    ck["Stations"] = op_st[:target_lanes]

                # Per-lane staffing stays fixed
                for st in ck["Stations"]:
                    if st.get("Staffing_No", 0) > 0 or st.get("Avg_Service_Time", 0) > 0:
                        st["Staffing_No"]       = int(rng.integers(
                            PER_LANE_STAFF_RANGE[0], PER_LANE_STAFF_RANGE[1] + 1))
                        st["Max_Queue_Cap"]     = PER_LANE_CAP
                        st["Efficiency_Factor"] = round(float(rng.uniform(0.5, 1.0)), 2)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json",
                                          delete=False, encoding="utf-8") as f:
            json.dump(cfg, f)
            tmp = f.name
        try:
            a = extract_action(tmp)
            actions.append(a)
        except Exception:
            pass
        finally:
            os.unlink(tmp)

        if (i + 1) % 100 == 0:
            print(f"  {i+1}/{n_samples}")

    actions = np.stack(actions)
    a_min   = actions.min(axis=0)
    a_max   = actions.max(axis=0) * 1.1   # 10% headroom

    print(f"  num_stations range: [{a_min[0]:.0f}, {a_max[0]:.0f}]")
    print(f"  total_staffing range: [{a_min[1]:.1f}, {a_max[1]:.1f}]")
    print(f"  total_queue_cap range: [{a_min[2]:.0f}, {a_max[2]:.0f}]")
    return {"a_min": a_min.tolist(), "a_max": a_max.tolist()}


def load_action_scaler(path: str):
    sc      = json.loads(Path(path).read_text())
    a_min   = np.array(sc["a_min"], dtype=np.float32)
    a_max   = np.array(sc["a_max"], dtype=np.float32)
    a_range = np.where((a_max - a_min) > 1e-8, a_max - a_min, 1.0)
    return a_min, a_max, a_range


# ═══════════════════════════════════════════════════════════════
# SIMULATION — multi-flight aggregate (same pattern as v1)
# ═══════════════════════════════════════════════════════════════

def _seconds_to_mmss(secs: float) -> str:
    secs = max(0, int(round(secs)))
    return f"{secs // 60}:{secs % 60:02d}"


def run_schedule_in_memory(aero_dict: dict, schedule: list,
                            base_seed: int = 0) -> tuple:
    """
    Run all flights in a schedule through the same aeroconfig.
    Returns (stats_dict, records) compatible with compute_iata_reward_v2.
    Uses same temp-file approach as v1's run_sim_in_memory.
    """
    from parse_iql_v2 import parse_stats

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json",
                                      delete=False, encoding="utf-8") as f:
        json.dump(aero_dict, f)
        tmp_aero = f.name

    all_records = []
    try:
        flows = load_aero_config(tmp_aero)
        for fi, flight in enumerate(schedule):
            seed     = base_seed + fi * 10000
            profiles = load_abs_config(flight["abs_path"])
            for flow_idx, (flow_key, checkpoints) in enumerate(flows.items()):
                flow_seed  = seed + flow_idx * 1000
                passengers = generate_passengers(
                    profiles, flight["pax_count"], flow_seed)
                records    = simulate(checkpoints, passengers, flow_seed)
                all_records.extend(records)
    finally:
        os.unlink(tmp_aero)

    if not all_records:
        return {"per_checkpoint": {}, "completion_rate": 0.0,
                "total_throughput": 0}, []

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt",
                                      delete=False, encoding="utf-8") as f:
        tmp_stats = f.name
    write_stats(all_records, tmp_stats)
    stats = parse_stats(tmp_stats)
    os.unlink(tmp_stats)
    stats["total_throughput"] = len([r for r in all_records if r.exit_time > 0])
    return stats, all_records


# ═══════════════════════════════════════════════════════════════
# GYMNASIUM ENVIRONMENT (v2)
# ═══════════════════════════════════════════════════════════════

class AirportEnvV2(gymnasium.Env):
    """
    v2: 15-dim obs, variable PAX, multi-flight episodes, direct IATA reward.
    """
    metadata = {"render_modes": []}

    def __init__(self, sampler: ScheduleSampler, baseline_cfg: dict,
                 action_scaler: tuple, pax_range=(50, 500),
                 flight_range=(1, 5)):
        super().__init__()
        self.sampler      = sampler
        self.baseline_cfg = baseline_cfg
        self.a_min, self.a_max, self.a_range = action_scaler
        self.pax_range    = pax_range
        self.flight_range = flight_range
        self.episode      = 0
        self.schedule     = []

        self.observation_space = spaces.Box(0.0, 1.0, shape=(15,), dtype=np.float32)
        self.action_space      = spaces.Box(0.0, 1.0, shape=(52,), dtype=np.float32)

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.schedule = self.sampler.sample(
            pax_range=self.pax_range, flight_range=self.flight_range)
        self.episode += 1
        return schedule_to_obs(self.schedule), {}

    def step(self, action):
        action_clipped = np.clip(action, 0.0, 1.0)
        action_real    = action_clipped * self.a_range + self.a_min

        # Decode — continuous mode during training (no int rounding)
        aero_dict = action_to_aeroconfig_structural(
            action_norm  = action_clipped,
            action_real  = action_real,
            baseline_cfg = self.baseline_cfg,
            episode      = self.episode,
            continuous   = True,
        )

        try:
            stats, _ = run_schedule_in_memory(
                aero_dict, self.schedule, base_seed=self.episode * 100)
            raw_reward, info = compute_iata_reward_v2(stats)
        except Exception as e:
            raw_reward = -1000.0
            info       = {"compliance_rate": 0.0, "error": str(e)}

        # Linear normalisation — no log (preserves per-checkpoint shaping)
        norm_reward = raw_reward / 100.0

        # Next episode: fresh schedule
        self.schedule = self.sampler.sample(
            pax_range=self.pax_range, flight_range=self.flight_range)
        next_obs = schedule_to_obs(self.schedule)

        return next_obs, norm_reward, True, False, {
            "raw_reward":      raw_reward,
            "compliance_rate": info.get("compliance_rate", 0.0),
            "green":           info.get("green", 0),
            "total_pax":       sum(f["pax_count"] for f in self.schedule),
        }


# ═══════════════════════════════════════════════════════════════
# BEHAVIOR CLONING WARM-START (adapted from v1)
# No IQL — uses a linear scaling baseline policy instead.
# For each obs, target action = scale staffing/cap with total_pax.
# ═══════════════════════════════════════════════════════════════

def build_linear_baseline_targets(sampler, a_min, a_range,
                                   n_obs=50, pax_range=(50, 500)) -> tuple:
    """
    Generate (obs, target_action) pairs for behavior cloning warm-start.
    Target action: linearly scaled from baseline proportional to PAX.
    This gives PPO a sensible starting point without IQL dependency.
    """
    from parse_iql_v2 import extract_action

    obs_list, action_list = [], []
    rng = np.random.default_rng(0)

    for _ in range(n_obs):
        schedule = sampler.sample(pax_range=pax_range, flight_range=(1, 3))
        obs      = schedule_to_obs(schedule)
        total_pax = sum(f["pax_count"] for f in schedule)

        # Linear scale factor: how much bigger than baseline
        scale = total_pax / (BASELINE_PAX * len(schedule))
        scale = float(np.clip(scale, 0.5, 3.0))

        # Build a scaled aeroconfig, extract action vector
        baseline_cfg = json.loads(
            Path(BASELINE_PATH).read_text(encoding="utf-8-sig"))
        for flow in ("Departure", "Arrival"):
            for ck in baseline_cfg.get(flow, {}).get("Checkpoints", []):
                cid       = ck["Checkpoint_ID"]
                base_l    = BASELINE_LANES.get(cid, 2)
                target_l  = int(np.clip(round(base_l * scale), 1, MAX_LANES))
                op_st     = [s for s in ck["Stations"]
                             if s.get("Staffing_No", 0) > 0
                             or s.get("Avg_Service_Time", 0) > 0]
                while len(ck["Stations"]) < target_l:
                    t = copy.deepcopy(op_st[0] if op_st else ck["Stations"][0])
                    t["Station_ID"] = f"{t['Station_ID']}_PAR{len(ck['Stations']):02d}"
                    ck["Stations"].append(t)
                if target_l < len(op_st):
                    ck["Stations"] = op_st[:target_l]
                for st in ck["Stations"]:
                    if st.get("Staffing_No", 0) > 0:
                        st["Staffing_No"]   = int(rng.integers(1, 3))
                        st["Max_Queue_Cap"] = PER_LANE_CAP

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json",
                                          delete=False, encoding="utf-8") as f:
            json.dump(baseline_cfg, f)
            tmp = f.name
        try:
            a_real = extract_action(tmp).astype(np.float32)
            # Normalise to [0,1]
            a_norm = np.clip((a_real - a_min) / a_range, 0.0, 1.0)
            obs_list.append(obs)
            action_list.append(a_norm)
        except Exception:
            pass
        finally:
            os.unlink(tmp)

    return np.stack(obs_list), np.stack(action_list)


def warm_start_ppo_linear(ppo_model, sampler, a_min, a_range,
                           device, steps=150):
    """
    Behavior-clone PPO to a linear PAX-scaling baseline.
    Mirrors v1's warm_start_ppo_from_iql but uses the linear baseline
    instead of IQL (IQL is incompatible with 15-dim obs).
    """
    print("\nBuilding linear baseline warm-start targets...")
    obs_np, act_np = build_linear_baseline_targets(
        sampler, a_min, a_range, n_obs=50)

    obs_tensor = torch.tensor(obs_np, device=device)
    tgt_tensor = torch.tensor(act_np, device=device)
    print(f"  Target action range: [{tgt_tensor.min():.3f}, {tgt_tensor.max():.3f}]")

    ppo_policy = ppo_model.policy
    params     = (list(ppo_policy.mlp_extractor.policy_net.parameters()) +
                  list(ppo_policy.action_net.parameters()))
    optimizer  = torch.optim.Adam(params, lr=1e-3)

    for step in range(steps):
        features       = ppo_policy.extract_features(obs_tensor)
        latent_pi, _   = ppo_policy.mlp_extractor(features)
        pred_actions   = ppo_policy.action_net(latent_pi)
        loss           = F.mse_loss(pred_actions, tgt_tensor)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        if step % 30 == 0:
            print(f"  BC step {step:>3}: MSE = {loss.item():.6f}")

    with torch.no_grad():
        if hasattr(ppo_policy, "log_std"):
            ppo_policy.log_std.fill_(-1.0)
            print("  log_std reset to -1.0 (std≈0.37)")
        features     = ppo_policy.extract_features(obs_tensor)
        latent_pi, _ = ppo_policy.mlp_extractor(features)
        pred         = ppo_policy.action_net(latent_pi)
        final_mse    = F.mse_loss(pred, tgt_tensor).item()
        print(f"  Final BC MSE: {final_mse:.6f}  (should be <0.01)")
        print(f"  PPO pred range: [{pred.min():.3f}, {pred.max():.3f}]")

    return ppo_model


# ═══════════════════════════════════════════════════════════════
# EVALUATION CALLBACK (v2)
# ═══════════════════════════════════════════════════════════════

# Fixed test schedules evaluated consistently at each eval step
def _make_test_schedules(abs_paths, weights_cache):
    p = str(abs_paths[0])
    w = weights_cache[p]
    def fl(i, pax, flow, hour):
        return {"flight_id": i, "pax_count": pax, "flow": flow,
                "hour": hour, "abs_path": p, "abs_id": abs_paths[0].stem,
                "abs_weights": w}
    return [
        [fl(0, 100, "departure", 9)],
        [fl(0, 200, "departure", 10), fl(1, 200, "arrival", 11)],
        [fl(i, 400, "departure" if i%2==0 else "arrival", 7+i) for i in range(4)],
        [fl(i, 500, "departure", 8) for i in range(5)],
    ]

TEST_LABELS = ["small(1×100)", "med(2×200)", "large(4×400)", "rush(5×500)"]


class EvalCallbackV2(BaseCallback):
    def __init__(self, baseline_cfg, action_scaler, sampler,
                 eval_every, output_dir, verbose=1):
        super().__init__(verbose)
        self.baseline_cfg    = baseline_cfg
        self.a_min, self.a_max, self.a_range = action_scaler
        self.sampler         = sampler
        self.eval_every      = eval_every
        self.output_dir      = Path(output_dir)
        self.best_compliance = -np.inf
        self.eval_results    = []
        self._test_schedules = _make_test_schedules(
            sampler.abs_paths, sampler._weights_cache)

    def _on_step(self):
        if self.n_calls % self.eval_every != 0:
            return True

        print(f"\n{'─'*68}")
        print(f"  EVALUATION @ step {self.n_calls}")
        print(f"{'─'*68}")
        print(f"  {'Schedule':<16} {'PAX':>5} {'Compliance':>12} "
              f"{'Raw Reward':>12} {'Green/Total':>12}")

        compliance_list, reward_list = [], []

        for si, schedule in enumerate(self._test_schedules):
            obs      = schedule_to_obs(schedule)
            act, _   = self.model.predict(obs[None, :], deterministic=True)
            act_real = np.clip(act[0], 0.0, 1.0) * self.a_range + self.a_min

            aero = action_to_aeroconfig_structural(
                action_norm  = np.clip(act[0], 0.0, 1.0),
                action_real  = act_real,
                baseline_cfg = self.baseline_cfg,
                episode      = 9000 + si,
                continuous   = False,   # round for real sim
            )
            try:
                stats, _ = run_schedule_in_memory(aero, schedule, 9000 + si)
                raw, info = compute_iata_reward_v2(stats)
                comp  = info["compliance_rate"]
                green = info["green"]
                total = info["total_checked"]
            except Exception as e:
                raw, comp, green, total = -1000.0, 0.0, 0, 0

            pax = sum(f["pax_count"] for f in schedule)
            lbl = TEST_LABELS[si] if si < len(TEST_LABELS) else f"sched_{si}"
            compliance_list.append(comp)
            reward_list.append(raw)
            print(f"  {lbl:<16} {pax:>5} {comp:>12.1%} "
                  f"{raw:>12.1f} {green:>5}/{total:<6}")

        mean_comp   = float(np.mean(compliance_list))
        mean_reward = float(np.mean(reward_list))
        print(f"  {'MEAN':<16} {'':>5} {mean_comp:>12.1%} {mean_reward:>12.1f}")
        print(f"\n  Target: >90% compliance  |  Current best: {self.best_compliance:.1%}")
        print(f"{'─'*68}")

        if mean_comp > self.best_compliance:
            self.best_compliance = mean_comp
            self.model.save(str(self.output_dir / "ppo_v2_best"))
            print(f"  ★ New best ({mean_comp:.1%}) saved")

        self.eval_results.append({
            "step": self.n_calls,
            "mean_compliance": mean_comp,
            "mean_reward":     mean_reward,
        })
        (self.output_dir / "eval_log_v2.json").write_text(
            json.dumps(self.eval_results, indent=2))
        return True


# ═══════════════════════════════════════════════════════════════
# EARLY STOP (compliance-based)
# ═══════════════════════════════════════════════════════════════
class SmartEarlyStop(BaseCallback):
    def __init__(self, output_dir, patience_ev=20, patience_comp=20,
                 ev_threshold=0.30, eval_every=500):
        super().__init__()
        self.output_dir    = Path(output_dir)
        self.patience_ev   = patience_ev
        self.patience_comp = patience_comp
        self.ev_threshold  = ev_threshold
        self.eval_every    = eval_every
        self.best_ev       = -np.inf
        self.best_comp     = -np.inf
        self.no_improve_ev = 0
        self.no_improve_comp = 0
        self.phase         = 1

    def _on_step(self):
        if self.n_calls % self.eval_every != 0:
            return True

        logger = self.model.logger.name_to_value
        ev = logger.get("train/explained_variance", -1.0)

        eval_path = self.output_dir / "eval_log_v2.json"
        comp = 0.0
        if eval_path.exists():
            results = json.loads(eval_path.read_text())
            if results:
                comp = results[-1]["mean_compliance"]

        if self.phase == 1:
            if ev > self.best_ev + 0.01:
                self.best_ev = ev
                self.no_improve_ev = 0
            else:
                self.no_improve_ev += 1

            print(f"  [EarlyStop-Phase1] EV={ev:.3f} (target>{self.ev_threshold})  "
                  f"no_improve={self.no_improve_ev}/{self.patience_ev}")

            if ev >= self.ev_threshold:
                self.phase = 2
                self.best_comp = comp
                print(f"\n>>> PHASE 2 UNLOCKED: Critic healthy (EV={ev:.3f}). "
                      f"Now monitoring compliance.")
                return True

            if self.no_improve_ev >= self.patience_ev:
                print(f"\nEarly stop: Critic rescue failed. EV stuck at {ev:.3f}")
                return False
            return True

        if comp > self.best_comp + 0.01:
            self.best_comp = comp
            self.no_improve_comp = 0
        else:
            self.no_improve_comp += 1

        print(f"  [EarlyStop-Phase2] Comp={comp:.1%}  "
              f"no_improve={self.no_improve_comp}/{self.patience_comp}")

        if self.no_improve_comp >= self.patience_comp:
            print(f"\nEarly stop: Compliance stuck at {comp:.1%}")
            return False
        return True 
    
# ═══════════════════════════════════════════════════════════════
# VFCoef SCHEDULER (gradually decrease value function weight during training)
# ═══════════════════════════════════════════════════════════════

class VfCoefScheduler(BaseCallback):
    def __init__(self, drop_steps: list, drop_values: list, verbose=0):
        super().__init__(verbose)
        self.drop_steps = drop_steps
        self.drop_values = drop_values
        self.phase = 0

    def _on_step(self):
        if self.phase < len(self.drop_steps):
            if self.n_calls >= self.drop_steps[self.phase]:
                old = self.model.vf_coef
                self.model.vf_coef = self.drop_values[self.phase]
                print(f"\n[Scheduler] Step {self.n_calls}: vf_coef {old} → {self.model.vf_coef}")
                self.phase += 1
        return True


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def main():
    out_dir = Path(OUTPUT_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)

    baseline_cfg = json.loads(
        Path(BASELINE_PATH).read_text(encoding="utf-8-sig"))

    sampler   = ScheduleSampler(ABS_CONFIG_DIR)
    abs_paths = sampler.abs_paths
    print(f"Found {len(abs_paths)} abs configs: {[p.name for p in abs_paths]}")

    # Build or load v2 action scaler
    scaler_path = out_dir / "action_scaler_v2.json"
    if scaler_path.exists():
        print(f"Loading existing v2 action scaler...")
        action_scaler = load_action_scaler(str(scaler_path))
    else:
        scaler_dict = build_action_scaler_v2(
            baseline_cfg, n_samples=500, pax_range=(50, 500))
        scaler_path.write_text(json.dumps(scaler_dict, indent=2))
        action_scaler = load_action_scaler(str(scaler_path))
    a_min, a_max, a_range = action_scaler

    # Build environment
    def make_env():
        return AirportEnvV2(
            sampler        = sampler,
            baseline_cfg   = baseline_cfg,
            action_scaler  = action_scaler,
            pax_range      = (50, 500),
            flight_range   = (1, 5),
        )
    env = DummyVecEnv([make_env])

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    print(f"\nTraining on {device}")

    # PPO — separate pi/vf sizes as in v1 (proven to help value function)
    ppo = PPO(
        policy        = "MlpPolicy",
        env           = env,
        learning_rate = get_linear_fn(3e-4, 1e-5, 1.0),   # was 3e-4 → 10× lower
        n_steps       = 512,
        batch_size    = 128,
        n_epochs      = 2,
        gamma         = 0.99,
        ent_coef      = 0.02,                              
        clip_range    = 0.3,   
        vf_coef       = 1.0,
        policy_kwargs = dict(net_arch=dict(pi=[128, 128], vf=[256, 256])),
        verbose       = 1,
        seed          = SEED,
        device        = device,
    )

    # Behavior cloning warm-start (linear baseline, no IQL dependency)
    #ppo = warm_start_ppo_linear(ppo, sampler, a_min, a_range, device=device)

    # Post-warm-start gate (from v1 — fail fast if BC failed)
    test_sched = [{"flight_id": 0, "pax_count": 200, "flow": "departure",
                   "hour": 9, "abs_path": str(abs_paths[0]),
                   "abs_id": abs_paths[0].stem,
                   "abs_weights": sampler._weights_cache[str(abs_paths[0])]}]
    test_obs   = schedule_to_obs(test_sched)
    test_act, _ = ppo.predict(test_obs[None, :], deterministic=True)
    test_real   = np.clip(test_act[0], 0.0, 1.0) * a_range + a_min
    test_aero   = action_to_aeroconfig_structural(
        action_norm=np.clip(test_act[0], 0.0, 1.0),
        action_real=test_real, baseline_cfg=baseline_cfg,
        episode=9999, continuous=False)
    test_stats, _ = run_schedule_in_memory(test_aero, test_sched, 9999)
    test_raw, test_info = compute_iata_reward_v2(test_stats)
    print(f"\n>>> POST-WARM-START CHECK: raw={test_raw:.1f}  "
          f"compliance={test_info['compliance_rate']:.1%}")
    print(f">>> If raw < -900, warm-start may have failed (random policy).")
    if test_raw < -900:
        print("WARNING: Policy looks random. Continuing anyway — "
              "linear baseline BC may need more steps.")

    # Callbacks
    eval_cb    = EvalCallbackV2(
        baseline_cfg  = baseline_cfg,
        action_scaler = action_scaler,
        sampler       = sampler,
        eval_every    = EVAL_EVERY,
        output_dir    = out_dir,
    )
    early_stop = SmartEarlyStop(
        output_dir    = out_dir,
        patience_ev   = 20,
        patience_comp = 20,
        ev_threshold  = 0.30,
        eval_every    = EVAL_EVERY,
    )
    vf_sched   = VfCoefScheduler(
        drop_steps  = [8000, 18000],
        drop_values = [0.5, 0.25],
    )


    print(f"\nStarting PPO v2 training — {TOTAL_STEPS} steps")
    print(f"  Obs:     15-dim (7 ABS weights + PAX scale + schedule shape)")
    print(f"  Action:  52-dim (13 checkpoints × 4 features)")
    print(f"  Reward:  direct IATA compliance +50/green, -25/under, /100")
    print(f"  PAX:     variable 50–500/flight, 1–5 flights/episode")
    print(f"  Scaling: PAX → lanes (1-10), per-lane staff 1-3, cap {PER_LANE_CAP}")
    print(f"  Metric:  compliance rate — target >90%")
    print()

    t0 = time.time()
    ppo.learn(
        total_timesteps = TOTAL_STEPS,
        callback        = CallbackList([eval_cb, early_stop, vf_sched]),
        progress_bar    = True,
    )
    elapsed = time.time() - t0

    print(f"\nTraining complete in {elapsed/60:.1f} minutes")
    print(f"Best compliance: {eval_cb.best_compliance:.1%}")

    ppo.save(str(out_dir / "ppo_v2_final"))
    print(f"Final model saved: {out_dir / 'ppo_v2_final'}")


if __name__ == "__main__":
    main()
