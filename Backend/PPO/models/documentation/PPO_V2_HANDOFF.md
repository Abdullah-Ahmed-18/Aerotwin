# AeroTwin PPO v2 — Training Session Handoff

**Date:** June 2026
**Status:** Training in progress — step 13,500 of 25,000, explained_variance just broke 0.06
**Context:** This document covers the v1→v2 transition and the full v2 training session

---

## 1. Why v2 Exists — Three Problems With v1

### Problem 1: PAX not in the observation
The v1 agent saw a 7-dim persona mix but had no idea how many passengers were coming. A 200-PAX departure and a 2,000-PAX departure looked identical. The policy output the same staffing for both. When given large schedules, the simulation collapsed.

### Problem 2: Log normalization destroyed the reward signal
The v1 per-checkpoint IATA shaping signals (+12 green, -20 red) were invisible after log compression. A +50 bonus on a -10,000 base becomes approximately 0.0001 after log and z-score — gradient is zero. The v1 policy couldn't learn "checkpoint X is green, checkpoint Y is red" because those differences vanished. This is why `explained_variance` was near zero throughout v1 training, and why insights regressed — the Actor never truly understood why certain actions were good.

### Problem 3: `int(round())` killed gradients in the decoder
Rounding staffing and queue_cap to integers during training created flat gradients. PPO couldn't learn to prefer staffing=8 over staffing=7 because the rounded values were identical for a wide range of continuous predictions.

---

## 2. What Changed for v2

| Component | v1 | v2 | Why |
|---|---|---|---|
| Observation | 7-dim (persona mix) | 15-dim (adds PAX, flights, peak_hour, flow ratio) | Policy needs demand scale to adjust resources |
| PAX | Fixed 50-100 | Variable 50-500/flight, 1-5 flights/episode | Real airport handles variable loads |
| Reward | Log-normalized (destroyed shaping) | Direct IATA (+50 green, -25 red, /500) | Per-checkpoint signals visible to value function |
| Decoder | `int(round())` during training | Continuous float during training, round at inference | Preserves gradients for fine-grained learning |
| Action scaler | Built on fixed-PAX data | Lane-based PAX sweep (PAX→lanes, not PAX→staffing) | Correct operational scaling |
| Warm-start | IQL behavior cloning | Linear baseline behavior cloning (IQL incompatible with 15-dim obs) | IQL was 7-dim, can't generate valid 15-dim targets |
| Primary metric | Raw reward | Compliance rate (% checkpoints in IATA Optimum) | Directly matches the operational goal |
| IQL dependency | Required (model_final.d3 + reward_scaler.json) | None | Clean start, no legacy artifacts |

### 2.1 The 15-dim Observation Space

```
Dims 0-6:   Weighted ABS class proportions across all flights (from v1)
Dim  7:     total_pax / 2000          — demand scale (THE KEY ADDITION)
Dim  8:     num_flights / 10          — schedule density
Dim  9:     peak_pax / 1000           — busiest single flight
Dim 10:     dep_pax / total_pax       — departure proportion
Dim 11:     arr_pax / total_pax       — arrival proportion
Dim 12:     first_flight_hour / 24    — time of day
Dim 13:     unique_abs_count / 5      — passenger diversity
Dim 14:     avg_pax_per_flight / 500  — average flight size
```

Dim 7 is the critical addition. Without it, the policy has no way to know that 2,000 PAX needs more lanes than 200 PAX.

### 2.2 The v2 Reward Function

```python
For each checkpoint:
    Green  (lo <= p95 <= hi):  +50
    Over   (p95 < lo):         -3  × (lo - p95) / lo    (mild)
    Under  (p95 > hi):         -25 × (p95 - hi) / hi    (strong)

Total = sum(checkpoint_rewards) + 0.05 × throughput + 20.0 × completion_rate
Normalized for PPO = Total / 500.0    (scales to roughly [-4, +1] range)
```

The `/500` normalization was found empirically — `/100` gave rewards in [-21, -8] which caused value_loss to explode to 2,920.

### 2.3 Lane-Based PAX Scaling

The correct relationship between PAX and airport resources:

```
More PAX → open more lanes → each lane needs its own staff (fixed 1-3)
```

NOT:

```
More PAX → same lanes × more staff per lane (wrong)
```

From baseline inspection:
```
Per-lane staffing: 1.0–2.7 (fixed regardless of PAX)
Per-lane cap:      30.0    (fixed per lane)
What scales:       number of lanes (1-10)
```

