import os
import json
from typing import Optional

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False


def _load_comparison(filepath: str) -> dict:
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def _extract_operational_changes(baseline_aero: dict, inferred_aero: dict) -> list:
    """Diff two AERO configs and return human-friendly operational directions."""
    changes = []

    def _get_stations(aero, flow):
        return {ck["Checkpoint_ID"]: ck for ck in aero.get(flow, {}).get("Checkpoints", [])}

    for flow in ("Departure", "Arrival"):
        base_ck = _get_stations(baseline_aero, flow)
        inf_ck = _get_stations(inferred_aero, flow)
        all_cids = set(base_ck.keys()) | set(inf_ck.keys())

        for cid in sorted(all_cids):
            b = base_ck.get(cid)
            i = inf_ck.get(cid)
            if not b and i:
                ck_type = i.get("Checkpoint_Type", "processing")
                changes.append({"checkpoint": cid, "action": f"Open a new {ck_type.lower()} checkpoint for {flow.lower()} passengers"})
                continue
            if b and not i:
                changes.append({"checkpoint": cid, "action": f"Close the {cid} checkpoint — reallocate resources to other zones"})
                continue
            if not b and not i:
                continue

            b_stations = b.get("Stations", [])
            i_stations = i.get("Stations", [])
            b_ids = [s["Station_ID"] for s in b_stations]
            i_ids = [s["Station_ID"] for s in i_stations]

            # 1. Structural mutations (batch counts for friendlier wording)
            parallel_added = [sid for sid in i_ids if "_PAR" in sid and sid not in b_ids]
            if parallel_added:
                count = len(parallel_added)
                lane_word = "lane" if count == 1 else "lanes"
                changes.append({"checkpoint": cid, "action": f"Open {count} additional {lane_word} at {cid} to handle peak traffic"})

            split_base = set(sid.rstrip("_AB") for sid in b_ids if sid.endswith(("_A", "_B")))
            newly_split = []
            for sid in i_ids:
                if sid.endswith("_A") or sid.endswith("_B"):
                    base_name = sid.rstrip("_AB")
                    if base_name in b_ids and base_name not in split_base:
                        newly_split.append(base_name)
            for base_name in set(newly_split):
                changes.append({"checkpoint": cid, "action": f"Split {base_name} into primary/secondary processing lanes at {cid}"})

            collapsed = [sid for sid in b_ids if "_SOLE" in sid and sid not in i_ids]
            if collapsed:
                changes.append({"checkpoint": cid, "action": f"Consolidate stations into a single processing lane at {cid}"})

            # 2. Per-station intensity tuning (human-friendly wording)
            b_map = {s["Station_ID"]: s for s in b_stations}
            i_map = {s["Station_ID"]: s for s in i_stations}
            for sid in set(b_map.keys()) & set(i_map.keys()):
                bs = b_map[sid]
                ins = i_map[sid]
                staff_b = bs.get("Staffing_No", 0)
                staff_i = ins.get("Staffing_No", 0)
                cap_b = bs.get("Max_Queue_Cap", 0)
                cap_i = ins.get("Max_Queue_Cap", 0)
                eff_b = bs.get("Efficiency_Factor", 1.0)
                eff_i = ins.get("Efficiency_Factor", 1.0)
                svc_b = bs.get("Avg_Service_Time", 0)
                svc_i = ins.get("Avg_Service_Time", 0)

                if staff_i > staff_b:
                    delta = staff_i - staff_b
                    word = "agent" if delta == 1 else "agents"
                    changes.append({"checkpoint": cid, "station": sid, "action": f"Deploy {delta} more staff {word} to {sid}"})
                elif staff_i < staff_b:
                    delta = staff_b - staff_i
                    word = "agent" if delta == 1 else "agents"
                    changes.append({"checkpoint": cid, "station": sid, "action": f"Reallocate {delta} staff {word} from {sid} to other zones"})

                if cap_i > cap_b:
                    changes.append({"checkpoint": cid, "station": sid, "action": f"Expand waiting area capacity at {sid}"})
                elif cap_i < cap_b:
                    changes.append({"checkpoint": cid, "station": sid, "action": f"Reduce queue zone footprint at {sid}"})

                if round(eff_i, 2) > round(eff_b, 2):
                    if eff_i >= 0.9:
                        changes.append({"checkpoint": cid, "station": sid, "action": f"Place senior/experienced staff at {sid} to boost throughput"})
                    else:
                        changes.append({"checkpoint": cid, "station": sid, "action": f"Upgrade training or equipment at {sid} to improve efficiency"})
                elif round(eff_i, 2) < round(eff_b, 2):
                    changes.append({"checkpoint": cid, "station": sid, "action": f"Review staffing quality at {sid} — efficiency has dropped"})

                if svc_i < svc_b:
                    changes.append({"checkpoint": cid, "station": sid, "action": f"Streamline processing procedures at {sid} to speed up service"})
                elif svc_i > svc_b:
                    changes.append({"checkpoint": cid, "station": sid, "action": f"Allow more time per passenger at {sid} for thorough processing"})

            # 3. Task changes (friendlier wording)
            for sid in set(b_map.keys()) & set(i_map.keys()):
                b_tasks = {t["Task_Name"]: t for t in b_map[sid].get("Tasks", [])}
                i_tasks = {t["Task_Name"]: t for t in i_map[sid].get("Tasks", [])}
                for tname in set(i_tasks.keys()) - set(b_tasks.keys()):
                    changes.append({"checkpoint": cid, "station": sid, "action": f"Add '{tname}' step to the processing workflow at {sid}"})
                for tname in set(b_tasks.keys()) - set(i_tasks.keys()):
                    changes.append({"checkpoint": cid, "station": sid, "action": f"Remove '{tname}' step to simplify processing at {sid}"})

    return changes


