import sys
import json
import random
import math

# ==========================================
# AIRCRAFT CAPACITY DATABASE
# ==========================================
aircraft_capacities = {
    "A388": 520, "B744": 416, "B77W": 360, "B772": 312,
    "A333": 300, "A332": 250, "A321": 220, "A21N": 230,
    "A320": 180, "A20N": 186, "B738": 189, "B739": 215,
    "B38M": 200, "E190": 114, "AT72": 72, "AT42": 48
}

# ==========================================
# C# LOGIC TRANSLATED TO PYTHON
# ==========================================
def generate_passenger_profile(flight_id, plane_type, timestamp):
    # 1. AGE
    age = random.randint(18, 80)

    # 2. FLIGHT EXPERIENCE
    # C#: Mathf.InverseLerp(18f, 80f, age)
    age_factor = (age - 18) / (80 - 18)
    base_exp = age_factor * 10
    random_noise = random.uniform(-3, 2)
    # C#: Mathf.Clamp(..., 0, 10)
    flight_experience = int(max(0, min(10, round(base_exp + random_noise))))

    # 3. FITNESS
    # C#: 1f - (age - 18f) / 62f
    base_fitness = 1.0 - (age - 18) / 62.0
    fitness = max(0.0, min(1.0, base_fitness + random.uniform(-0.2, 0.2)))

    # 4. TECH SAVVY
    # Formula: (Younger + Experience + Random)
    tech_base = (1.0 - (age - 18) / 62.0)
    tech_exp_bonus = flight_experience * 0.03
    tech_noise = random.uniform(-0.1, 0.2)
    tech_savvy = max(0.0, min(1.0, tech_base + tech_exp_bonus + tech_noise))

    # 5. IMPATIENCE
    # Formula: 0.3 + (Exp * 0.05) - (Age / 150) + Random
    impatience_calc = 0.3 + (flight_experience * 0.05) - (age / 150.0) + random.uniform(-0.1, 0.2)
    impatience = max(0.0, min(1.0, impatience_calc))

    # 6. TIME PRESSURE & LUGGAGE
    time_pressure = random.random() # 0.0 to 1.0
    luggage = random.random()       # 0.0 to 1.0

    # 7. MOVEMENT SPEED CALCULATION
    base_speed = 1.4
    # C#: Mathf.Lerp(0.8f, 1.3f, fitness) -> (a + (b - a) * t)
    fitness_boost = 0.8 + (1.3 - 0.8) * fitness
    # C#: Mathf.Lerp(1f, 0.7f, luggage)
    luggage_penalty = 1.0 + (0.7 - 1.0) * luggage
    # C#: Mathf.Lerp(1f, 1.25f, timePressure)
    urgency_boost = 1.0 + (1.25 - 1.0) * time_pressure
    
    final_speed = base_speed * fitness_boost * luggage_penalty * urgency_boost

    # 8. KIOSK AFFINITY (The Complex Decision Logic)
    kiosk_affinity = (
        (tech_savvy * 0.6) +
        ((flight_experience / 10.0) * 0.25) -
        ((age / 100.0) * 0.2) -
        (luggage * 0.1)
    )

    # Age Penalty Logic (> 45)
    if age > 45:
        over_45_factor = (age - 45) / 35.0
        age_penalty = (over_45_factor ** 2) * 0.8
        kiosk_affinity -= age_penalty
        
        # Experience redemption
        if flight_experience >= 8:
            kiosk_affinity += 0.25

    kiosk_affinity = max(0.0, min(1.0, kiosk_affinity))

    # Format for CSV
    return [
        flight_id,
        plane_type,
        timestamp,
        age,
        f"{fitness:.2f}",
        f"{tech_savvy:.2f}",
        flight_experience,
        f"{impatience:.2f}",
        f"{time_pressure:.2f}",
        f"{luggage:.2f}",
        f"{kiosk_affinity:.2f}",
        f"{final_speed:.2f}"
    ]

# ==========================================
# MAIN EXECUTION
# ==========================================
try:
    # 1. Get Flight List from Node.js (passed as argument)
    flight_data_json = sys.argv[1]
    flights = json.loads(flight_data_json)

    # 2. Print CSV Header
    print("Flight,Plane,Time,Age,Fitness,TechSavvy,Experience,Impatience,TimePressure,Luggage,KioskAffinity,Speed")

    # 3. Loop Flights and Generate Pax
    for flight in flights:
        f_id = flight.get("Flight", "UNK")
        p_type = flight.get("Plane", "A320")
        t_stamp = flight.get("Time", "")

        # Determine Capacity
        max_pax = aircraft_capacities.get(p_type, 150)
        
        # Random Load Factor (70% to 100% full)
        actual_pax = int(max_pax * random.uniform(0.70, 1.0))

        for _ in range(actual_pax):
            row = generate_passenger_profile(f_id, p_type, t_stamp)
            # Join array into CSV string
            print(",".join(map(str, row)))

except Exception as e:
    # If error, print to stderr so Node catches it
    sys.stderr.write(f"Python Script Error: {str(e)}")
    sys.exit(1)