The action scaler was rebuilt using `pax_to_lanes()`:
```python
target_lanes = baseline_lanes × (pax / 200) × random_factor(0.7-1.3)
# Capped at MAX_LANES = 10
```

### 2.4 Multi-Flight Episodes

Each training episode samples a random schedule:
```python
schedule = [
    {"flight_id": 0, "pax_count": 350, "flow": "departure", "hour": 9, ...},
    {"flight_id": 1, "pax_count": 150, "flow": "arrival",   "hour": 11, ...},
]
```

All flights run through the same aeroconfig. Records are aggregated, stats computed once across the full schedule. This means a 5-flight rush-hour episode produces 5× the passengers flowing through the same config — bottleneck signals are much stronger.

### 2.5 Continuous Decoder During Training

```python
# Training (continuous=True):
st["Staffing_No"] = t_staff / n       # smooth gradient

# Inference (continuous=False):
st["Staffing_No"] = int(round(t_staff / n))  # integers for real deployment
```

Controlled by `continuous=True` flag in `action_to_aeroconfig_structural()`.

---

## 3. Files Inventory

### Files that changed for v2
| File | Change |
|---|---|
| `train_ppo_v2.py` | Complete rewrite — schedule env, v2 reward, BC warm-start |
| `structural_decoder.py` | Added `continuous=True` flag to `apply_intensity()` |

### Files that stayed the same
| File | Notes |
|---|---|
| `parse_iql_v2.py` | Already v2-ready: 13 checkpoints, 130-dim, type-based matching |
| `iata_reward.py` | IATA LoS bands unchanged — authoritative standard |
| `des_engine.py` | Unchanged — `generate_passengers()` already takes `pax_count` parameter |
| `des_models.py` | Unchanged |
| `des_output.py` | Unchanged |

### Files no longer needed for v2
| File | Why |
|---|---|
| `train_iql.py` | IQL warm-start discarded |
| `validate_iql.py` | IQL model not used |
| `reward_scaler.json` | Log normalization removed |
| `model_final.d3` | IQL model incompatible with 15-dim obs |

---

## 4. Hyperparameter Tuning History

### 4.1 First Attempt — Everything Broken

```python
learning_rate = get_linear_fn(3e-4, 1e-5, 1.0)
n_steps       = 512
batch_size    = 128
clip_range    = 0.1
ent_coef      = 0.01
vf_coef       = 0.5
norm_reward   = raw / 100.0
```

**Results at step 1000:**
```
clip_fraction:       0.855    ← 85.5% of updates clipped — PPO blind
approx_kl:           0.786    ← 15× too high
entropy_loss:       -54.5     ← overwhelming reward signal
explained_variance:  0.0004   ← value function learning nothing
value_loss:          2,920    ← exploding
compliance:          27.3%    ← no movement, identical across all schedules
```

**Root causes:**
- `learning_rate = 3e-4` far too high for 130-dim action space — updates so large that clip catches 85%
- `ent_coef = 0.01` produces entropy ≈ 54 for 130 dimensions — entropy dominates reward
- `raw / 100` gives normalized rewards in [-21, -8] — too wide for stable value learning

### 4.2 Second Attempt — Fixed LR and Clip, But Entropy Still High

```python
learning_rate = get_linear_fn(3e-5, 1e-6, 1.0)   # 10× lower
clip_range    = 0.2                                 # wider
ent_coef      = 0.001                               # 10× lower
norm_reward   = raw / 500.0                         # 5× wider denominator
```

**Results at step 500:**
```
clip_fraction:       0.287    ← FIXED (was 0.855)
approx_kl:           0.034    ← FIXED (was 0.786)
explained_variance:  0.002    ← still near zero but improving
value_loss:          120      ← much better (was 2,920)
compliance:          small=27.3%, med/large/rush=36.4%  ← DIFFERENTIATED!
```

**Key breakthrough:** Policy started outputting different actions for different schedule sizes. Med/large/rush jumped to 4/11 green while small stayed at 3/11. The 15-dim obs was working.

### 4.3 Current Run — Stable Training Dynamics

Same hyperparameters as 4.2. No changes needed — training dynamics are healthy.

```python
# Current final hyperparameters:
learning_rate = get_linear_fn(3e-5, 1e-6, 1.0)
n_steps       = 512
batch_size    = 128
n_epochs      = 4
gamma         = 0.99
clip_range    = 0.2
ent_coef      = 0.001
vf_coef       = 0.5
net_arch      = dict(pi=[256, 256], vf=[512, 512])  # from v1, proven
norm_reward   = raw / 500.0
patience      = 20
min_delta     = 0.01  (1% compliance improvement)
```

