#FineTuning

"""
fine_tune_v2.py — Load ppo_v2_best and converge with lower entropy.
"""
import json
import time
from pathlib import Path

import numpy as np
import torch
import gymnasium
from gymnasium import spaces
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback, CallbackList
from stable_baselines3.common.vec_env import DummyVecEnv

# ── Your project modules (same as train_ppo_v2) ──
from des_engine import load_aero_config, load_abs_config, generate_passengers, simulate
from des_output import write_stats
from parse_iql_v2 import featurize_absconfig, _mmss_to_min, ALL_CHECKPOINTS
from iata_reward import IATA_LOS
from structural_decoder import action_to_aeroconfig_structural, get_operational_stations

# ═══════════════════════════════════════════════════════════════
# PATHS — same as your train script
# ═══════════════════════════════════════════════════════════════
ABS_CONFIG_DIR = r"/content/drive/MyDrive/Aerotwin_old/Inputs/ABSConfigs"
BASELINE_PATH  = r"/content/drive/MyDrive/Aerotwin_old/Inputs/baseline.json"
OUTPUT_DIR     = r"/content/drive/MyDrive/Aerotwin_old/Outputs/ppo_v2_runs"

# ═══════════════════════════════════════════════════════════════
# CONSTANTS
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
# OBSERVATION
# ═══════════════════════════════════════════════════════════════
def schedule_to_obs(schedule: list) -> np.ndarray:
    if not schedule:
        return np.zeros(15, dtype=np.float32)
    total_pax  = sum(f["pax_count"] for f in schedule)
    dep_pax    = sum(f["pax_count"] for f in schedule if f["flow"] == "departure")
    arr_pax    = sum(f["pax_count"] for f in schedule if f["flow"] == "arrival")
    peak_pax   = max(f["pax_count"] for f in schedule)
    first_hour = min(f["hour"] for f in schedule)
    unique_abs = len(set(f["abs_id"] for f in schedule))
    weighted = np.zeros(7, dtype=np.float32)
    for f in schedule:
        w = np.asarray(f["abs_weights"], dtype=np.float32)
        w = w / (w.sum() + 1e-9)
        weighted += w * (f["pax_count"] / max(total_pax, 1))
    weighted = weighted / (weighted.sum() + 1e-9)
    obs = np.concatenate([
        weighted,
        [total_pax / 2000.0],
        [len(schedule) / 10.0],
        [peak_pax / 1000.0],
        [dep_pax / max(total_pax, 1)],
        [arr_pax / max(total_pax, 1)],
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
        self.abs_paths = sorted(Path(abs_config_dir).glob("absconfig_*.json"))
        if not self.abs_paths:
            raise FileNotFoundError(f"No absconfig found in {abs_config_dir}")
        self._weights_cache = {}
        for p in self.abs_paths:
            cfg = json.loads(p.read_text(encoding="utf-8-sig"))
            self._weights_cache[str(p)] = cfg["weights"]

    def sample(self, pax_range=(50, 500), flight_range=(1, 5)) -> list:
        num_flights = np.random.randint(*flight_range)
        schedule = []
        for i in range(num_flights):
            abs_path = str(np.random.choice(self.abs_paths))
            schedule.append({
                "flight_id": i, "pax_count": int(np.random.randint(*pax_range)),
                "flow": np.random.choice(["departure", "arrival"]),
                "hour": int(np.random.randint(6, 22)), "abs_path": abs_path,
                "abs_id": Path(abs_path).stem,
                "abs_weights": self._weights_cache[abs_path],
            })
        return schedule

# ═══════════════════════════════════════════════════════════════
# REWARD
# ═══════════════════════════════════════════════════════════════
def compute_iata_reward_v2(stats: dict) -> tuple:
    per_ck = stats.get("per_checkpoint", {})
    if not per_ck:
        return -1000.0, {"compliance_rate": 0.0, "green": 0, "near_green": 0, "total": 0}
    total_bonus = total_penalty = 0.0
    green = near_green = checked = 0
    for cid, data in per_ck.items():
        los = IATA_LOS.get(cid)
        if not los or not los.economy:
            continue
        p95 = data.get("p95", 0.0)
        lo, hi = los.economy
        checked += 1
        if lo <= p95 <= hi:
            total_bonus += 200.0
            green += 1
        elif p95 < lo:
            total_penalty += 10.0 * (lo - p95) / max(lo, 1e-6)
        else:
            if p95 <= hi * 1.5:
                total_bonus += 5.0
                near_green += 1
            else:
                total_penalty += 15.0 * (p95 - hi) / max(hi, 1e-6)
    raw = total_bonus - total_penalty \
          + stats.get("total_throughput", 0) * 0.05 \
          + stats.get("completion_rate", 0) * 20.0
    return raw, {
        "compliance_rate": green / max(checked, 1),
        "near_green_rate": near_green / max(checked, 1),
        "green": green, "near_green": near_green,
        "total_checked": checked, "completion": stats.get("completion_rate", 0),
    }

# ═══════════════════════════════════════════════════════════════
# SCALER
# ═══════════════════════════════════════════════════════════════
def load_action_scaler(path: str):
    sc = json.loads(Path(path).read_text())
    a_min = np.array(sc["a_min"], dtype=np.float32)
    a_max = np.array(sc["a_max"], dtype=np.float32)
    a_range = np.where((a_max - a_min) > 1e-8, a_max - a_min, 1.0)
    return a_min, a_max, a_range

# ═══════════════════════════════════════════════════════════════
# SIMULATION
# ═══════════════════════════════════════════════════════════════
import tempfile
def run_schedule_in_memory(aero_dict: dict, schedule: list, base_seed: int = 0):
    from parse_iql_v2 import parse_stats
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(aero_dict, f); tmp_aero = f.name
    all_records = []
    try:
        flows = load_aero_config(tmp_aero)
        for fi, flight in enumerate(schedule):
            seed = base_seed + fi * 10000
            profiles = load_abs_config(flight["abs_path"])
            for flow_idx, (flow_key, checkpoints) in enumerate(flows.items()):
                flow_seed = seed + flow_idx * 1000
                passengers = generate_passengers(profiles, flight["pax_count"], flow_seed)
                records = simulate(checkpoints, passengers, flow_seed)
                all_records.extend(records)
    finally:
        import os; os.unlink(tmp_aero)
    if not all_records:
        return {"per_checkpoint": {}, "completion_rate": 0.0, "total_throughput": 0}, []
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
        tmp_stats = f.name
    write_stats(all_records, tmp_stats)
    stats = parse_stats(tmp_stats)
    import os; os.unlink(tmp_stats)
    stats["total_throughput"] = len([r for r in all_records if r.exit_time > 0])
    return stats, all_records

# ═══════════════════════════════════════════════════════════════
# ENVIRONMENT
# ═══════════════════════════════════════════════════════════════
class AirportEnvV2(gymnasium.Env):
    metadata = {"render_modes": []}
    def __init__(self, sampler, baseline_cfg, action_scaler, pax_range=(50,500), flight_range=(1,5)):
        super().__init__()
        self.sampler = sampler; self.baseline_cfg = baseline_cfg
        self.a_min, self.a_max, self.a_range = action_scaler
        self.pax_range = pax_range; self.flight_range = flight_range
        self.episode = 0; self.schedule = []
        self.observation_space = spaces.Box(0.0, 1.0, shape=(15,), dtype=np.float32)
        self.action_space = spaces.Box(0.0, 1.0, shape=(52,), dtype=np.float32)

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.schedule = self.sampler.sample(self.pax_range, self.flight_range)
        self.episode += 1
        return schedule_to_obs(self.schedule), {}

    def step(self, action):
        action_clipped = np.clip(action, 0.0, 1.0)
        action_real = action_clipped * self.a_range + self.a_min
        aero_dict = action_to_aeroconfig_structural(
            action_norm=action_clipped, action_real=action_real,
            baseline_cfg=self.baseline_cfg, episode=self.episode, continuous=True)
        try:
            stats, _ = run_schedule_in_memory(aero_dict, self.schedule, self.episode * 100)
            raw_reward, info = compute_iata_reward_v2(stats)
        except Exception:
            raw_reward = -1000.0
            info = {"compliance_rate": 0.0}
        norm_reward = raw_reward / 100.0
        self.schedule = self.sampler.sample(self.pax_range, self.flight_range)
        return schedule_to_obs(self.schedule), norm_reward, True, False, {
            "raw_reward": raw_reward, "compliance_rate": info.get("compliance_rate", 0.0),
            "green": info.get("green", 0), "total_pax": sum(f["pax_count"] for f in self.schedule),
        }

# ═══════════════════════════════════════════════════════════════
# CALLBACKS
# ═══════════════════════════════════════════════════════════════
def _make_test_schedules(abs_paths, weights_cache):
    p = str(abs_paths[0]); w = weights_cache[p]
    def fl(i, pax, flow, hour):
        return {"flight_id": i, "pax_count": pax, "flow": flow, "hour": hour,
                "abs_path": p, "abs_id": abs_paths[0].stem, "abs_weights": w}
    return [
        [fl(0, 100, "departure", 9)],
        [fl(0, 200, "departure", 10), fl(1, 200, "arrival", 11)],
        [fl(i, 400, "departure" if i%2==0 else "arrival", 7+i) for i in range(4)],
        [fl(i, 500, "departure", 8) for i in range(5)],
    ]
TEST_LABELS = ["small(1×100)", "med(2×200)", "large(4×400)", "rush(5×500)"]

class EvalCallbackV2(BaseCallback):
    def __init__(self, baseline_cfg, action_scaler, sampler, eval_every, output_dir, verbose=1):
        super().__init__(verbose)
        self.baseline_cfg = baseline_cfg
        self.a_min, self.a_max, self.a_range = action_scaler
        self.sampler = sampler; self.eval_every = eval_every
        self.output_dir = Path(output_dir); self.best_compliance = -np.inf
        self.eval_results = []
        self._test_schedules = _make_test_schedules(sampler.abs_paths, sampler._weights_cache)

    def _on_step(self):
        if self.n_calls % self.eval_every != 0:
            return True
        print(f"\n{'─'*68}\n  EVALUATION @ step {self.n_calls}\n{'─'*68}")
        print(f"  {'Schedule':<<16} {'PAX':>5} {'Compliance':>12} {'Raw Reward':>12} {'Green/Total':>12}")
        compliance_list, reward_list = [], []
        for si, schedule in enumerate(self._test_schedules):
            obs = schedule_to_obs(schedule)
            act, _ = self.model.predict(obs[None, :], deterministic=True)
            act_real = np.clip(act[0], 0.0, 1.0) * self.a_range + self.a_min
            aero = action_to_aeroconfig_structural(
                np.clip(act[0], 0.0, 1.0), act_real, self.baseline_cfg, 9000+si, False)
            try:
                stats, _ = run_schedule_in_memory(aero, schedule, 9000+si)
                raw, info = compute_iata_reward_v2(stats)
                comp, green, total = info["compliance_rate"], info["green"], info["total_checked"]
            except Exception:
                raw, comp, green, total = -1000.0, 0.0, 0, 0
            pax = sum(f["pax_count"] for f in schedule)
            lbl = TEST_LABELS[si] if si < len(TEST_LABELS) else f"sched_{si}"
            compliance_list.append(comp); reward_list.append(raw)
            print(f"  {lbl:<16} {pax:>5} {comp:>12.1%} {raw:>12.1f} {green:>5}/{total:<6}")
        mean_comp = float(np.mean(compliance_list))
        mean_reward = float(np.mean(reward_list))
        print(f"  {'MEAN':<<16} {'':>5} {mean_comp:>12.1%} {mean_reward:>12.1f}")
        print(f"\n  Target: >90% compliance  |  Current best: {self.best_compliance:.1%}\n{'─'*68}")
        if mean_comp > self.best_compliance:
            self.best_compliance = mean_comp
            self.model.save(str(self.output_dir / "ppo_v2_finetune_best"))
            print(f"  ★ New best ({mean_comp:.1%}) saved")
        self.eval_results.append({"step": self.n_calls, "mean_compliance": mean_comp, "mean_reward": mean_reward})
        (self.output_dir / "eval_log_finetune.json").write_text(json.dumps(self.eval_results, indent=2))
        return True

class SmartEarlyStop(BaseCallback):
    def __init__(self, output_dir, patience_ev=30, patience_comp=30, ev_threshold=0.30, eval_every=500):
        super().__init__()
        self.output_dir = Path(output_dir); self.patience_ev = patience_ev
        self.patience_comp = patience_comp; self.ev_threshold = ev_threshold
        self.eval_every = eval_every
        self.best_ev = -np.inf; self.best_comp = -np.inf
        self.no_improve_ev = 0; self.no_improve_comp = 0; self.phase = 1

    def _on_step(self):
        if self.n_calls % self.eval_every != 0:
            return True
        logger = self.model.logger.name_to_value
        ev = logger.get("train/explained_variance", -1.0)
        eval_path = self.output_dir / "eval_log_finetune.json"
        comp = 0.0
        if eval_path.exists():
            results = json.loads(eval_path.read_text())
            if results: comp = results[-1]["mean_compliance"]
        if self.phase == 1:
            if ev > self.best_ev + 0.01:
                self.best_ev = ev; self.no_improve_ev = 0
            else:
                self.no_improve_ev += 1
            print(f"  [EarlyStop-Phase1] EV={ev:.3f} (target>{self.ev_threshold})  no_improve={self.no_improve_ev}/{self.patience_ev}")
            if ev >= self.ev_threshold:
                self.phase = 2; self.best_comp = comp
                print(f"\n>>> PHASE 2 UNLOCKED: Critic healthy (EV={ev:.3f}). Now monitoring compliance.")
                return True
            if self.no_improve_ev >= self.patience_ev:
                print(f"\nEarly stop: Critic rescue failed. EV stuck at {ev:.3f}")
                return False
            return True
        if comp > self.best_comp + 0.01:
            self.best_comp = comp; self.no_improve_comp = 0
        else:
            self.no_improve_comp += 1
        print(f"  [EarlyStop-Phase2] Comp={comp:.1%}  no_improve={self.no_improve_comp}/{self.patience_comp}")
        if self.no_improve_comp >= self.patience_comp:
            print(f"\nEarly stop: Compliance stuck at {comp:.1%}")
            return False
        return True

class VfCoefScheduler(BaseCallback):
    def __init__(self, drop_steps, drop_values, verbose=0):
        super().__init__(verbose); self.drop_steps = drop_steps; self.drop_values = drop_values; self.phase = 0
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
    ft_dir = out_dir / "fine_tune"
    ft_dir.mkdir(exist_ok=True)

    baseline_cfg = json.loads(Path(BASELINE_PATH).read_text(encoding="utf-8-sig"))
    sampler = ScheduleSampler(ABS_CONFIG_DIR)
    abs_paths = sampler.abs_paths
    print(f"Found {len(abs_paths)} abs configs")

    # Load existing 52-dim scaler
    scaler_path = out_dir / "action_scaler_v2.json"
    action_scaler = load_action_scaler(str(scaler_path))
    a_min, a_max, a_range = action_scaler

    def make_env():
        return AirportEnvV2(sampler, baseline_cfg, action_scaler, (50,500), (1,5))
    env = DummyVecEnv([make_env])

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    print(f"\nTraining on {device}")

    # ═══════════════════════════════════════════════════════════════
    # LOAD BEST CHECKPOINT (36.4%)
    # ═══════════════════════════════════════════════════════════════
    best_path = out_dir / "ppo_v2_best.zip"
    if not best_path.exists():
     # Also try without extension (SB3 sometimes saves folders)
        best_path = out_dir / "ppo_v2_best"
        if not best_path.exists():
               raise FileNotFoundError(f"No checkpoint at {out_dir / 'ppo_v2_best(.zip)'}. Run train first.")

    print(f"\n>>> Loading {best_path} (36.4% discovery)")
    ppo = PPO.load(str(best_path), env=env, device=device)

    # ═══════════════════════════════════════════════════════════════
    # PATCH FOR CONVERGENCE
    # ═══════════════════════════════════════════════════════════════
    ppo.ent_coef   = 0.005           # float is fine for ent_coef
    ppo.clip_range = lambda _: 0.2   # MUST be callable
    ppo.vf_coef    = 0.75            # float is fine for vf_coef

    # Reset LR
    for g in ppo.policy.optimizer.param_groups:
        g['lr'] = 3e-4

    print(f"  Patched: ent_coef={ppo.ent_coef}, clip_range={ppo.clip_range}, vf_coef={ppo.vf_coef}, lr=3e-4")

    # Callbacks
    eval_cb = EvalCallbackV2(baseline_cfg, action_scaler, sampler, 500, ft_dir)
    early_stop = SmartEarlyStop(ft_dir, 30, 30, 0.30, 500)
    vf_sched = VfCoefScheduler([15000], [0.25])

    print(f"\n>>> Fine-tuning from 36.4% — 50000 steps")
    print(f"    Logs: {ft_dir}/eval_log_finetune.json")
    print(f"    Best: {ft_dir}/ppo_v2_finetune_best")

    t0 = time.time()
    ppo.learn(
        total_timesteps=50000,
        callback=CallbackList([eval_cb, early_stop, vf_sched]),
        reset_num_timesteps=False,
    )
    elapsed = time.time() - t0

    print(f"\nFine-tune complete in {elapsed/60:.1f} minutes")
    print(f"Best compliance: {eval_cb.best_compliance:.1%}")

    ppo.save(str(ft_dir / "ppo_v2_finetune_final"))
    print(f"Final model saved: {ft_dir / 'ppo_v2_finetune_final'}")

if __name__ == "__main__":
    main()