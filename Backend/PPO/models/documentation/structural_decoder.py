"""
structural_decoder.py  (v2 — lane-based, 52-dim)

Converts a 52-dim PPO action vector (13 checkpoints × 4 features) into a
full aeroconfig dict.

The 4 features per checkpoint:
    0: num_lanes      (how many parallel stations to open)
    1: staff_per_lane (staffing count per station)
    2: cap_per_lane   (Max_Queue_Cap per station)
    3: efficiency     (Efficiency_Factor, uniform across lanes)

Avg_Service_Time is NOT set by the agent — it is calculated from the
station's task list so the simulation physics remain consistent.
"""
import copy
import json
import numpy as np
from pathlib import Path

from parse_iql_v2 import ALL_CHECKPOINTS

FEATURES_PER_CK = 4


# ─────────────────────── STATION HELPERS ───────────────────────

def get_operational_stations(stations):
    """Stations with actual service (non-terminal, non-holding)."""
    return [s for s in stations
            if s.get("Staffing_No", 0) > 0
            or s.get("Avg_Service_Time", 0) > 0]

def get_terminal_stations(stations):
    """Holding/terminal stations — never modified."""
    return [s for s in stations
            if s.get("Staffing_No", 0) == 0
            and s.get("Avg_Service_Time", 0) == 0]

def calc_avg_service_time(tasks):
    """Calculate service time from task list — emergent, not agent-controlled."""
    if not tasks:
        return 30
    total = sum(t.get("Avg_Duration", 10) * t.get("Probability", 1.0)
                for t in tasks)
    return max(1, int(total))


# ─────────────────── MAIN DECODE FUNCTION ──────────────────────

def action_to_aeroconfig_structural(action_norm, action_real,
                                     baseline_cfg: dict,
                                     episode: int = 0,
                                     continuous: bool = False) -> dict:
    """
    Convert 52-dim action into a lane-based aeroconfig.

    Args:
        action_norm  : float32 [0,1] — kept for API compatibility, unused
        action_real  : float32 real units — 52-dim [lanes, staff, cap, eff, ...]
        baseline_cfg : loaded baseline aeroconfig dict (deep-copied)
        episode      : unused seed placeholder
        continuous   : if True, keep float values during PPO training
                       (preserves gradients). False for inference.

    Returns:
        Modified aeroconfig dict ready for des_engine.load_aero_config()
    """
    cfg = copy.deepcopy(baseline_cfg)

    # Build checkpoint lookup
    ck_lookup = {}
    for flow in ("Departure", "Arrival"):
        for ck in cfg.get(flow, {}).get("Checkpoints", []):
            ck_lookup[ck["Checkpoint_ID"]] = ck

    for ck_idx, cid in enumerate(ALL_CHECKPOINTS):
        ck = ck_lookup.get(cid)
        if ck is None:
            continue

        offset = ck_idx * FEATURES_PER_CK
        feats_r = action_real[offset: offset + FEATURES_PER_CK]

        # ── Read 4 features ──
        pred_lanes      = max(1, int(round(float(feats_r[0]))))
        staff_per_lane  = max(1, float(feats_r[1]))
        cap_per_lane    = max(5, float(feats_r[2]))
        efficiency      = float(np.clip(feats_r[3], 0.1, 1.0))

        # ── Rebuild stations from baseline template ──
        stations  = ck["Stations"]
        op        = get_operational_stations(stations)
        terminals = get_terminal_stations(stations)

        if not op:
            continue

        # Use first operational station as the canonical template
        template = copy.deepcopy(op[0])
        base_id  = template.get("Station_ID", "ST")

        new_op = []
        for i in range(pred_lanes):
            st = copy.deepcopy(template)

            # Naming
            if i == 0:
                st["Station_ID"] = base_id
            else:
                st["Station_ID"] = f"{base_id}_PAR{i:02d}"

            # Intensity features (agent-controlled)
            if continuous:
                st["Staffing_No"]       = staff_per_lane
                st["Max_Queue_Cap"]     = cap_per_lane
            else:
                st["Staffing_No"]       = int(round(staff_per_lane))
                st["Max_Queue_Cap"]     = int(round(cap_per_lane))

            st["Efficiency_Factor"] = round(efficiency, 3)

            # ── Service time is EMERGENT, not agent-controlled ──
            st["Avg_Service_Time"] = calc_avg_service_time(st.get("Tasks", []))

            new_op.append(st)

        # Terminal/holding stations stay untouched
        ck["Stations"] = new_op + terminals

    # Metadata
    if "_metadata" not in cfg:
        cfg["_metadata"] = {}
    cfg["_metadata"]["config_id"]            = "ppo_v2_lane_based"
    cfg["_metadata"]["quality_label"]        = "predicted"
    cfg["_metadata"]["perturbation_profile"] = "ppo_agent"

    return cfg


# ─────────────────── HUMAN-READABLE SUMMARY ────────────────────

def summarize_config(cfg, baseline_cfg=None):
    """
    Print a diff-style summary showing what changed vs the baseline.
    """
    print(f"\n{'='*70}")
    print(f"  LANE-BASED CONFIG SUMMARY")
    print(f"{'='*70}")
    print(f"  {'Checkpoint':<<22} {'Lanes':>6} {'Staff/L':>8} "
          f"{'Cap/L':>7} {'Eff':>7}")
    print(f"  {'-'*68}")

    baseline_lookup = {}
    if baseline_cfg:
        for flow in ("Departure", "Arrival"):
            for ck in baseline_cfg.get(flow, {}).get("Checkpoints", []):
                baseline_lookup[ck["Checkpoint_ID"]] = ck["Stations"]

    for flow in ("Departure", "Arrival"):
        for ck in cfg.get(flow, {}).get("Checkpoints", []):
            cid      = ck["Checkpoint_ID"]
            stations = ck["Stations"]
            op       = get_operational_stations(stations)
            if not op:
                continue

            n_lanes = len(op)
            s_pl    = float(np.mean([s["Staffing_No"]       for s in op]))
            c_pl    = float(np.mean([s["Max_Queue_Cap"]     for s in op]))
            e_pl    = float(np.mean([s["Efficiency_Factor"] for s in op]))

            # Compare lane count vs baseline
            note = ""
            if baseline_lookup.get(cid):
                base_op = get_operational_stations(baseline_lookup[cid])
                delta   = n_lanes - len(base_op)
                if delta != 0:
                    note = f"  ({delta:+,d} vs baseline)"

            print(f"  {cid:<22} {n_lanes:>6} {s_pl:>8.1f} "
                  f"{c_pl:>7.1f} {e_pl:>7.3f}{note}")

    print(f"{'='*70}")