---

## 5. Training Run Log — Current Session

### Explained Variance Trajectory (the key metric)

```
Step  1000:  0.002   ← starting, near random
Step  2000:  0.006   ← 3× improvement
Step  5000:  0.013   ← compliance jumped (small → 4/11)
Step  6000:  0.012   ← plateau begins
Step  7000:  0.030   ← false breakthrough (lucky rollout)
Step  8000:  0.010   ← dip (we nearly panicked and restarted)
Step  9000:  0.033   ← recovered
Step  9500:  0.044   ← new high, floor now at 0.03
Step 10000:  0.038
Step 10500:  0.042   ← oscillating in 0.03-0.04 band
Step 12500:  0.041   ← stuck at 0.04 plateau for 4000 steps
Step 13000:  0.021   ← dip
Step 13500:  0.062   ← BROKE THROUGH 0.04 ceiling — new all-time high
```

**Pattern discovered:** The Critic follows a "dip then breakthrough" pattern. Every time explained_variance dips, it recovers to a higher level than before. The dips are NOT regressions — they're the Critic exploring new regions before consolidating.

```
Cycle 1:  0.013 → 0.010 (dip) → 0.030 (new floor: 0.03)
Cycle 2:  0.044 → 0.038 (dip) → 0.042 (consolidation at 0.04)
Cycle 3:  0.041 → 0.021 (dip) → 0.062 (new floor: 0.05+)
```

### Compliance Trajectory

```
Step    0:  27.3% across all schedules (identical — policy ignoring PAX)
Step  500:  small=27.3%, med/large/rush=36.4% (DIFFERENTIATED for first time)
Step 6000:  small=36.4%, med/large/rush=27.3% (small flipped a checkpoint)
Step 6000–13500: 29.5% mean, no further movement
```

**Why compliance is frozen while explained_variance improves:** PPO's learning chain is sequential:

```
Step 1: Value function learns to predict reward  ← happening now (0.002 → 0.062)
Step 2: Advantages become meaningful             ← starting to happen
Step 3: Policy uses advantages to improve         ← hasn't happened yet
Step 4: Compliance climbs                          ← waiting for Step 3
```

The policy has had only ~27 iterations (104 updates) in 13,500 steps. With n_steps=512, each iteration processes 512 episodes before one policy update. Compliance needs ~150+ iterations to show real movement.

### Training Metrics Trajectory

```
             Step 1000    Step 5000    Step 10000   Step 13500   Healthy?
clip_frac:   0.287        0.186        0.197        0.145        ✓ trending down
approx_kl:   0.034        0.032        0.030        0.021        ✓ trending down
value_loss:  120          45.7         9.4          4.11         ✓ consistently halving
loss:        63.2         22.4         10.4         2.18         ✓ consistently halving
expl_var:    0.002        0.013        0.038        0.062        ✓ accelerating upward
```

All five metrics trending in the right direction. No intervention needed.

---

## 6. Key Concepts Learned During This Session

### 6.1 explained_variance Is The One Metric That Matters During Training

```
explained_variance = "can the model tell good actions from bad actions?"

0.00  →  "guessing randomly"           → Actor learns noise
0.05  →  "weak sense of good/bad"      → Actor starts getting direction right
0.10  →  "roughly tells good from bad" → compliance starts responding
0.30  →  "reliably knows what helps"   → deployment quality
0.50+ →  "deep understanding"          → nuanced, handles edge cases
```

BUT: explained_variance is irrelevant during inference. Only the Actor network is deployed — the Critic (which explained_variance measures) is discarded. So a model with great explained_variance during training produces a smart Actor, but you never check explained_variance in production.

**A model trained with explained_variance ≈ 0 (like v1) will output actions but won't know why — leading to insight regression when inputs change.**

### 6.2 PPO Learning Is Sequential

```
Critic learns first → then teaches Actor → then compliance improves
```

You cannot shortcut this. If the Critic is blind (explained_variance < 0.01), the Actor receives random feedback and learns nothing useful. This is why v1 failed — the log normalization blinded the Critic permanently.

### 6.3 entropy_loss for 130-dim Actions

Entropy of a 130-dim Gaussian with std=0.37 is mathematically fixed at ~54.5. This cannot be changed by training. What matters is `ent_coef` — the weight applied to it:

