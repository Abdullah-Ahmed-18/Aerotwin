from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel
import json, numpy as np
import tempfile, os
from datetime import datetime
from typing import Tuple

from model_loader import load_policy
from parse_iql_v2 import featurize_absconfig, ALL_CHECKPOINTS, parse_stats
from structural_decoder import action_to_aeroconfig_structural
from iata_reward import compute_reward_iata, IATA_LOS
from des_engine import run_single
from des_output import write_stats, write_csv
from insights import generate_insights, generate_insights_fallback, GEMINI_AVAILABLE

app = FastAPI()

# ── Load once at startup ──
MODEL = load_policy("./models/ppo_v1_production.zip")
SCALERS = json.load(open("./models/reward_scaler.json"))
ACTION_SC = json.load(open("./models/action_scaler.json"))
BASELINE = json.load(open("./baseline/baseline.json"))

a_min = np.array(ACTION_SC["a_min"], dtype=np.float32)
a_max = np.array(ACTION_SC["a_max"], dtype=np.float32)
a_range = np.where((a_max - a_min) > 1e-8, a_max - a_min, 1.0)

COMPARISONS_DIR = "./comparisons"
os.makedirs(COMPARISONS_DIR, exist_ok=True)


# ── Helpers ─────────────────────────────────────────────────────

