"""
structural_decoder.py
Converts 130-dim action vector (13 checkpoints × 10 features) into aeroconfig.
Type-based matching — robust to Checkpoint_ID renames.
"""
import copy
import json
import numpy as np
from pathlib import Path

from parse_iql_v2 import CANONICAL_CHECKPOINTS, FEATURES_PER_CK, _map_checkpoints_by_type

FEAT = {
    "num_stations": 0, "total_staffing": 1, "total_queue_cap": 2,
    "mean_efficiency": 3, "mean_service_time": 4, "has_buffer": 5,
    "has_parallel": 6, "has_split": 7, "total_tasks": 8, "mean_cond_prob": 9,
}

PARALLEL_THRESH = 0.5
SPLIT_THRESH = 0.5
BUFFER_THRESH = 0.5


# ─────────────────────── STATION HELPERS ───────────────────────

def get_operational_stations(stations):
    return [s for s in stations
            if s.get("Staffing_No", 0) > 0 or s.get("Avg_Service_Time", 0) > 0]

def get_terminal_stations(stations):
    return [s for s in stations
            if s.get("Staffing_No", 0) == 0 and s.get("Avg_Service_Time", 0) == 0]

def calc_avg_service_time(tasks):
    if not tasks:
        return 30
    total = sum(t.get("Avg_Duration", 10) * t.get("Probability", 1.0) for t in tasks)
    return max(1, int(total))


# ──────────────────── STRUCTURAL OPERATIONS ────────────────────

def op_add_parallel_lane(stations, seed=42):
    op = get_operational_stations(stations)
    if not op:
        return stations
    rng = np.random.default_rng(seed)
    template = max(op, key=lambda s: s.get("Staffing_No", 1))
    new_st = copy.deepcopy(template)
    base_id = template.get("Station_ID", "ST")
    n = sum(1 for s in stations if "_PAR" in s.get("Station_ID", ""))
    new_st["Station_ID"] = f"{base_id}_PAR{n+1:02d}"
    new_st["Station_Name"] = template.get("Station_Name", "Station") + " (Parallel)"
    factor = float(rng.uniform(0.7, 0.9))
    new_st["Staffing_No"] = max(1, int(round(template["Staffing_No"] * factor)))
    new_st["Max_Queue_Cap"] = max(5, int(round(template["Max_Queue_Cap"] * factor)))
    new_st["Efficiency_Factor"] = round(min(1.0, template.get("Efficiency_Factor", 1.0) * float(rng.uniform(0.95, 1.05))), 2)
    new_st["Avg_Service_Time"] = template.get("Avg_Service_Time", 60)
    return stations + [new_st]

