"""
Output writers — produces CSV and _STATS.txt files identical to SimulationLogger.cs
"""
import math, os
from typing import List, Dict
from des_models import EventRecord


def format_time(seconds: float) -> str:
    """Converts seconds to M:SS format (mirrors SimulationLogger.FormatTime)."""
    if seconds <= 0.0:
        return "0:00"
    total_sec = round(seconds)
    mins = total_sec // 60
    secs = total_sec % 60
    return f"{mins}:{secs:02d}"


def percentile(sorted_vals: List[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    idx = p * (len(sorted_vals) - 1)
    lower = int(math.floor(idx))
    upper = int(math.ceil(idx))
    if lower == upper:
        return sorted_vals[lower]
    frac = idx - lower
    return sorted_vals[lower] * (1.0 - frac) + sorted_vals[upper] * frac


def write_csv(records: List[EventRecord], path: str,
              aero_id: str = "", abs_id: str = ""):
    """Write CSV in exact SimulationLogger format."""
    lines = []

    if aero_id and abs_id:
        lines.append(f"# AeroConfig: aeroconfig_{aero_id}.json")
        lines.append(f"# ABSConfig: absconfig_{abs_id}.json")
        lines.append("")

    lines.append("Passenger,Class,Age,KioskAffinity,Checkpoint,Station,Tasks,"
                 "ArrivalTime,QueueJoinTime,ServiceStartTime,ServiceEndTime,"
                 "ExitTime,WaitTime,ServiceTime,TotalDwell")

    for r in records:
        station_label = r.station_id if r.station_id else r.checkpoint_id
        task_label = r.tasks_performed if r.tasks_performed else "No_Service_Recorded"
        lines.append(",".join([
            r.passenger_name, r.passenger_class, str(r.passenger_age),
            f"{r.kiosk_affinity:.3f}", r.checkpoint_id, station_label,
            f'"{task_label}"',
            format_time(r.arrival_time), format_time(r.queue_join_time),
            format_time(r.service_start_time), format_time(r.service_end_time),
            format_time(r.exit_time), format_time(r.wait_time),
            format_time(r.service_time), format_time(r.total_dwell)
        ]))

    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def write_stats(records: List[EventRecord], path: str):
    """Write _STATS.txt in exact SimulationLogger.BuildStatsReport format."""
    completed = [r for r in records if r.exit_time > 0]
    total_sim_time = max((r.exit_time for r in records), default=0)

    s = []
    s.append("╔══════════════════════════════════════════════════════════════════════╗")
    s.append("║         AIRPORT DES — PERFORMANCE METRICS / KPI REPORT             ║")
    s.append("╚══════════════════════════════════════════════════════════════════════╝")
    s.append("")
    s.append(f"  Sim Duration       : {format_time(total_sim_time)}")
    s.append(f"  Total Records      : {len(records)}")
    s.append(f"  Completed Records  : {len(completed)}")
    s.append("")

    if not completed:
        s.append("  No completed records to report.")
        _write(path, s)
        return

    # KPI 1-5: Per-checkpoint
    s.append("══════════════════════════════════════════════════════════════════════")
    s.append("  KPIs 1–5 : PER-CHECKPOINT / PER-STATION METRICS")
    s.append("══════════════════════════════════════════════════════════════════════")

    cp_groups: Dict[str, List[EventRecord]] = {}
    for r in completed:
        cp_groups.setdefault(r.checkpoint_id, []).append(r)

    for cp_id, cp_list in cp_groups.items():
        waits = sorted([r.wait_time for r in cp_list])
        dwells = sorted([r.total_dwell for r in cp_list])
        first_arr = min(r.arrival_time for r in cp_list)
        last_exit = max(r.exit_time for r in cp_list)
        duration = last_exit - first_arr
        throughput = (len(cp_list) / duration) * 3600 if duration > 0 else 0

        s.append("")
        s.append(f"┌─── CHECKPOINT: {cp_id} ───────────────────────────────")
        s.append(f"│  Passengers Served      : {len(cp_list)}")
        s.append(f"│  Active Window          : {format_time(first_arr)} → {format_time(last_exit)}")
        s.append("│")
        s.append(f"│  KPI 1 · Mean Queue Time (MQT)       : {format_time(sum(waits)/len(waits))}")
        s.append(f"│  KPI 2 · Max Queue Time  (MQS)       : {format_time(max(waits))}")
        s.append(f"│          Min Queue Time               : {format_time(min(waits))}")
        s.append(f"│  KPI 3 · 90th Percentile Queue Time  : {format_time(percentile(waits, 0.90))}")
        s.append(f"│          95th Percentile Queue Time   : {format_time(percentile(waits, 0.95))}")
        s.append(f"│  KPI 4 · Mean Total Dwell (Q+S)      : {format_time(sum(dwells)/len(dwells))}")
        s.append(f"│          Max Total Dwell              : {format_time(max(dwells))}")
        s.append(f"│          90th Pctl Total Dwell        : {format_time(percentile(dwells, 0.90))}")
        s.append(f"│          95th Pctl Total Dwell        : {format_time(percentile(dwells, 0.95))}")
        s.append(f"│  KPI 5 · Throughput                   : {throughput:.1f} pax/hour")
        s.append(f"│          Avg Service Time             : {format_time(sum(r.service_time for r in cp_list)/len(cp_list))}")
        s.append("│")

        # Per-station breakdown
        st_groups: Dict[str, List[EventRecord]] = {}
        for r in cp_list:
            st_groups.setdefault(r.station_id, []).append(r)
        for st_id, st_list in st_groups.items():
            sw = sorted([r.wait_time for r in st_list])
            sd = sorted([r.total_dwell for r in st_list])
            sf = min(r.arrival_time for r in st_list)
            sl = max(r.exit_time for r in st_list)
            sdur = sl - sf
            stp = (len(st_list) / sdur) * 3600 if sdur > 0 else 0
            s.append(f"│  ┌── Station: {st_id}")
            s.append(f"│  │  Served: {len(st_list)}  |  MQT: {format_time(sum(sw)/len(sw))}  |  MQS: {format_time(max(sw))}")
            s.append(f"│  │  P90 Wait: {format_time(percentile(sw, 0.90))}  |  P95 Wait: {format_time(percentile(sw, 0.95))}")
            s.append(f"│  │  Avg Dwell: {format_time(sum(sd)/len(sd))}  |  Throughput: {stp:.1f} pax/hr")
            s.append(f"│  │  Avg Service: {format_time(sum(r.service_time for r in st_list)/len(st_list))}")
            s.append("│  └──")
        s.append(f"└──────────────────────────────────────────────────────")

    # KPI 6: End-to-end journeys
    s.append("")
    s.append("══════════════════════════════════════════════════════════════════════")
    s.append("  KPI 6 : END-TO-END JOURNEY TIMES (Milestone-to-Milestone)")
    s.append("══════════════════════════════════════════════════════════════════════")
    s.append("")

    pax_groups: Dict[str, List[EventRecord]] = {}
    for r in completed:
        pax_groups.setdefault(r.passenger_name, []).append(r)

    full_journeys = []
    for g in pax_groups.values():
        first = min(r.arrival_time for r in g)
        last = max(r.exit_time for r in g)
        if last > first:
            full_journeys.append(last - first)

    if full_journeys:
        full_journeys.sort()
        s.append("  Full Journey (First Checkpoint → Last Checkpoint Exit)")
        s.append(f"    Passengers            : {len(full_journeys)}")
        s.append(f"    Mean Journey Time      : {format_time(sum(full_journeys)/len(full_journeys))}")
        s.append(f"    Shortest Journey       : {format_time(min(full_journeys))}")
        s.append(f"    Longest Journey        : {format_time(max(full_journeys))}")
        s.append(f"    90th Percentile        : {format_time(percentile(full_journeys, 0.90))}")
        s.append(f"    95th Percentile        : {format_time(percentile(full_journeys, 0.95))}")
        s.append("")

    # KPI 7: Time-of-day profiles
    s.append("══════════════════════════════════════════════════════════════════════")
    s.append("  KPI 7 : TIME-OF-DAY PROFILES (5-minute bins)")
    s.append("══════════════════════════════════════════════════════════════════════")
    s.append("")

    bin_size = 300.0
    max_time = max((r.exit_time for r in completed), default=0)
    num_bins = max(1, math.ceil(max_time / bin_size))

    for cp_id, cp_list in cp_groups.items():
        s.append(f"  ── {cp_id} ──")
        s.append(f"  {'Time Bin':<14} {'Count':>6} {'MQT':>8} {'MQS':>8} {'P90 Wait':>9} {'Throughput':>11}")
        s.append(f"  {'──────────────'} {'──────'} {'────────'} {'────────'} {'─────────'} {'───────────'}")

        for b in range(num_bins):
            bs = b * bin_size
            be = (b + 1) * bin_size
            bin_recs = [r for r in cp_list if bs <= r.queue_join_time < be]
            if not bin_recs:
                continue
            bw = sorted([r.wait_time for r in bin_recs])
            bmqt = sum(bw) / len(bw)
            bmqs = max(bw)
            bp90 = percentile(bw, 0.90)
            btp = len(bin_recs) / (bin_size / 3600.0)
            label = f"{format_time(bs)}-{format_time(be)}"
            s.append(f"  {label:<14} {len(bin_recs):>6} {format_time(bmqt):>8} {format_time(bmqs):>8} {format_time(bp90):>9} {btp:>8.1f} p/h")
        s.append("")

    s.append("══════════════════════════════════════════════════════════════════════")
    s.append("  KPI Definitions:")
    s.append("    MQT  = Mean Queue Time (avg wait before service starts)")
    s.append("    MQS  = Maximum Queue Time (worst-case wait)")
    s.append("    P90  = 90th percentile (90% of passengers waited less than this)")
    s.append("    P95  = 95th percentile (95% of passengers waited less than this)")
    s.append("    Dwell = Total time in station (queue wait + service time)")
    s.append("══════════════════════════════════════════════════════════════════════")

    _write(path, s)


def _write(path: str, lines: List[str]):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