def _run_simulation(aero_config: dict, abs_config: dict, seed: int = 42, pax_count: int = 100) -> Tuple[float, dict, list]:
    """Run DES and return (reward, stats_dict, event_records)."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as fa:
        json.dump(aero_config, fa)
        aero_path = fa.name

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as fb:
        json.dump(abs_config, fb)
        abs_path = fb.name

    stats_path = aero_path.replace(".json", "_STATS.txt")

    try:
        records = run_single(aero_path, abs_path, seed=seed, pax_count=pax_count)
        write_stats(records, stats_path)

        completed = [r for r in records if r.exit_time > 0]
        if not completed:
            stats = {
                "per_checkpoint": {},
                "mean_journey_min": 0.0,
                "p95_journey_min": 0.0,
                "completion_rate": 0.0,
            }
        else:
            stats = parse_stats(stats_path)

        reward, info = compute_reward_iata(stats, csv_df=None)
        stats["reward"] = reward
        stats["reward_info"] = info
        return reward, stats, records
    finally:
        for p in (aero_path, abs_path, stats_path):
            if os.path.exists(p):
                os.unlink(p)


def _build_comparison(baseline_stats: dict, inferred_stats: dict) -> dict:
    """Build a side-by-side comparison with deltas."""
    base_ck = baseline_stats.get("per_checkpoint", {})
    inf_ck = inferred_stats.get("per_checkpoint", {})
    all_cids = set(base_ck.keys()) | set(inf_ck.keys())

    delta_ck = {}
    for cid in all_cids:
        b = base_ck.get(cid, {})
        i = inf_ck.get(cid, {})
        delta_ck[cid] = {
            "mqt": round(i.get("mqt", 0) - b.get("mqt", 0), 2),
            "p95": round(i.get("p95", 0) - b.get("p95", 0), 2),
            "throughput": round(i.get("throughput", 0) - b.get("throughput", 0), 2),
        }

    base_st = baseline_stats.get("per_station", {})
    inf_st = inferred_stats.get("per_station", {})
    all_cids_st = set(base_st.keys()) | set(inf_st.keys())
    delta_st = {}
    for cid in all_cids_st:
        b_stations = base_st.get(cid, {})
        i_stations = inf_st.get(cid, {})
        all_sids = set(b_stations.keys()) | set(i_stations.keys())
        delta_st[cid] = {}
        for sid in all_sids:
            b = b_stations.get(sid, {})
            i = i_stations.get(sid, {})
            delta_st[cid][sid] = {
                "mqt": round(i.get("mqt", 0) - b.get("mqt", 0), 2),
                "p95": round(i.get("p95", 0) - b.get("p95", 0), 2),
                "throughput": round(i.get("throughput", 0) - b.get("throughput", 0), 2),
            }

    return {
        "baseline": {
            "reward": round(baseline_stats.get("reward", 0), 4),
            "completion_rate": round(baseline_stats.get("completion_rate", 0), 4),
            "mean_journey_min": round(baseline_stats.get("mean_journey_min", 0), 2),
            "p95_journey_min": round(baseline_stats.get("p95_journey_min", 0), 2),
            "per_checkpoint": base_ck,
            "per_station": base_st,
        },
        "inferred": {
            "reward": round(inferred_stats.get("reward", 0), 4),
            "completion_rate": round(inferred_stats.get("completion_rate", 0), 4),
            "mean_journey_min": round(inferred_stats.get("mean_journey_min", 0), 2),
            "p95_journey_min": round(inferred_stats.get("p95_journey_min", 0), 2),
            "per_checkpoint": inf_ck,
            "per_station": inf_st,
        },
        "delta": {
            "reward": round(inferred_stats.get("reward", 0) - baseline_stats.get("reward", 0), 4),
            "completion_rate": round(inferred_stats.get("completion_rate", 0) - baseline_stats.get("completion_rate", 0), 4),
            "mean_journey_min": round(inferred_stats.get("mean_journey_min", 0) - baseline_stats.get("mean_journey_min", 0), 2),
            "p95_journey_min": round(inferred_stats.get("p95_journey_min", 0) - baseline_stats.get("p95_journey_min", 0), 2),
            "per_checkpoint": delta_ck,
            "per_station": delta_st,
        }
    }


def _save_comparison(abs_config: dict, baseline_aero: dict, inferred_aero: dict,
                     comparison: dict, seed: int, pax_count: int) -> str:
    """Save comparison to disk and return the file path."""
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"comparison_{timestamp}.json"
    filepath = os.path.join(COMPARISONS_DIR, filename)

    payload = {
        "timestamp": timestamp,
        "seed": seed,
        "pax_count": pax_count,
        "abs_config": abs_config,
        "baseline_aero": baseline_aero,
        "inferred_aero": inferred_aero,
        "comparison": comparison,
    }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    return filepath


# ── Endpoints ───────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "model": "ppo_v1"}


@app.post("/infer")
async def infer(request: Request):
    """Takes ABS JSON dict or uploaded files, plus optional AERO config, returns recommended AERO config.
    If AERO config is provided, runs DES on both the baseline and inferred configs and returns a comparison."""
    content_type = request.headers.get("content-type", "")

    # ── Parse request ──
    if "multipart/form-data" in content_type:
        form = await request.form()
        abs_file = form.get("abs_file")
        aero_file = form.get("aero_file")
        if abs_file is None:
            raise HTTPException(status_code=400, detail="abs_file is required")
        abs_config = json.loads(await abs_file.read())
        aero_config = json.loads(await aero_file.read()) if aero_file else None
        seed = int(form.get("seed", 42))
        pax_count = int(form.get("pax_count", 100))
    else:
        body = await request.json()
        if "abs_config" in body:
            abs_config = body["abs_config"]
            aero_config = body.get("aero_config")
        else:
            abs_config = body
            aero_config = None
        seed = body.get("seed", 42)
        pax_count = body.get("pax_count", 100)

    baseline_cfg = aero_config if aero_config is not None else BASELINE

    # ── Inference ──
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(abs_config, f)
        abs_path = f.name

    try:
        state = featurize_absconfig(abs_path)
        action_norm, _ = MODEL.predict(state[None, :], deterministic=True)
        action_norm = np.clip(action_norm[0], 0, 1)
        action_real = action_norm * a_range + a_min

        inferred_aero = action_to_aeroconfig_structural(
            action_norm=action_norm,
            action_real=action_real,
            baseline_cfg=baseline_cfg,
            episode=0
        )
    finally:
        os.unlink(abs_path)

    # ── If no baseline AERO was provided, return inference only (backward compat) ──
    if aero_config is None:
        return {"aero_config": inferred_aero, "action_norm": action_norm.tolist()}

    # ── Run DES on both configs for comparison ──
    try:
        base_reward, base_stats, _ = _run_simulation(baseline_cfg, abs_config, seed=seed, pax_count=pax_count)
        inf_reward, inf_stats, _ = _run_simulation(inferred_aero, abs_config, seed=seed, pax_count=pax_count)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")

    comparison = _build_comparison(base_stats, inf_stats)
    saved_to = _save_comparison(abs_config, baseline_cfg, inferred_aero, comparison, seed, pax_count)

    return {
        "aero_config": inferred_aero,
        "action_norm": action_norm.tolist(),
        "comparison": comparison,
        "saved_to": saved_to,
    }


@app.post("/simulate")
def simulate_endpoint(body: dict):
    """Runs DES on given AERO + ABS, returns per-checkpoint stats."""
    aero_config = body.get("aero_config")
    abs_config = body.get("abs_config")
    seed = body.get("seed", 42)
    pax_count = body.get("pax_count", 100)

    if not aero_config or not abs_config:
        raise HTTPException(status_code=400, detail="aero_config and abs_config are required")

    try:
        reward, stats, _ = _run_simulation(aero_config, abs_config, seed=seed, pax_count=pax_count)
        return {
            "reward": stats["reward"],
            "completion_rate": stats["completion_rate"],
            "mean_journey_min": stats["mean_journey_min"],
            "p95_journey_min": stats["p95_journey_min"],
            "per_checkpoint": stats.get("per_checkpoint", {}),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")


@app.post("/insights")
async def insights_endpoint(request: Request):
    """Generate natural-language insights from a saved comparison file.
    Accepts JSON body {comparison_file: filename} OR multipart upload."""
    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        form = await request.form()
        uploaded = form.get("comparison_file")
        if uploaded is None:
            raise HTTPException(status_code=400, detail="comparison_file is required")
        filename = os.path.basename(uploaded.filename)
        filepath = os.path.join(COMPARISONS_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(await uploaded.read())
    else:
        body = await request.json()
        filename = body.get("comparison_file")
        if not filename:
            raise HTTPException(status_code=400, detail="comparison_file is required")
        filename = os.path.basename(filename)
        filepath = os.path.join(COMPARISONS_DIR, filename)

    api_key = os.environ.get("GEMINI_API_KEY")

    try:
        if api_key and GEMINI_AVAILABLE:
            result = generate_insights(filepath, api_key=api_key)
        else:
            result = generate_insights_fallback(filepath)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
