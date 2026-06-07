"""
Parser for IQL warm-start → PPO online fine-tuning pipeline.
130-dim version (13 checkpoints), type-based matching.
"""
import json
import re
import numpy as np
import pandas as pd
from pathlib import Path

CANONICAL_CHECKPOINTS = [
    {"flow": "departure", "type": "Security", "occ": 0, "ref_id": "1ST-SEC"},
    {"flow": "departure", "type": "Check-in /w Baggage Tagging", "occ": 0, "ref_id": "CHK-BAG"},
    {"flow": "departure", "type": "Digital Check-in", "occ": 0, "ref_id": "DIG-CHK"},
    {"flow": "departure", "type": "Self-Service Bag Drop", "occ": 0, "ref_id": "SLF-BAG"},
    {"flow": "departure", "type": "Passport Check", "occ": 0, "ref_id": "PAS-CHK"},
    {"flow": "departure", "type": "Security", "occ": 1, "ref_id": "2ND-SEC"},
    {"flow": "departure", "type": "Departing Terminal", "occ": 0, "ref_id": "DEPARTING-TERMINAL"},
    {"flow": "departure", "type": "Boarding", "occ": 0, "ref_id": "BRD-GAT"},
    {"flow": "arrival", "type": "Boarding", "occ": 0, "ref_id": "ARV-GAT"},
    {"flow": "arrival", "type": "Arrival Terminal", "occ": 0, "ref_id": "ARV-TERM"},
    {"flow": "arrival", "type": "Passport Check", "occ": 0, "ref_id": "PAS-CTRL"},
    {"flow": "arrival", "type": "Baggage Retrieval", "occ": 0, "ref_id": "BAG-CLM"},
    {"flow": "arrival", "type": "Security", "occ": 0, "ref_id": "EXIT-SEC"},
]

ALL_CHECKPOINTS = [c["ref_id"] for c in CANONICAL_CHECKPOINTS]
FEATURES_PER_CK = 4
ACTION_DIM = len(CANONICAL_CHECKPOINTS) * FEATURES_PER_CK

IATA_LOS_OPTIMUM = {
    0: (5, 10), 1: (10, 20), 2: (1, 2), 3: (1, 5), 4: (5, 10),
    5: (5, 10), 6: (0, 10), 7: (5, 15), 8: (5, 15), 9: (0, 10),
    10: (5, 10), 11: (0, 15), 12: (1, 5),
}

IATA_LOS_BY_ID = {c["ref_id"]: IATA_LOS_OPTIMUM[i] for i, c in enumerate(CANONICAL_CHECKPOINTS)}


def _map_checkpoints_by_type(cfg):
    mapping = {}
    for flow in ("Departure", "Arrival"):
        flow_key = flow.lower()
        type_counts = {}
        for ck in cfg.get(flow, {}).get("Checkpoints", []):
            ck_type = ck["Checkpoint_Type"]
            count = type_counts.get(ck_type, 0)
            for idx, canon in enumerate(CANONICAL_CHECKPOINTS):
                if canon["flow"] == flow_key and canon["type"] == ck_type and canon["occ"] == count:
                    mapping[idx] = ck
                    break
            type_counts[ck_type] = count + 1
    return mapping


def featurize_absconfig(path):
    cfg = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    w = np.asarray(cfg["weights"], dtype=np.float32)
    w = w / max(w.sum(), 1e-9)
    return w


# ═════════════════════════ REPLACE extract_action() ═════════════════════════

def extract_action(aeroconfig_path):
    cfg = json.loads(Path(aeroconfig_path).read_text(encoding="utf-8-sig"))
    ck_map = _map_checkpoints_by_type(cfg)
    feats = []
    for idx in range(len(CANONICAL_CHECKPOINTS)):
        ck = ck_map.get(idx)
        if ck is None or not ck.get("Stations"):
            feats.extend([0.0] * FEATURES_PER_CK)
            continue

        all_st = ck["Stations"]
        op_st = [s for s in all_st
                 if s.get("Staffing_No", 0) > 0
                 or s.get("Avg_Service_Time", 0) > 0]

        if not op_st:
            feats.extend([0.0] * FEATURES_PER_CK)
            continue

        # ── 4 features per checkpoint ──
        # 0: num_lanes      (station count)
        # 1: staff_per_lane (mean staffing per operational station)
        # 2: cap_per_lane   (mean queue cap per operational station)
        # 3: efficiency     (mean efficiency factor)
        num_lanes      = float(len(op_st))
        staff_per_lane = float(np.mean([s.get("Staffing_No", 0)       for s in op_st]))
        cap_per_lane   = float(np.mean([s.get("Max_Queue_Cap", 0)     for s in op_st]))
        efficiency     = float(np.mean([s.get("Efficiency_Factor", 1.0) for s in op_st]))

        feats.extend([num_lanes, staff_per_lane, cap_per_lane, efficiency])

    return np.asarray(feats, dtype=np.float32)