def op_split_station(stations, seed=42):
    op = get_operational_stations(stations)
    candidates = [s for s in op if len(s.get("Tasks", [])) >= 2]
    if not candidates:
        return stations
    rng = np.random.default_rng(seed)
    station = max(candidates, key=lambda s: len(s.get("Tasks", [])))
    tasks = station.get("Tasks", [])
    mid = len(tasks) // 2
    st1 = copy.deepcopy(station)
    st2 = copy.deepcopy(station)
    st1["Tasks"] = copy.deepcopy(tasks[:mid])
    st2["Tasks"] = copy.deepcopy(tasks[mid:])
    base_id = station.get("Station_ID", "ST")
    st1["Station_ID"] = f"{base_id}_A"
    st2["Station_ID"] = f"{base_id}_B"
    st1["Station_Name"] = station.get("Station_Name", "Station") + " - Primary"
    st2["Station_Name"] = station.get("Station_Name", "Station") + " - Secondary"
    st1["Avg_Service_Time"] = max(1, calc_avg_service_time(st1["Tasks"]))
    st2["Avg_Service_Time"] = max(1, calc_avg_service_time(st2["Tasks"]))
    total_staff = station.get("Staffing_No", 2)
    st1["Staffing_No"] = max(1, total_staff // 2)
    st2["Staffing_No"] = max(1, total_staff - st1["Staffing_No"])
    idx = next(i for i, s in enumerate(stations) if s.get("Station_ID") == station.get("Station_ID"))
    return stations[:idx] + [st1, st2] + stations[idx+1:]

def op_add_buffer(stations, seed=42):
    op = get_operational_stations(stations)
    if len(op) < 2:
        return stations
    rng = np.random.default_rng(seed)
    insert_after = max(op[:-1], key=lambda s: s.get("Staffing_No", 1))
    idx = next(i for i, s in enumerate(stations) if s.get("Station_ID") == insert_after.get("Station_ID"))
    n = sum(1 for s in stations if "BUFFER" in s.get("Station_ID", ""))
    buf = {
        "Station_ID": f"BUFFER_{n+1:03d}",
        "Station_Name": "Buffer/Holding",
        "Staffing_No": int(rng.integers(1, 3)),
        "Efficiency_Factor": round(float(rng.uniform(0.95, 1.05)), 2),
        "Max_Queue_Cap": int(rng.integers(8, 25)),
        "Avg_Service_Time": int(rng.integers(1, 3)),
        "Allowed_Class": insert_after.get("Allowed_Class", ["All Classes"]),
        "Feature_Val": 0,
        "Tasks": [{
            "Task_Name": "Hold_Queue",
            "Avg_Duration": int(rng.integers(1, 3)),
            "Probability": 1.0
        }],
    }
    return stations[:idx+1] + [buf] + stations[idx+1:]

def op_collapse_to_one(stations, seed=42):
    op = get_operational_stations(stations)
    terminals = get_terminal_stations(stations)
    if len(op) <= 1:
        return stations
    rng = np.random.default_rng(seed)
    all_tasks = []
    total_staff = 0
    total_cap = 0
    min_eff = 2.0
    for st in op:
        all_tasks.extend(copy.deepcopy(st.get("Tasks", [])))
        total_staff += st.get("Staffing_No", 1)
        total_cap += st.get("Max_Queue_Cap", 5)
        min_eff = min(min_eff, st.get("Efficiency_Factor", 1.0))
    collapsed = copy.deepcopy(op[0])
    base_id = collapsed.get("Station_ID", "ST")
    collapsed["Station_ID"] = f"{base_id}_SOLE"
    collapsed["Station_Name"] = collapsed.get("Station_Name", "Station") + " (Collapsed)"
    collapsed["Staffing_No"] = max(1, int(round(total_staff * float(rng.uniform(0.3, 0.5)))))
    collapsed["Max_Queue_Cap"] = max(3, int(round(total_cap * float(rng.uniform(0.3, 0.5)))))
    collapsed["Efficiency_Factor"] = round(min_eff * float(rng.uniform(0.45, 0.65)), 2)
    collapsed["Tasks"] = all_tasks
    collapsed["Avg_Service_Time"] = calc_avg_service_time(all_tasks)
    return [collapsed] + terminals


# ────────────────────── INTENSITY TUNING ───────────────────────

def apply_intensity(stations, total_staff, total_cap, mean_eff):
    op = get_operational_stations(stations)
    if not op:
        return stations
    n = len(op)
    t_staff = max(n, int(round(total_staff)))
    t_cap = max(n * 5, int(round(total_cap)))
    eff = float(np.clip(mean_eff, 0.1, 1.0))
    staff_each = t_staff // n
    cap_each = t_cap // n
    staff_rem = t_staff - staff_each * n
    cap_rem = t_cap - cap_each * n
    for i, st in enumerate(op):
        st["Staffing_No"] = max(1, staff_each + (staff_rem if i == 0 else 0))
        st["Max_Queue_Cap"] = max(5, cap_each + (cap_rem if i == 0 else 0))
        st["Efficiency_Factor"] = round(eff, 3)
    return stations


# ─────────────────── MAIN DECODE FUNCTION ──────────────────────

def action_to_aeroconfig_structural(action_norm, action_real,
                                     baseline_cfg: dict,
                                     episode: int = 0) -> dict:
    cfg = copy.deepcopy(baseline_cfg)
    ck_map = _map_checkpoints_by_type(cfg)

    expected_dim = len(CANONICAL_CHECKPOINTS) * FEATURES_PER_CK
    assert len(action_norm) == expected_dim, \
        f"Expected action dim {expected_dim}, got {len(action_norm)}. Did you rebuild the dataset?"

    for idx, canon in enumerate(CANONICAL_CHECKPOINTS):
        ck = ck_map.get(idx)
        if ck is None:
            continue

        offset = idx * FEATURES_PER_CK
        feats_n = action_norm[offset: offset + FEATURES_PER_CK]
        feats_r = action_real[offset: offset + FEATURES_PER_CK]
        stations = ck["Stations"]
        op = get_operational_stations(stations)
        if not op:
            continue

        seed = episode * 1000 + idx

        # Structural changes
        pred_n_stations = max(1, int(round(feats_r[FEAT["num_stations"]])))
        current_n = len(op)

        if pred_n_stations == 1 and current_n > 1:
            stations = op_collapse_to_one(stations, seed=seed)
        elif pred_n_stations > current_n:
            lanes_to_add = min(pred_n_stations - current_n, 3)
            for i in range(lanes_to_add):
                stations = op_add_parallel_lane(stations, seed=seed + i)

        if feats_n[FEAT["has_split"]] > SPLIT_THRESH:
            stations = op_split_station(stations, seed=seed + 100)
        if feats_n[FEAT["has_buffer"]] > BUFFER_THRESH:
            stations = op_add_buffer(stations, seed=seed + 200)

        # Intensity tuning
        stations = apply_intensity(
            stations,
            total_staff=feats_r[FEAT["total_staffing"]],
            total_cap=feats_r[FEAT["total_queue_cap"]],
            mean_eff=feats_r[FEAT["mean_efficiency"]],
        )
        ck["Stations"] = stations

    if "_metadata" not in cfg:
        cfg["_metadata"] = {}
    cfg["_metadata"]["config_id"] = "ppo_structural_v3"
    cfg["_metadata"]["quality_label"] = "predicted"
    cfg["_metadata"]["perturbation_profile"] = "ppo_agent_130dim"
    return cfg


# ─────────────────── HUMAN-READABLE SUMMARY ────────────────────

def summarize_config(cfg, baseline_cfg=None):
    print(f"\n{'='*70}")
    print(f"  STRUCTURAL CONFIG SUMMARY (130-dim / 13 checkpoints)")
    print(f"{'='*70}")
    print(f"  {'Checkpoint':<<22} {'Stations':>8} {'Staff':>7} "
          f"{'Cap':>7} {'Eff':>7} {'Structural Notes'}")
    print(f"  {'-'*68}")

    baseline_lookup = {}
    if baseline_cfg:
        for flow in ("Departure", "Arrival"):
            for ck in baseline_cfg.get(flow, {}).get("Checkpoints", []):
                baseline_lookup[ck["Checkpoint_ID"]] = ck["Stations"]

    for flow in ("Departure", "Arrival"):
        for ck in cfg.get(flow, {}).get("Checkpoints", []):
            cid = ck["Checkpoint_ID"]
            stations = ck["Stations"]
            op = get_operational_stations(stations)
            if not op:
                continue
            total_s = sum(s["Staffing_No"] for s in op)
            total_c = sum(s["Max_Queue_Cap"] for s in op)
            mean_e = np.mean([s["Efficiency_Factor"] for s in op])

            notes = []
            ids = [s["Station_ID"] for s in op]
            if any("_PAR" in sid for sid in ids): notes.append("+ parallel")
            if any("_A" in sid for sid in ids): notes.append("+ split")
            if any("BUFFER" in sid for sid in ids): notes.append("+ buffer")
            if any("_SOLE" in sid for sid in ids): notes.append("collapsed")

            if baseline_lookup.get(cid):
                base_op = get_operational_stations(baseline_lookup[cid])
                delta = len(op) - len(base_op)
                if delta > 0: notes.append(f"+{delta} stations")
                elif delta < 0: notes.append(f"{delta} stations")

            note_str = ", ".join(notes) if notes else "intensity only"
            print(f"  {cid:<22} {len(op):>8} {total_s:>7} "
                  f"{total_c:>7} {mean_e:>7.3f}  {note_str}")
    print(f"{'='*70}")