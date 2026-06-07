"""
IATA ADRM Exhibit 3.3.4.7 — Level of Service Guidelines for Airport Terminal
Facilities, encoded as structured Optimum / Sub-Optimum / Over-Design bands.

Updated: 13 checkpoints (130-dim) matching the type-based canonical list.
"""
from dataclasses import dataclass
import numpy as np


# ─────────────────────── IATA LoS BANDS ────────────────────────
# Queuing time bands in MINUTES. (lo, hi) defines the Optimum band.
# Source: IATA ADRM Exhibit 3.3.4.7 (image provided by user).
# "n/a" queuing entries are given synthetic bands marked [SYNTHETIC].

@dataclass(frozen=True)
class QueueBand:
    economy:   tuple | None        # (lo, hi) minutes, or None
    premium:   tuple | None        # Business/First/Fast Track
    space_sqm: tuple               # (lo, hi) sqm/PAX for Optimum

# 13 checkpoints — IDs must match baseline.json and DES engine output exactly.
IATA_LOS = {
    # ── Check-In family ─────────────────────────────────────────
    "DIG-CHK":  QueueBand(economy=(1, 2),   premium=(1, 2),   space_sqm=(1.3, 1.8)),  # Self-Service Kiosk
    "SLF-BAG":  QueueBand(economy=(1, 5),   premium=(1, 3),   space_sqm=(1.3, 1.8)),  # Bag Drop Desk
    "CHK-BAG":  QueueBand(economy=(10, 20), premium=(3, 5),   space_sqm=(1.3, 1.8)),  # Check-in Desk (Biz)

    # ── Security / Emigration ────────────────────────────────────
    "1ST-SEC":  QueueBand(economy=(5, 10),  premium=(1, 3),   space_sqm=(1.0, 1.2)),  # Security Control
    "2ND-SEC":  QueueBand(economy=(5, 10),  premium=(1, 3),   space_sqm=(1.0, 1.2)),  # Security Control
    "PAS-CHK":  QueueBand(economy=(5, 10),  premium=(1, 3),   space_sqm=(1.0, 1.2)),  # Emigration Control (Staffed)
    "EXIT-SEC": QueueBand(economy=(1, 5),   premium=(1, 5),   space_sqm=(1.3, 1.8)),  # Customs Control

    # ── Arrival Immigration ────────────────────────────────────
    "PAS-CTRL": QueueBand(economy=(5, 10),  premium=(1, 5),   space_sqm=(1.0, 1.2)),  # Immigration (Staffed) — Fast Track 1-5

    # ── Baggage ────────────────────────────────────────────────
    "BAG-CLM":  QueueBand(economy=(0, 15),  premium=(0, 15),  space_sqm=(1.5, 1.7)),  # Baggage Reclaim (Narrow Body)

    # ── Terminal / Gate [SYNTHETIC — no queuing band in Exhibit] ─
    "DEPARTING-TERMINAL": QueueBand(economy=(0, 10), premium=(0, 5),  space_sqm=(2.0, 2.3)),  # Public Departure Hall
    "ARV-TERM":           QueueBand(economy=(0, 10), premium=(0, 5),  space_sqm=(2.0, 2.3)),  # Public Arrival Hall
    "BRD-GAT":            QueueBand(economy=(5, 15), premium=(3, 10), space_sqm=(1.8, 2.2)),  # Gate Holdrooms / Boarding
    "ARV-GAT":            QueueBand(economy=(5, 15), premium=(3, 10), space_sqm=(1.8, 2.2)),  # Arrival Gate / Deplaning
}

# Premium classes from your CSV
PREMIUM_CLASSES = {"Business", "First", "FastTrack", "First Class"}


# ─────────────────────── BAND PENALTY ──────────────────────────
def _band_penalty(value, band, sub_weight=1.0, over_weight=0.1):
    """
    Penalty profile per IATA band:
        value < lo            → over_weight * (lo - value)        [wasteful]
        lo ≤ value ≤ hi       → 0                                  [target]
        value > hi            → sub_weight  * (value - hi)         [breach]
    """
    if band is None:
        return 0.0
    lo, hi = band
    if value < lo:
        return over_weight * (lo - value)
    if value > hi:
        return sub_weight  * (value - hi)
    return 0.0


# ─────────────────────── REWARD FUNCTION ───────────────────────
def compute_iata_reward_v2(stats: dict) -> tuple:
    """
    Smoother IATA compliance reward with balanced penalties and near-green bonuses.
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
        p95      = data.get("p95", 0.0)
        lo, hi   = los.economy
        checked += 1

        if lo <= p95 <= hi:
            # Perfect — inside IATA band
            total_bonus   += 100.0
            green         += 1
        elif p95 < lo:
            # Over-designed (too many staff)
            # Penalty: -10, scaled by how far below the band
            total_penalty += 10.0 * (lo - p95) / max(lo, 1e-6)
        else:
            # Under-designed (too few staff)
            # Penalty: -15 (was -25), scaled by how far above
            total_penalty += 15.0 * (p95 - hi) / max(hi, 1e-6)

            # ── NEAR-GREEN BONUS ──
            # If p95 is within 50% above the upper limit, give partial credit
            # This creates a "yellow zone" that guides the actor toward green
            if p95 <= hi * 1.5:
                total_bonus += 20.0
                near_green  += 1

    throughput_bonus = stats.get("total_throughput", 0) * 0.05
    completion_bonus = stats.get("completion_rate",  0) * 20.0
    raw = total_bonus - total_penalty + throughput_bonus + completion_bonus

    return raw, {
        "compliance_rate": green / max(checked, 1),
        "near_green_rate": near_green / max(checked, 1),
        "green":           green,
        "near_green":      near_green,
        "total_checked":   checked,
        "completion":      stats.get("completion_rate", 0),
    }


# ─────────────────────── DEMO ──────────────────────────────────
if __name__ == "__main__":
    import pandas as pd
    from pathlib import Path
    from parse_iql_v2 import parse_stats, _mmss_to_min

    base = Path("/mnt/user-data/uploads")
    stats = parse_stats(base / "simlog_aero001_abs001_STATS.txt")

    df = pd.read_csv(base / "simlog_aero001_abs001.csv", comment="#")
    df["wait_min"] = df["WaitTime"].apply(_mmss_to_min)

    r, info = compute_reward_iata(stats, csv_df=df)
    print(f"IATA band-aware reward: {r:.3f}")
    print("Diagnostics:")
    for k, v in info.items():
        print(f"  {k:14s}: {v:.3f}")

    # Show band status per checkpoint
    print("\nPer-checkpoint P95 wait vs Economy Optimum band:")
    print(f"{'Checkpoint':<<22}{'P95 (min)':>12}{'Optimum band':>20}{'Status':>14}")
    for cid, los in IATA_LOS.items():
        ck = stats["per_checkpoint"].get(cid)
        if ck is None or los.economy is None:
            continue
        p95 = ck["p95"]
        lo, hi = los.economy
        if   p95 < lo: status = "OVER-DESIGN"
        elif p95 > hi: status = "SUB-OPTIMUM"
        else:          status = "OPTIMUM"
        print(f"{cid:<22}{p95:>12.1f}{f'{lo}-{hi} min':>20}{status:>14}")