def _extract_structured_findings(comparison_data: dict) -> dict:
    """Crunch the numbers and return structured findings."""
    baseline = comparison_data.get("comparison", {}).get("baseline", {})
    inferred = comparison_data.get("comparison", {}).get("inferred", {})
    delta = comparison_data.get("comparison", {}).get("delta", {})

    base_ck = baseline.get("per_checkpoint", {})
    inf_ck = inferred.get("per_checkpoint", {})
    delta_ck = delta.get("per_checkpoint", {})

    improvements = []
    regressions = []
    for cid, d in delta_ck.items():
        p95_delta = d.get("p95", 0)
        if p95_delta < -0.5:
            improvements.append({
                "checkpoint_id": cid,
                "p95_delta_min": round(p95_delta, 2),
                "baseline_p95": base_ck.get(cid, {}).get("p95", 0),
                "inferred_p95": inf_ck.get(cid, {}).get("p95", 0),
            })
        elif p95_delta > 0.5:
            regressions.append({
                "checkpoint_id": cid,
                "p95_delta_min": round(p95_delta, 2),
                "baseline_p95": base_ck.get(cid, {}).get("p95", 0),
                "inferred_p95": inf_ck.get(cid, {}).get("p95", 0),
            })

    improvements.sort(key=lambda x: x["p95_delta_min"])
    regressions.sort(key=lambda x: x["p95_delta_min"], reverse=True)

    base_st = baseline.get("per_station", {})
    inf_st = inferred.get("per_station", {})
    delta_st = delta.get("per_station", {})

    station_improvements = []
    station_regressions = []
    for cid, stations in delta_st.items():
        for sid, d in stations.items():
            p95_delta = d.get("p95", 0)
            if p95_delta < -0.5:
                station_improvements.append({
                    "checkpoint_id": cid,
                    "station_id": sid,
                    "p95_delta_min": round(p95_delta, 2),
                    "baseline_p95": base_st.get(cid, {}).get(sid, {}).get("p95", 0),
                    "inferred_p95": inf_st.get(cid, {}).get(sid, {}).get("p95", 0),
                })
            elif p95_delta > 0.5:
                station_regressions.append({
                    "checkpoint_id": cid,
                    "station_id": sid,
                    "p95_delta_min": round(p95_delta, 2),
                    "baseline_p95": base_st.get(cid, {}).get(sid, {}).get("p95", 0),
                    "inferred_p95": inf_st.get(cid, {}).get(sid, {}).get("p95", 0),
                })

    station_improvements.sort(key=lambda x: x["p95_delta_min"])
    station_regressions.sort(key=lambda x: x["p95_delta_min"], reverse=True)

    def _band_status(p95: float) -> str:
        if p95 == 0:
            return "unknown"
        if p95 < 3:
            return "over_design"
        if p95 <= 12:
            return "optimum"
        return "sub_optimum"

    iata_counts = {"optimum": 0, "sub_optimum": 0, "over_design": 0, "unknown": 0}
    for cid, ck in inf_ck.items():
        p95 = ck.get("p95", 0)
        iata_counts[_band_status(p95)] += 1

    # Operational changes
    operational_changes = _extract_operational_changes(
        comparison_data.get("baseline_aero", {}),
        comparison_data.get("inferred_aero", {}),
    )

    # Totals across ALL checkpoints / stations (not just top N)
    total_checkpoint_p95_delta = round(sum(d.get("p95", 0) for d in delta_ck.values()), 2)
    total_station_p95_delta = round(
        sum(d.get("p95", 0) for stations in delta_st.values() for d in stations.values()), 2
    )
    total_improvements_p95 = round(sum(d.get("p95", 0) for d in delta_ck.values() if d.get("p95", 0) < 0), 2)
    total_regressions_p95 = round(sum(d.get("p95", 0) for d in delta_ck.values() if d.get("p95", 0) > 0), 2)

    return {
        "baseline_reward": round(baseline.get("reward", 0), 2),
        "inferred_reward": round(inferred.get("reward", 0), 2),
        "reward_delta": round(delta.get("reward", 0), 2),
        "completion_delta": round(delta.get("completion_rate", 0), 4),
        "mean_journey_delta_min": round(delta.get("mean_journey_min", 0), 2),
        "p95_journey_delta_min": round(delta.get("p95_journey_min", 0), 2),
        "top_improvements": improvements[:3],
        "top_regressions": regressions[:3],
        "station_improvements": station_improvements[:5],
        "station_regressions": station_regressions[:5],
        "iata_compliance": iata_counts,
        "total_checkpoints": len(inf_ck),
        "operational_changes": operational_changes,
        "total_checkpoint_p95_delta": total_checkpoint_p95_delta,
        "total_station_p95_delta": total_station_p95_delta,
        "total_improvements_p95": total_improvements_p95,
        "total_regressions_p95": total_regressions_p95,
        "improvement_count": len(improvements),
        "regression_count": len(regressions),
    }


