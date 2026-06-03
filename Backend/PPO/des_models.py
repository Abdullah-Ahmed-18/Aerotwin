"""
Data models for the Logical DES Simulator.
Mirrors Unity C# types: PersonaProfile, CheckpointData, StationData, etc.
"""
import math
import random
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple


# ═══════════════════════════════════════════════════════════════
# PERSONA TYPES  (mirrors PersonaType enum in PersonaConfig.cs)
# ═══════════════════════════════════════════════════════════════
PERSONA_NAMES = [
    "Domestic Business",       # P1 / index 0
    "Domestic Leisure",        # P2 / index 1
    "Intl Departing",          # P3 / index 2
    "Intl Arriving",           # P4 / index 3
    "Domestic Transfer",       # P5 / index 4
    "Intl Transfer",           # P6 / index 5
    "Premium",                 # P7 / index 6
]


@dataclass
class CharacteristicsRange:
    age_min: int = 18;           age_max: int = 80
    fitness_min: float = 0.2;    fitness_max: float = 0.9
    tech_savvy_min: float = 0.2; tech_savvy_max: float = 0.9
    impatience_min: float = 0.2; impatience_max: float = 0.8
    time_pressure_min: float = 0.1; time_pressure_max: float = 0.9
    luggage_min: float = 0.0;   luggage_max: float = 1.0
    exp_min: int = 0;           exp_max: int = 10
    business_class_chance: float = 0.2


@dataclass
class BehaviorModifiers:
    kiosk_preference: float = 0.5
    prefers_priority: bool = False
    speed_multiplier: float = 1.0
    queue_impatience_bonus: float = 0.0


@dataclass
class PersonaProfile:
    index: int
    display_name: str
    spawn_weight: float
    characteristics: CharacteristicsRange
    behavior: BehaviorModifiers
    checkpoint_path: List[str] = field(default_factory=list)
    preferred_next_types: List[str] = field(default_factory=list)


def get_default_profiles() -> List[PersonaProfile]:
    """Exact replica of PersonaConfig.GetDefaultProfiles() from C#."""
    return [
        PersonaProfile(0, "Domestic Business", 2.0,
            CharacteristicsRange(25,55, 0.5,0.9, 0.6,1.0, 0.5,0.9, 0.6,1.0, 0.0,0.3, 5,10, 0.6),
            BehaviorModifiers(0.8, True, 1.15, 0.3),
            ["Security","Security with X Ray Scanners","Digital Check-in","Self-Service Bag Drop","Boarding","Terminal Gate"],
            ["Digital Check-in"]),
        PersonaProfile(1, "Domestic Leisure", 3.0,
            CharacteristicsRange(20,70, 0.2,0.7, 0.1,0.6, 0.1,0.5, 0.1,0.5, 0.4,1.0, 0,5, 0.05),
            BehaviorModifiers(0.2, False, 0.85, 0.0),
            ["Security","Security with X Ray Scanners","Check-in /w Baggage Tagging","Self-Service Bag Drop","Boarding","Terminal Gate"],
            ["Check-in /w Baggage Tagging"]),
        PersonaProfile(2, "Intl Departing", 2.0,
            CharacteristicsRange(22,65, 0.3,0.8, 0.3,0.8, 0.2,0.6, 0.2,0.6, 0.5,1.0, 1,7, 0.25),
            BehaviorModifiers(0.4, False, 0.95, 0.0),
            ["Security","Security with X Ray Scanners","Check-in /w Baggage Tagging","Self-Service Bag Drop","Passport Check","Boarding","Terminal Gate"],
            ["Check-in /w Baggage Tagging"]),
        PersonaProfile(3, "Intl Arriving", 1.5,
            CharacteristicsRange(22,65, 0.3,0.8, 0.3,0.7, 0.3,0.7, 0.1,0.4, 0.5,1.0, 1,7, 0.25),
            BehaviorModifiers(0.3, False, 0.9, 0.0),
            ["Security","Security with X Ray Scanners","Passport Check","Baggage Retrieval","Boarding","Terminal Gate"],
            ["Passport Check"]),
        PersonaProfile(4, "Domestic Transfer", 1.0,
            CharacteristicsRange(25,60, 0.4,0.9, 0.4,0.9, 0.5,1.0, 0.6,1.0, 0.0,0.3, 3,10, 0.35),
            BehaviorModifiers(0.7, False, 1.2, 0.4),
            ["Security","Security with X Ray Scanners","Boarding","Terminal Gate"],
            ["Security"]),
        PersonaProfile(5, "Intl Transfer", 1.0,
            CharacteristicsRange(25,60, 0.4,0.8, 0.4,0.8, 0.4,0.9, 0.5,1.0, 0.0,0.4, 2,9, 0.3),
            BehaviorModifiers(0.5, False, 1.1, 0.3),
            ["Security","Security with X Ray Scanners","Passport Check","Boarding","Terminal Gate"],
            ["Passport Check","Security"]),
        PersonaProfile(6, "Premium", 0.5,
            CharacteristicsRange(30,60, 0.4,0.9, 0.5,1.0, 0.4,0.8, 0.4,0.8, 0.2,0.7, 5,10, 0.85),
            BehaviorModifiers(0.6, True, 1.1, 0.2),
            ["Security","Security with X Ray Scanners","Digital Check-in","Self-Service Bag Drop","Passport Check","Boarding","Terminal Gate"],
            ["Digital Check-in"]),
    ]


