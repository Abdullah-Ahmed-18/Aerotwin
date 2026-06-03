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
def compute_reward_iata(stats, csv_df=None,
                        w_complete=10.0,
                        w_journey=0.3,
                        w_subopt=1.0,        # Sub-Optimum penalty weight
                        w_overdesign=0.1,    # Over-Design penalty weight (mild)
                        w_bottleneck=1.5):   # extra hit on the worst checkpoint
    """
    IATA-band-aware reward.

    stats   : dict from parse_stats() in parse_iql_v2.py
              (must contain per_checkpoint{cid: {mqt, p95, throughput}}
               + completion_rate, mean_journey_min, p95_journey_min)
    csv_df  : optional pandas DataFrame of the simlog CSV — enables
              class-aware (Economy vs Premium) penalty computation.
              If None, we apply the Economy band to all passengers.
    """
    # 1) Per-checkpoint band penalties
    breach_total  = 0.0
    breach_worst  = 0.0
    waste_total   = 0.0

    for cid, los in IATA_LOS.items():
        ck = stats["per_checkpoint"].get(cid)
        if ck is None:
            continue

        # Use P95 wait (IATA is a service-quality standard; P95 is the
        # right operating point — Optimum should hold for almost everyone).
        wait = ck["p95"]

        if csv_df is not None:
            sub = csv_df[csv_df["Checkpoint"] == cid]
            if len(sub) == 0:
                continue
            premium_mask = sub["Class"].isin(PREMIUM_CLASSES)
            eco_p95     = sub.loc[~premium_mask, "wait_min"].quantile(0.95) \
                          if (~premium_mask).any() else 0.0
            prem_p95    = sub.loc[ premium_mask, "wait_min"].quantile(0.95) \
                          if   premium_mask.any()  else 0.0

            eco_pen = _band_penalty(eco_p95,  los.economy,
                                    sub_weight=w_subopt,
                                    over_weight=w_overdesign)
            prm_pen = _band_penalty(prem_p95, los.premium,
                                    sub_weight=w_subopt,
                                    over_weight=w_overdesign)
            sub_pen = max(0.0, eco_pen) + max(0.0, prm_pen)
            # split waste vs breach for bookkeeping
            waste  = (eco_pen if eco_p95  < (los.economy or (0,0))[0] else 0.0) \
                   + (prm_pen if prem_p95 < (los.premium or (0,0))[0] else 0.0)
            breach = sub_pen - waste
        else:
            pen    = _band_penalty(wait, los.economy,
                                   sub_weight=w_subopt,
                                   over_weight=w_overdesign)
            lo_eco = (los.economy or (0,0))[0]
            waste  = pen if wait < lo_eco else 0.0
            breach = pen - waste

        waste_total  += waste
        breach_total += breach
        breach_worst  = max(breach_worst, breach)

    # 2) Throughput / completion / journey terms
    reward = (
        + w_complete  * stats["completion_rate"]
        - w_journey   * stats["mean_journey_min"] / 60.0
        - 0.15        * stats["p95_journey_min"]  / 60.0
        - breach_total                       # already weighted
        - w_bottleneck * breach_worst        # extra penalty on bottleneck
        - waste_total                        # mild over-design penalty
    )
    return float(reward), {
        "breach_total": breach_total,
        "breach_worst": breach_worst,
        "waste_total":  waste_total,
        "completion":   stats["completion_rate"],
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