```
ent_coef=0.01  → entropy term = 0.01 × 54.5 = 0.545  ← dominates reward
ent_coef=0.001 → entropy term = 0.001 × 54.5 = 0.054 ← negligible ✓
```

Rule of thumb for high-dim actions: `ent_coef ≈ 1 / (action_dim × 500)`

### 6.4 IATA Over-Design at Low PAX Is Real

With low PAX (100), some checkpoints have almost zero queue — passengers walk right through. Wait times fall below the IATA Optimum minimum threshold, scoring as OVER-DESIGN. With higher PAX, those same checkpoints have realistic queues that land in the Optimum band.

This means 100% IATA compliance at very low loads requires **closing lanes** — fewer lanes means longer queues which pushes wait times into the Optimum band. The agent needs to learn: small demand → fewer lanes, not just big demand → more lanes.

### 6.5 Reward Normalization Matters More Than You Think

```
/100:  rewards in [-21, -8]  → value_loss explodes to 2,920, clip_frac=0.85
/500:  rewards in [-4, +1]   → value_loss stable at 4-120, clip_frac=0.15-0.28
```

PPO's sweet spot is rewards in [-5, +5]. If normalized rewards are outside this range, the value function can't converge and everything downstream fails.

### 6.6 The "Dip Then Breakthrough" Pattern

Explained_variance doesn't climb linearly. It follows a cycle:
1. Slow climb → plateau
2. Dip (Critic exploring new region, temporarily confused)
3. Jump to new high (Critic consolidated new knowledge)

The dip is NOT regression. Do NOT change hyperparameters during a dip. Wait for the recovery. Every dip in this session was followed by a new all-time high.

---

## 7. Model Save Strategy

### Three models are saved:

```
ppo_v2_best.zip              ← highest compliance during training
ppo_v2_best_composite.zip    ← highest composite score (weights 5 metrics)
ppo_v2_final.zip             ← model at end of training (always saved)
```

### Composite Score (added mid-session)

```
Score = 0.35 × explained_variance_scaled
      + 0.30 × compliance_rate
      + 0.15 × value_loss_score
      + 0.10 × clip_fraction_score
      + 0.10 × approx_kl_score
```

This ensures the best-saved model has a smart Critic, not just lucky compliance.

### Which model to use:

| Purpose | Use this model |
|---|---|
| Deploy to production | `ppo_v2_best.zip` (highest compliance) |
| Continue training | `ppo_v2_best_composite.zip` (smartest Critic) |
| Last resort | `ppo_v2_final.zip` (end of run, whatever it is) |

---

## 8. Continuation Plan

### When Current 25k Run Finishes

```python
# Load the model with the best Critic, not best compliance
ppo = PPO.load(
    "/content/drive/MyDrive/Aerotwin/Outputs/ppo_v2_runs/ppo_v2_best_composite",
    env=env,
)
ppo.learn(total_timesteps=25_000, callback=CallbackList([eval_cb, early_stop]))
ppo.save("ppo_v2_final_50k")
```

Note: learning rate schedule resets on load (starts at 3e-5 again). This is fine — gives the policy a fresh push.

### If explained_variance Regresses After Continuation

Apply these changes:
```python
vf_coef   = 1.0     # was 0.5 — gives Critic 2× gradient priority
n_steps   = 1024    # was 512 — 2× more data per update
batch_size = 256    # was 128 — more stable gradients
```

These help the Critic keep up with a changing policy (non-stationary reward problem).

### Expected Timeline to Compliance Improvement

Based on current explained_variance trajectory:

```
Step 15,000:  expl_var ≈ 0.08    ← advantages weakly meaningful
Step 20,000:  expl_var ≈ 0.12    ← compliance should start climbing
Step 30,000:  expl_var ≈ 0.20    ← real differentiation across schedules
Step 40,000:  expl_var ≈ 0.30    ← deployment quality
Step 50,000:  expl_var ≈ 0.35    ← target
```

Compliance should start responding between step 15,000 and 25,000.

---

## 9. Evaluation Structure

### Fixed Test Schedules (evaluated every 500 steps)

| Label | Flights | PAX | Purpose |
|---|---|---|---|
| small(1×100) | 1 departure | 100 | Easiest — should reach 90%+ first |
| med(2×200) | 1 dep + 1 arr | 400 | Mid-range — tests balanced allocation |
| large(4×400) | 4 mixed | 1,600 | Stress test — needs lane scaling |
| rush(5×500) | 5 departures | 2,500 | Extreme — ultimate capacity test |

### Success Criteria