# ═══════════════════════════════════════════════════════════════
# CONFIG DATA MODELS  (mirrors CheckpointData / StationData)
# ═══════════════════════════════════════════════════════════════

@dataclass
class TaskData:
    task_name: str
    avg_duration: float
    probability: float


@dataclass
class StationData:
    station_id: str
    staffing_no: int
    avg_service_time: float
    max_queue_cap: int
    efficiency_factor: float
    allowed_class: List[str]
    feature_val: int
    tasks: List[TaskData]


@dataclass
class CheckpointData:
    checkpoint_id: str
    checkpoint_type: str
    flow_type: str
    prev_anchor: str
    next_anchor: List[str]
    stations: List[StationData]


# ═══════════════════════════════════════════════════════════════
# PASSENGER  (runtime state during simulation)
# ═══════════════════════════════════════════════════════════════

@dataclass
class Passenger:
    name: str
    persona: PersonaProfile
    passenger_class: str = "Economy"
    age: int = 30
    fitness: float = 0.5
    tech_savvy: float = 0.5
    flight_experience: int = 5
    impatience: float = 0.5
    time_pressure: float = 0.5
    luggage: float = 0.5
    kiosk_affinity: float = 0.5
    speed: float = 1.4
    spawn_time: float = 0.0


@dataclass
class EventRecord:
    """One CSV row — passenger × checkpoint."""
    passenger_name: str = ""
    passenger_class: str = ""
    passenger_age: int = 0
    kiosk_affinity: float = 0.0
    checkpoint_id: str = ""
    station_id: str = ""
    arrival_time: float = 0.0
    queue_join_time: float = 0.0
    service_start_time: float = 0.0
    service_end_time: float = 0.0
    exit_time: float = 0.0
    tasks_performed: str = ""

    @property
    def wait_time(self): return self.service_start_time - self.queue_join_time
    @property
    def service_time(self): return self.service_end_time - self.service_start_time
    @property
    def total_dwell(self): return self.exit_time - self.arrival_time


# ═══════════════════════════════════════════════════════════════
# SEEDED RANDOM HELPERS  (mirrors PassengerSpawner C# exactly)
# ═══════════════════════════════════════════════════════════════

def seeded_gaussian(rng: random.Random) -> float:
    u1 = rng.random()
    u2 = rng.random()
    return math.sqrt(-2.0 * math.log(max(u1, 1e-10))) * math.cos(2.0 * math.pi * u2)


def seeded_gamma(rng: random.Random, shape: float, scale: float) -> float:
    """Marsaglia & Tsang's method — identical to C# implementation."""
    if shape >= 1.0:
        d = shape - 1.0 / 3.0
        c = 1.0 / math.sqrt(9.0 * d)
        while True:
            x = seeded_gaussian(rng)
            v = 1.0 + c * x
            if v > 0.0:
                v = v * v * v
                u = rng.random()
                if u < 1.0 - 0.0331 * (x * x) * (x * x):
                    return scale * d * v
                if math.log(max(u, 1e-10)) < 0.5 * x * x + d * (1.0 - v + math.log(max(v, 1e-10))):
                    return scale * d * v
    else:
        e = rng.random()
        return seeded_gamma(rng, shape + 1.0, scale) * (e ** (1.0 / shape))


# ═══════════════════════════════════════════════════════════════
# COUNTER KIND RESOLUTION  (mirrors StationController.cs)
# ═══════════════════════════════════════════════════════════════

TERMINAL_TYPES = {"Terminal Gate", "Departing Terminal", "Boarding Gate"}
ALWAYS_PROCESS_TYPES = {"Terminal Gate", "Departing Terminal", "Arrival Terminal", "Boarding Gate", "Boarding"}
KIOSK_TYPES = {"Digital Check-in", "Self-Service Bag Drop"}


def is_kiosk(checkpoint_type: str) -> bool:
    return checkpoint_type in KIOSK_TYPES


def is_terminal_gate(checkpoint_type: str) -> bool:
    return checkpoint_type in {"Terminal Gate", "Departing Terminal"}


def is_boarding_gate(checkpoint_type: str) -> bool:
    return checkpoint_type == "Boarding Gate"


def should_process_checkpoint(persona: PersonaProfile, checkpoint_type: str) -> bool:
    """Mirrors Passenger.ShouldProcessCheckpoint()."""
    if not persona.checkpoint_path:
        return True
    if checkpoint_type in ALWAYS_PROCESS_TYPES:
        return True
    for path_entry in persona.checkpoint_path:
        if path_entry.lower() in checkpoint_type.lower():
            return True
    return False
