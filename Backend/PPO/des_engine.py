"""
Core DES engine — replaces the Unity runtime simulation with pure math.
Reads AerotwinConfig + ABSConfig, generates passengers, simulates queues.
"""
import json, math, random, os
from typing import List, Dict, Tuple, Optional
from des_models import (
    PersonaProfile, CharacteristicsRange, BehaviorModifiers,
    CheckpointData, StationData, TaskData, Passenger, EventRecord,
    get_default_profiles, seeded_gamma, seeded_gaussian,
    should_process_checkpoint, is_kiosk, is_terminal_gate, is_boarding_gate,
    PERSONA_NAMES, ALWAYS_PROCESS_TYPES
)

# ═══════════════════════════════════════════════════════════════
# CONFIG LOADING
# ═══════════════════════════════════════════════════════════════

def load_aero_config(path: str) -> Dict[str, List[CheckpointData]]:
    """Returns {"departure": [...], "arrival": [...]} checkpoint lists."""
    with open(path, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    result = {}
    # Dual-flow format
    for flow_key in ("Departure", "Arrival"):
        if flow_key in data and data[flow_key] and "Checkpoints" in data[flow_key]:
            result[flow_key.lower()] = _parse_checkpoints(data[flow_key]["Checkpoints"])
    # Flat format
    if not result and "Checkpoints" in data:
        result["departure"] = _parse_checkpoints(data["Checkpoints"])
    return result


def _parse_checkpoints(raw: list) -> List[CheckpointData]:
    cps = []
    for cp in raw:
        tasks_raw = cp.get("Stations", [{}])[0].get("Tasks", []) if cp.get("Stations") else []
        stations = []
        for s in cp.get("Stations", []):
            tasks = [TaskData(t["Task_Name"], t["Avg_Duration"], t.get("Probability", 1.0))
                     for t in s.get("Tasks", [])]
            stations.append(StationData(
                s["Station_ID"], s.get("Staffing_No", 1), s.get("Avg_Service_Time", 60),
                s.get("Max_Queue_Cap", 10), s.get("Efficiency_Factor", 1.0),
                s.get("Allowed_Class", ["All Classes"]), s.get("Feature_Val", 0), tasks))
        cps.append(CheckpointData(
            cp["Checkpoint_ID"], cp.get("Checkpoint_Type", ""),
            cp.get("Flow_Type", "departure"), cp.get("Prev_Anchor", ""),
            cp.get("Next_Anchor", []), stations))
    return cps


def load_abs_config(path: str) -> List[PersonaProfile]:
    """Load ABS config (weights format) and return persona profiles."""
    with open(path, "r", encoding="utf-8-sig") as f:
        data = json.load(f)
    profiles = get_default_profiles()
    weights = data.get("weights")
    if weights and len(weights) == 7:
        for i in range(7):
            profiles[i].spawn_weight = weights[i]
    return profiles


# ═══════════════════════════════════════════════════════════════
# CHECKPOINT GRAPH
# ═══════════════════════════════════════════════════════════════

Z_SPACING = 20.0   # meters between checkpoint depths
ENTRY_OFFSET = 15.0  # entry anchor offset from zone center
EXIT_OFFSET = 15.0   # exit anchor offset

def build_checkpoint_graph(checkpoints: List[CheckpointData]) -> Tuple[List[str], Dict[str, int], Dict[str, CheckpointData]]:
    """Returns (ordered_ids, depth_map, lookup)."""
    lookup = {cp.checkpoint_id: cp for cp in checkpoints}

    # Find root
    root = None
    for cp in checkpoints:
        if not cp.prev_anchor or cp.prev_anchor == "Terminal_Entrance" or cp.prev_anchor == "Boarding_Gate":
            root = cp; break
    if not root:
        # Fallback: pick one whose prev_anchor isn't in this flow
        for cp in checkpoints:
            if cp.prev_anchor not in lookup:
                root = cp; break
    if not root:
        root = checkpoints[0]

    # BFS for depth
    depth_map = {root.checkpoint_id: 0}
    queue = [(root.checkpoint_id, 0)]
    while queue:
        cid, depth = queue.pop(0)
        if cid not in lookup:
            continue
        cp = lookup[cid]
        for nxt in (cp.next_anchor or []):
            nxt_id = _resolve_id(nxt, lookup)
            if nxt_id and nxt_id in lookup:
                child_depth = depth + 1
                if nxt_id not in depth_map or depth_map[nxt_id] < child_depth:
                    depth_map[nxt_id] = child_depth
                    queue.append((nxt_id, child_depth))

    ordered = sorted(depth_map.keys(), key=lambda x: depth_map[x])
    return ordered, depth_map, lookup


def _resolve_id(token: str, lookup: Dict[str, CheckpointData]) -> Optional[str]:
    if not token:
        return None
    if token in lookup:
        return token
    token_lower = token.lower().replace("_", "").replace("-", "").replace(" ", "")
    for k, v in lookup.items():
        k_norm = k.lower().replace("_", "").replace("-", "").replace(" ", "")
        if k_norm == token_lower:
            return k
    for k, v in lookup.items():
        t_norm = v.checkpoint_type.lower().replace("_", "").replace("-", "").replace(" ", "")
        if t_norm == token_lower:
            return k
    return None


def compute_walk_time(depth_from: int, depth_to: int) -> float:
    """Walking time in seconds between two checkpoint depths at ~1.4 m/s base speed."""
    dist = abs(depth_to - depth_from) * Z_SPACING + ENTRY_OFFSET + EXIT_OFFSET
    return dist  # Will be divided by passenger speed later


# ═══════════════════════════════════════════════════════════════
# PASSENGER GENERATION  (mirrors PassengerSpawner debug spawn)
# ═══════════════════════════════════════════════════════════════

def generate_passengers(profiles: List[PersonaProfile], count: int, seed: int) -> List[Passenger]:
    rng = random.Random(seed)

    # Pre-compute everything deterministically (mirrors C# SpawnDebugPassengersCoroutine)
    inter_arrivals = [seeded_gamma(rng, 2.0, 0.5) for _ in range(count)]
    persona_choices = [_pick_weighted(profiles, rng) for _ in range(count)]
    char_seeds = [rng.randint(0, 2**31 - 1) for _ in range(count)]

    passengers = []
    spawn_time = 0.0
    for i in range(count):
        spawn_time += inter_arrivals[i]
        persona = persona_choices[i]
        p = _init_passenger(f"DebugPassenger_{i+1}_{persona.display_name}",
                            persona, char_seeds[i], spawn_time)
        passengers.append(p)
    return passengers


def _pick_weighted(profiles: List[PersonaProfile], rng: random.Random) -> PersonaProfile:
    total = sum(p.spawn_weight for p in profiles)
    roll = rng.random() * total
    cum = 0.0
    for p in profiles:
        cum += p.spawn_weight
        if roll <= cum:
            return p
    return profiles[0]


def _init_passenger(name: str, persona: PersonaProfile, char_seed: int, spawn_time: float) -> Passenger:
    """Mirrors PassengerAgent.InitFromProfile() with deterministic seed."""
    rng = random.Random(char_seed)
    c = persona.characteristics

    pclass = "Business" if rng.random() < c.business_class_chance else "Economy"
    age = rng.randint(c.age_min, c.age_max)
    fitness = c.fitness_min + rng.random() * (c.fitness_max - c.fitness_min)
    tech = c.tech_savvy_min + rng.random() * (c.tech_savvy_max - c.tech_savvy_min)
    exp = rng.randint(c.exp_min, c.exp_max)
    imp = c.impatience_min + rng.random() * (c.impatience_max - c.impatience_min)
    tp = c.time_pressure_min + rng.random() * (c.time_pressure_max - c.time_pressure_min)
    lug = c.luggage_min + rng.random() * (c.luggage_max - c.luggage_min)

    # Speed (mirrors ApplyMovementModifiers)
    base_speed = 1.4
    fitness_boost = 0.8 + (1.3 - 0.8) * fitness
    luggage_penalty = 1.0 + (0.7 - 1.0) * lug
    urgency_boost = 1.0 + (1.25 - 1.0) * tp
    speed = base_speed * fitness_boost * luggage_penalty * urgency_boost * persona.behavior.speed_multiplier

    # Kiosk affinity (mirrors ComputeKioskAffinity with persona)
    ka = tech * 0.4 + persona.behavior.kiosk_preference * 0.4 + (exp / 10.0) * 0.2
    ka = max(0.0, min(1.0, ka))

    return Passenger(name, persona, pclass, age, fitness, tech, exp, imp, tp, lug, ka, speed, spawn_time)


# ═══════════════════════════════════════════════════════════════
# STATION SCORING  (mirrors DecideCounter)
# ═══════════════════════════════════════════════════════════════

def score_station(pax: Passenger, station: StationData, cp_type: str,
                  queue_len: int, is_kiosk_type: bool) -> float:
    if is_terminal_gate(cp_type):
        return 999 - queue_len  # Prefer fewer people

    score = 0.0
    imp_bonus = pax.persona.behavior.queue_impatience_bonus
    kiosk_pref = pax.persona.behavior.kiosk_preference
    score -= queue_len * (1.5 * (pax.impatience + imp_bonus) + pax.time_pressure)
    score += (15.0 - min(station.avg_service_time / 60.0, 15.0)) / 15.0
    if is_kiosk_type:
        score += kiosk_pref * 3.0
    else:
        score += (1.0 - kiosk_pref) * 3.0
    return score


# ═══════════════════════════════════════════════════════════════
# SERVICE TASK ROLLING  (mirrors StationController.RollServiceTasks)
# ═══════════════════════════════════════════════════════════════

def roll_service_tasks(station: StationData, rng: random.Random) -> List[Tuple[str, float]]:
    if not station.tasks:
        return [("Generic_Service", 15.0 / max(station.efficiency_factor, 0.01))]

    result = []
    for t in station.tasks:
        if t.probability < 1.0 and rng.random() > t.probability:
            continue
        variance = rng.uniform(-0.2, 0.2)
        dur = max(0.5, (t.avg_duration * (1.0 + variance)) / max(station.efficiency_factor, 0.01))
        result.append((t.task_name, dur))

    if not result:
        result.append(("Quick_Pass", 2.0 / max(station.efficiency_factor, 0.01)))
    return result


# ═══════════════════════════════════════════════════════════════
# CORE DES SIMULATION
# ═══════════════════════════════════════════════════════════════

def simulate(checkpoints: List[CheckpointData], passengers: List[Passenger],
             sim_seed: int) -> List[EventRecord]:
    """Run the full DES. Returns all event records."""
    rng = random.Random(sim_seed)

    ordered, depth_map, lookup = build_checkpoint_graph(checkpoints)
    if not ordered:
        return []

    # Station state: when each station becomes free
    station_free_at: Dict[str, float] = {}
    station_queue_len: Dict[str, int] = {}
    for cp in checkpoints:
        for s in cp.stations:
            station_free_at[s.station_id] = 0.0
            station_queue_len[s.station_id] = 0

    all_records: List[EventRecord] = []
    sim_start = 0.0

    for pax in passengers:
        current_time = pax.spawn_time
        # Find the root checkpoint for this passenger
        current_cp_id = ordered[0]

        visited = set()
        while current_cp_id and current_cp_id in lookup:
            if current_cp_id in visited:
                break
            visited.add(current_cp_id)

            cp = lookup[current_cp_id]
            cp_depth = depth_map.get(current_cp_id, 0)

            # Walk to entry
            if visited.__len__() > 1:
                prev_depth = depth_map.get(list(visited)[-2], 0) if len(visited) > 1 else 0
                walk_dist = compute_walk_time(prev_depth, cp_depth)
                current_time += walk_dist / pax.speed

            # Should this persona process this checkpoint?
            if not should_process_checkpoint(pax.persona, cp.checkpoint_type):
                # Skip — walk through
                current_cp_id = _choose_next(cp, pax.persona, lookup)
                continue

            arrival_time = current_time

            # Terminal/Boarding gates: just log and stop
            if is_terminal_gate(cp.checkpoint_type) or is_boarding_gate(cp.checkpoint_type):
                rec = EventRecord(pax.name, pax.passenger_class, pax.age, pax.kiosk_affinity,
                                  cp.checkpoint_id, cp.stations[0].station_id if cp.stations else cp.checkpoint_id,
                                  arrival_time - sim_start, arrival_time - sim_start + 0.5,
                                  arrival_time - sim_start + 0.7, 0.0, 0.0, "Waiting_For_Flight")
                all_records.append(rec)
                break

            # Pick best station
            if not cp.stations:
                current_cp_id = _choose_next(cp, pax.persona, lookup)
                continue

            best_station = None
            best_score = float('-inf')
            for s in cp.stations:
                if "All Classes" not in s.allowed_class and pax.passenger_class not in s.allowed_class:
                    continue
                ql = station_queue_len.get(s.station_id, 0)
                if ql >= s.max_queue_cap and not is_terminal_gate(cp.checkpoint_type):
                    continue
                sc = score_station(pax, s, cp.checkpoint_type, ql, is_kiosk(cp.checkpoint_type))
                if sc > best_score:
                    best_score = sc
                    best_station = s

            if not best_station:
                best_station = cp.stations[0]

            # Queue join
            queue_join_time = current_time + 0.5  # brief decision delay
            station_queue_len[best_station.station_id] = station_queue_len.get(best_station.station_id, 0) + 1

            # Service start = max(when station is free, when passenger joins)
            service_start = max(station_free_at.get(best_station.station_id, 0.0), queue_join_time)

            # Roll tasks
            rolled = roll_service_tasks(best_station, rng)
            task_names = [t[0] for t in rolled]
            total_service = sum(t[1] for t in rolled)

            service_end = service_start + total_service
            station_free_at[best_station.station_id] = service_end
            station_queue_len[best_station.station_id] = max(0, station_queue_len.get(best_station.station_id, 1) - 1)

            # Walk to exit
            exit_time = service_end + (EXIT_OFFSET / pax.speed)
            current_time = exit_time

            rec = EventRecord(
                pax.name, pax.passenger_class, pax.age, pax.kiosk_affinity,
                cp.checkpoint_id, best_station.station_id,
                arrival_time - sim_start, queue_join_time - sim_start,
                service_start - sim_start, service_end - sim_start,
                exit_time - sim_start, " > ".join(task_names))
            all_records.append(rec)

            # Next checkpoint
            current_cp_id = _choose_next(cp, pax.persona, lookup)

    return all_records


def _choose_next(cp: CheckpointData, persona: PersonaProfile,
                 lookup: Dict[str, CheckpointData]) -> Optional[str]:
    """Mirrors Passenger.ChooseNextCheckpoint()."""
    if not cp.next_anchor:
        return None

    resolved = [_resolve_id(t, lookup) for t in cp.next_anchor]
    resolved = [r for r in resolved if r and r in lookup]

    if not resolved:
        return None
    if len(resolved) == 1:
        return resolved[0]

    # Prefer by persona preferredNextTypes
    if persona.preferred_next_types:
        for preferred in persona.preferred_next_types:
            for cid in resolved:
                ct = lookup[cid].checkpoint_type
                if preferred.lower() in ct.lower():
                    return cid
        # Fallback: pick processable
        for cid in resolved:
            if should_process_checkpoint(persona, lookup[cid].checkpoint_type):
                return cid

    return resolved[0]


# ═══════════════════════════════════════════════════════════════
# ENTRY POINT — single simulation run
# ═══════════════════════════════════════════════════════════════

def run_single(aero_path: str, abs_path: str, seed: int,
               pax_count: int = 100) -> List[EventRecord]:
    """Run one complete simulation, return records.

    Each flow (departure, arrival, …) gets its own independent batch
    of *pax_count* passengers with a distinct seed so the two batches
    are statistically independent.  Results are concatenated into a
    single record list.
    """
    flows = load_aero_config(aero_path)
    profiles = load_abs_config(abs_path)

    all_records: List[EventRecord] = []
    for flow_idx, (flow_key, checkpoints) in enumerate(flows.items()):
        if not checkpoints:
            continue
        flow_seed = seed + flow_idx * 10000  # distinct seed per flow
        passengers = generate_passengers(profiles, pax_count, flow_seed)
        records = simulate(checkpoints, passengers, flow_seed)
        all_records.extend(records)

    return all_records