def _build_prompt(findings: dict, comparison_data: dict) -> str:
    changes = findings.get("operational_changes", [])
    changes_text = "\n".join(f"- {c['action']}" for c in changes[:15]) if changes else "No structural changes detected."

    prompt = f"""You are an upbeat airport operations consultant. Based on the following DES simulation comparison between a BASELINE airport configuration and an AI-INFERRED optimized configuration, write an encouraging, optimistic executive summary followed by a clear action plan.

Key metrics:
- Baseline reward: {findings['baseline_reward']}
- Inferred reward: {findings['inferred_reward']}
- Reward improvement: {findings['reward_delta']}
- Completion rate change: {findings['completion_delta']}
- Mean journey time change: {findings['mean_journey_delta_min']} min
- P95 journey time change: {findings['p95_journey_delta_min']} min

Top improvements (P95 wait time reduction):
{json.dumps(findings['top_improvements'], indent=2)}

Top regressions (P95 wait time increase):
{json.dumps(findings['top_regressions'], indent=2)}

Top station-level improvements (P95 wait time reduction):
{json.dumps(findings.get('station_improvements', []), indent=2)}

Top station-level regressions (P95 wait time increase):
{json.dumps(findings.get('station_regressions', []), indent=2)}

IATA compliance distribution (inferred config):
{json.dumps(findings['iata_compliance'], indent=2)}

Proposed structural changes:
{changes_text}

Rules for the response:
1. First paragraph: optimistic executive summary highlighting the biggest wins. Use encouraging language (e.g., "Great news — Security throughput jumped 40%").
2. Then a section titled "RECOMMENDED ACTIONS:" with a short numbered list of practical, user-friendly steps (e.g., "Open 2 additional Security lanes during peak hours", "Reassign 3 staff to Check-in Desk 2").
3. Focus on positive, actionable changes. Do NOT mention buffer zones or holding areas.
4. If minor regressions exist, frame them gently as "fine-tuning opportunities" with quick fixes.
5. Keep the overall tone friendly and confidence-inspiring.
"""
    return prompt