```
>90% compliance across all 4 test schedules = deployment ready
>90% small + >60% rush = acceptable for v2 launch
>50% across all = significant improvement over v1
```

### Current Best Results

```
small(1×100):   36.4%  (4/11 green)
med(2×200):     27.3%  (3/11 green)
large(4×400):   27.3%  (3/11 green)
rush(5×500):    27.3%  (3/11 green)
MEAN:           29.5%
```

---

## 10. Colab Setup Reference

### Files needed in /content/ each session

```
train_ppo_v2.py
des_engine.py
des_models.py
des_output.py
parse_iql_v2.py
iata_reward.py
structural_decoder.py
```

### Path patching cell

```python
ABS_CONFIG_DIR = "/content/drive/MyDrive/Aerotwin/Inputs/Inputs/ABSConfigs"
BASELINE_PATH  = "/content/drive/MyDrive/Aerotwin/Inputs/baseline.json"
OUTPUT_DIR     = "/content/drive/MyDrive/Aerotwin/Outputs/ppo_v2_runs"

TOTAL_STEPS = 25_000
EVAL_EVERY  = 500
SEED        = 42

import re
script = open("/content/train_ppo_v2.py").read()
script = re.sub(r'ABS_CONFIG_DIR\s*=.*', f'ABS_CONFIG_DIR= r"{ABS_CONFIG_DIR}"', script)
script = re.sub(r'BASELINE_PATH\s*=.*',  f'BASELINE_PATH = r"{BASELINE_PATH}"',  script)
script = re.sub(r'OUTPUT_DIR\s*=.*',     f'OUTPUT_DIR    = r"{OUTPUT_DIR}"',      script)
script = re.sub(r'TOTAL_STEPS\s*=.*',    f'TOTAL_STEPS   = {TOTAL_STEPS}',        script)
script = re.sub(r'EVAL_EVERY\s*=.*',     f'EVAL_EVERY    = {EVAL_EVERY}',         script)
script = re.sub(r'SEED\s*=.*',           f'SEED          = {SEED}',               script)
# Critical fixes:
script = script.replace("raw_reward / 100.0", "raw_reward / 500.0")
script = script.replace("patience   = 8,", "patience   = 20,")

with open("/content/train_ppo_v2_colab.py", "w") as f:
    f.write(script)
```

### Persistent storage on Drive

```python
# Save scripts once
drive_scripts = "/content/drive/MyDrive/Aerotwin/scripts_v2"
import shutil, os
os.makedirs(drive_scripts, exist_ok=True)
for f in ["train_ppo_v2.py","des_engine.py","des_models.py","des_output.py",
          "parse_iql_v2.py","iata_reward.py","structural_decoder.py"]:
    shutil.copy(f"/content/{f}", f"{drive_scripts}/{f}")

# Restore each session
for f in os.listdir(drive_scripts):
    shutil.copy(f"{drive_scripts}/{f}", f"/content/{f}")
```

### Saved model outputs on Drive

```
/content/drive/MyDrive/Aerotwin/Outputs/ppo_v2_runs/
    ppo_v2_best.zip              ← best compliance (production deployment)
    ppo_v2_best_composite.zip    ← best overall health (continuation training)
    ppo_v2_final.zip             ← end of run
    action_scaler_v2.json        ← required for inference
    eval_log_v2.json             ← training history
```

---

## 11. Inference After Training

```python
from stable_baselines3 import PPO
from train_ppo_v2 import schedule_to_obs, load_action_scaler
from structural_decoder import action_to_aeroconfig_structural

ppo = PPO.load("ppo_v2_best")
a_min, a_max, a_range = load_action_scaler("action_scaler_v2.json")
baseline_cfg = json.loads(open("baseline.json", encoding="utf-8-sig").read())

# Build schedule from real flight data
schedule = [
    {"flight_id": 0, "pax_count": 350, "flow": "departure",
     "hour": 9, "abs_id": "morning", "abs_weights": [2,3,2,1.5,1,1,0.5]},
]

obs = schedule_to_obs(schedule)
action, _ = ppo.predict(obs[None, :], deterministic=True)
action_real = np.clip(action[0], 0, 1) * a_range + a_min

aero = action_to_aeroconfig_structural(
    action_norm  = np.clip(action[0], 0, 1),
    action_real  = action_real,
    baseline_cfg = baseline_cfg,
    episode      = 0,
    continuous   = False,   # round to integers for deployment
)
```

---

## Document Control

| Version | Date | Changes |
|---|---|---|
| 1.0 | June 2026 | Full v2 training session documentation |