def _mmss_to_min(s):
    if not s or s == "0:00":
        return 0.0
    m, sec = s.split(":")
    return int(m) + int(sec) / 60.0


def parse_stats(stats_path):
    txt = Path(stats_path).read_text(encoding="utf-8-sig")
    per_ck = {}
    per_st = {}

    checkpoint_pattern = re.compile(r"CHECKPOINT:\s*(\S+)(.*?)(?=CHECKPOINT:|  KPI 6|$)", re.DOTALL)
    for cp_m in checkpoint_pattern.finditer(txt):
        cid = cp_m.group(1)
        block = cp_m.group(2)

        ck_m = re.search(
            r"Mean Queue Time \(MQT\)\s*:\s*([\d:]+)"
            r".*?95th Percentile Queue Time\s*:\s*([\d:]+)"
            r".*?Throughput\s*:\s*([\d.]+)\s*pax/hour",
            block, re.DOTALL,
        )
        if ck_m:
            mqt, p95, tput = ck_m.groups()
            per_ck[cid] = {"mqt": _mmss_to_min(mqt), "p95": _mmss_to_min(p95), "throughput": float(tput)}

        for st_m in re.finditer(
            r"Station:\s*(\S+)"
            r".*?MQT:\s*([\d:]+)"
            r".*?P95 Wait:\s*([\d:]+)"
            r".*?Throughput:\s*([\d.]+)\s*pax/hr",
            block, re.DOTALL,
        ):
            st_id, st_mqt, st_p95, st_tput = st_m.groups()
            if cid not in per_st:
                per_st[cid] = {}
            per_st[cid][st_id] = {
                "mqt": _mmss_to_min(st_mqt),
                "p95": _mmss_to_min(st_p95),
                "throughput": float(st_tput),
            }

    j = re.search(r"Mean Journey Time\s*:\s*([\d:]+).*?95th Percentile\s*:\s*([\d:]+)", txt, re.DOTALL)
    completed = int(re.search(r"Completed Records\s*:\s*(\d+)", txt).group(1))
    total = int(re.search(r"Total Records\s*:\s*(\d+)", txt).group(1))
    return {
        "per_checkpoint": per_ck,
        "per_station": per_st,
        "mean_journey_min": _mmss_to_min(j.group(1)),
        "p95_journey_min": _mmss_to_min(j.group(2)),
        "completion_rate": completed / max(total, 1),
    }


def compute_reward(stats, w_iata=1.0, w_journey=0.5, w_complete=10.0, w_bottleneck=2.0):
    breach = 0.0
    worst = 0.0
    for idx, (lo, hi) in IATA_LOS_OPTIMUM.items():
        ref_id = CANONICAL_CHECKPOINTS[idx]["ref_id"]
        m = stats["per_checkpoint"].get(ref_id, {}).get("p95", 0.0)
        excess = max(m - hi, 0.0)
        breach += excess
        worst = max(worst, excess)
    return float(
        + w_complete * stats["completion_rate"]
        - w_journey * stats["mean_journey_min"] / 60.0
        - 0.25 * stats["p95_journey_min"] / 60.0
        - w_iata * breach / 60.0
        - w_bottleneck * worst / 60.0
    )


def build_transition(abs_path, aero_path, stats_path):
    s = featurize_absconfig(abs_path)
    a = extract_action(aero_path)
    r = compute_reward(parse_stats(stats_path))
    s_next = np.zeros_like(s)
    return s, a, r, s_next, True


def build_dataset(triples):
    S, A, R, S2, D = [], [], [], [], []
    for abs_p, aero_p, stats_p in triples:
        s, a, r, s2, d = build_transition(abs_p, aero_p, stats_p)
        S.append(s); A.append(a); R.append(r); S2.append(s2); D.append(d)
    return (np.stack(S), np.stack(A), np.array(R, dtype=np.float32),
            np.stack(S2), np.array(D, dtype=np.float32))


if __name__ == "__main__":
    base = Path("/mnt/user-data/uploads")
    s, a, r, s2, d = build_transition(
        base / "absconfig_001.json",
        base / "aeroconfig_001.json",
        base / "simlog_aero001_abs001_STATS.txt",
    )
    print(f"State  (dim={s.shape[0]}): {s}")
    print(f"Action (dim={a.shape[0]}): {a[:8]} ... ")
    print(f"Reward: {r:.3f}")