def generate_insights(comparison_filepath: str, api_key: Optional[str] = None,
                      model_name: str = "gemini-1.5-flash-latest") -> dict:
    """Generate insights using Gemini LLM. Falls back to rule-based on any API error."""
    if not GEMINI_AVAILABLE:
        raise RuntimeError("google-generativeai is not installed")

    if not api_key:
        api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set. Pass it or set the env var.")

    if not os.path.exists(comparison_filepath):
        raise FileNotFoundError(f"Comparison file not found: {comparison_filepath}")

    comparison_data = _load_comparison(comparison_filepath)
    findings = _extract_structured_findings(comparison_data)
    prompt = _build_prompt(findings, comparison_data)

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(prompt)
        return {
            "summary": response.text,
            "structured": findings,
            "model_used": model_name,
            "comparison_file": comparison_filepath,
        }
    except Exception as e:
        # Any Gemini failure (invalid key, rate limit, network) → fallback
        import warnings
        warnings.warn(f"Gemini call failed ({type(e).__name__}: {e}). Returning rule-based fallback.")
        fallback = generate_insights_fallback(comparison_filepath)
        fallback["gemini_error"] = f"{type(e).__name__}: {e}"
        return fallback


def generate_insights_fallback(comparison_filepath: str) -> dict:
    """Generate insights without LLM — pure structured data."""
    if not os.path.exists(comparison_filepath):
        raise FileNotFoundError(f"Comparison file not found: {comparison_filepath}")

    comparison_data = _load_comparison(comparison_filepath)
    findings = _extract_structured_findings(comparison_data)

    parts = []
    parts.append(
        f"Great news! The AI-optimized configuration improves the overall reward by "
        f"{findings['reward_delta']:.2f} points ({findings['baseline_reward']:.2f} -> {findings['inferred_reward']:.2f})."
    )

    if findings["top_improvements"]:
        names = [i["checkpoint_id"] for i in findings["top_improvements"]]
        parts.append(f"Passengers will enjoy shorter wait times at: {', '.join(names)}.")
    if findings["top_regressions"]:
        names = [r["checkpoint_id"] for r in findings["top_regressions"]]
        parts.append(f"A quick fine-tune is suggested for: {', '.join(names)}.")
    if findings.get("station_improvements"):
        names = [f"{i['station_id']} ({i['checkpoint_id']})" for i in findings["station_improvements"]]
        parts.append(f"Station-level wins: {', '.join(names)}.")
    if findings.get("station_regressions"):
        names = [f"{r['station_id']} ({r['checkpoint_id']})" for r in findings["station_regressions"]]
        parts.append(f"Stations needing attention: {', '.join(names)}.")

    parts.append(
        f"IATA compliance looks strong with {findings['iata_compliance']['optimum']} checkpoints in the optimum band."
    )

    summary = " ".join(parts)

    # Append action items list (filter out buffer-related changes)
    changes = findings.get("operational_changes", [])
    changes = [c for c in changes if "buffer" not in c["action"].lower()]
    if changes:
        action_items = "\n".join(f"{i+1}. {c['action']}" for i, c in enumerate(changes[:20]))
        summary += f"\n\nRECOMMENDED ACTIONS:\n{action_items}"

    return {
        "summary": summary,
        "structured": findings,
        "model_used": "rule_based_fallback",
        "comparison_file": comparison_filepath,
    }
