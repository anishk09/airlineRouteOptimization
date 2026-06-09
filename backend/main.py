import csv
import os
import math
import urllib.request
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="VolareVision Optimization Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🧠 Robust, Cloud-Safe Path Resolution
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "airports.csv")

def load_airports_from_csv():
    airports_db = {}
    print(f"📦 Attempting to read airport matrix from infrastructure path: {CSV_PATH}")
    
    if not os.path.exists(CSV_PATH):
        print(f"❌ CRITICAL error: '{CSV_PATH}' missing from build container space.")
        # Minimal production fallback safety line so your API never drops dead entirely
        return {"JFK": {"name": "New York JFK", "lat": 40.6413, "lon": -73.7781, "demand_factor": 1.4}}
        
    try:
        with open(CSV_PATH, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Standardize database matching key values
                code = row['code'].strip().upper()
                airports_db[code] = {
                    "name": row['name'].strip(),
                    "lat": float(row['lat']),
                    "lon": float(row['lon']),
                    "demand_factor": float(row['demand_factor']) if row.get('demand_factor') else 1.0
                }
        print(f"🔥 SUCCESS: Fully loaded {len(airports_db)} real airport nodes into global matrix.")
    except Exception as e:
        print(f"⚠️ Parsing anomaly caught: {e}")
    return airports_db

# This runs once on cold startup and caches the data in memory for the edge lifecycle
AIRPORTS = load_airports_from_csv()

# ✈️ ENTERPRISE 20-AIRCRAFT OPERATIONS REGISTRY
FLEET_REGISTRY = {
    # === NARROWBODIES (Short-to-Medium Haul) ===
    "b738": {
        "name": "Boeing 737-800",
        "burn_rate": 5.8, "capacity": 160, "true_airspeed": 450,
        "hourly_crew_cost": 750, "landing_fees": 900, "overflight_fee_rate": 0.05, "belly_cargo_yield": 1100
    },
    "a20n": {
        "name": "Airbus A320neo",
        "burn_rate": 4.9, "capacity": 165, "true_airspeed": 445,
        "hourly_crew_cost": 750, "landing_fees": 850, "overflight_fee_rate": 0.05, "belly_cargo_yield": 1200
    },
    "a21n": {
        "name": "Airbus A321neo",
        "burn_rate": 5.4, "capacity": 192, "true_airspeed": 445,
        "hourly_crew_cost": 820, "landing_fees": 1050, "overflight_fee_rate": 0.06, "belly_cargo_yield": 1600
    },
    "a320": {
        "name": "Airbus A320-200",
        "burn_rate": 6.1, "capacity": 150, "true_airspeed": 445,
        "hourly_crew_cost": 720, "landing_fees": 880, "overflight_fee_rate": 0.05, "belly_cargo_yield": 950
    },
    "b38m": {
        "name": "Boeing 737 MAX 8",
        "burn_rate": 4.8, "capacity": 172, "true_airspeed": 450,
        "hourly_crew_cost": 780, "landing_fees": 920, "overflight_fee_rate": 0.05, "belly_cargo_yield": 1350
    },
    "b39m": {
        "name": "Boeing 737 MAX 9",
        "burn_rate": 5.2, "capacity": 185, "true_airspeed": 450,
        "hourly_crew_cost": 800, "landing_fees": 980, "overflight_fee_rate": 0.06, "belly_cargo_yield": 1500
    },
    "a223": {
        "name": "Airbus A220-300",
        "burn_rate": 4.1, "capacity": 130, "true_airspeed": 435,
        "hourly_crew_cost": 650, "landing_fees": 700, "overflight_fee_rate": 0.04, "belly_cargo_yield": 800
    },
    "b752": {
        "name": "Boeing 757-200",
        "burn_rate": 7.6, "capacity": 176, "true_airspeed": 460,
        "hourly_crew_cost": 880, "landing_fees": 1400, "overflight_fee_rate": 0.07, "belly_cargo_yield": 1900
    },
    "e295": {
        "name": "Embraer E195-E2",
        "burn_rate": 3.8, "capacity": 120, "true_airspeed": 430,
        "hourly_crew_cost": 600, "landing_fees": 620, "overflight_fee_rate": 0.04, "belly_cargo_yield": 650
    },
    "a19n": {
        "name": "Airbus A319neo",
        "burn_rate": 4.4, "capacity": 136, "true_airspeed": 445,
        "hourly_crew_cost": 680, "landing_fees": 780, "overflight_fee_rate": 0.04, "belly_cargo_yield": 850
    },

    # === WIDEBODIES (Medium-to-Ultra Long Haul) ===
    "b77w": {
        "name": "Boeing 777-300ER",
        "burn_rate": 11.2, "capacity": 310, "true_airspeed": 490,
        "hourly_crew_cost": 1400, "landing_fees": 2500, "overflight_fee_rate": 0.12, "belly_cargo_yield": 4200
    },
    "b789": {
        "name": "Boeing 787-9 Dreamliner",
        "burn_rate": 7.8, "capacity": 290, "true_airspeed": 488,
        "hourly_crew_cost": 1250, "landing_fees": 2100, "overflight_fee_rate": 0.10, "belly_cargo_yield": 3600
    },
    "a359": {
        "name": "Airbus A350-900",
        "burn_rate": 9.4, "capacity": 315, "true_airspeed": 488,
        "hourly_crew_cost": 1350, "landing_fees": 2300, "overflight_fee_rate": 0.12, "belly_cargo_yield": 4500
    },
    "b78x": {
        "name": "Boeing 787-10 Dreamliner",
        "burn_rate": 8.4, "capacity": 330, "true_airspeed": 485,
        "hourly_crew_cost": 1300, "landing_fees": 2250, "overflight_fee_rate": 0.11, "belly_cargo_yield": 3900
    },
    "a35k": {
        "name": "Airbus A350-1000",
        "burn_rate": 10.6, "capacity": 366, "true_airspeed": 488,
        "hourly_crew_cost": 1480, "landing_fees": 2700, "overflight_fee_rate": 0.13, "belly_cargo_yield": 5100
    },
    "a333": {
        "name": "Airbus A330-300",
        "burn_rate": 9.8, "capacity": 277, "true_airspeed": 475,
        "hourly_crew_cost": 1150, "landing_fees": 1950, "overflight_fee_rate": 0.10, "belly_cargo_yield": 2800
    },
    "a339": {
        "name": "Airbus A330-900neo",
        "burn_rate": 8.1, "capacity": 287, "true_airspeed": 470,
        "hourly_crew_cost": 1200, "landing_fees": 1900, "overflight_fee_rate": 0.10, "belly_cargo_yield": 3100
    },
    "b772": {
        "name": "Boeing 777-200ER",
        "burn_rate": 10.1, "capacity": 269, "true_airspeed": 487,
        "hourly_crew_cost": 1300, "landing_fees": 2200, "overflight_fee_rate": 0.11, "belly_cargo_yield": 3300
    },
    "a388": {
        "name": "Airbus A380-800",
        "burn_rate": 19.5, "capacity": 525, "true_airspeed": 495,
        "hourly_crew_cost": 2200, "landing_fees": 4800, "overflight_fee_rate": 0.20, "belly_cargo_yield": 2200
    },
    "b748": {
        "name": "Boeing 747-8I",
        "burn_rate": 14.8, "capacity": 410, "true_airspeed": 502,
        "hourly_crew_cost": 1800, "landing_fees": 3800, "overflight_fee_rate": 0.16, "belly_cargo_yield": 5500
    }
}

class OptimizationRequest(BaseModel):
    origin: str
    destination: str
    aircraft_type: str  
    fuel_price: float   
    ticket_price: float 
    passenger_demand: float 

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 3440.065  
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi, delta_lambda = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(delta_phi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(delta_lambda/2)**2
    return R * (2 * math.atan2(math.sqrt(a), math.sqrt(1-a)))

def calculate_initial_bearing(lat1, lon1, lat2, lon2):
    lat1, lat2 = math.radians(lat1), math.radians(lat2)
    delta_lon = math.radians(lon2 - lon1)
    x = math.sin(delta_lon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - (math.sin(lat1) * math.cos(lat2) * math.cos(delta_lon))
    return (math.degrees(math.atan2(x, y)) + 360) % 360

def fetch_upper_air_winds(lat, lon):
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=windspeed_300hPa,winddirection_300hPa&forecast_days=1"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=4) as response:
            data = json.loads(response.read().decode())
            speed_knots = data['hourly']['windspeed_300hPa'][0] * 0.539957
            direction_deg = data['hourly']['winddirection_300hPa'][0]
            return speed_knots, direction_deg
    except Exception as e:
        print(f"⚠️ Upper-Air Wind API offline fallback applied: {e}")
        return 0.0, 0.0

def compute_wind_component(flight_bearing, wind_speed, wind_dir):
    wind_to_dir = (wind_dir + 180) % 360
    angle_diff = math.radians(wind_to_dir - flight_bearing)
    return wind_speed * math.cos(angle_diff)

def generate_great_circle_path(p1, p2, bend_offset=0.0, segments=40):
    lat1, lon1 = math.radians(p1[0]), math.radians(p1[1])
    lat2, lon2 = math.radians(p2[0]), math.radians(p2[1])
    d = 2 * math.asin(math.sqrt(math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2))
    
    path = []
    if d == 0: return [p1, p2]
    for i in range(segments + 1):
        f = i / segments
        A = math.sin((1 - f) * d) / math.sin(d)
        B = math.sin(f * d) / math.sin(d)
        x = A * math.cos(lat1) * math.cos(lon1) + B * math.cos(lat2) * math.cos(lon2)
        y = A * math.cos(lat1) * math.sin(lon1) + B * math.cos(lat2) * math.sin(lon2)
        z = A * math.sin(lat1) + B * math.sin(lat2)
        lat = math.atan2(z, math.sqrt(x**2 + y**2))
        lon = math.atan2(y, x)
        wave_offset = math.sin(f * math.pi) * bend_offset
        path.append([math.degrees(lat) + wave_offset, math.degrees(lon)])
    return path

@app.get("/")
@app.get("/api")
def health():
    return {"status": "running", "service": "VolareVision Optimization Engine"}

@app.get("/airports")
@app.get("/api/airports")
def get_airports():
    return AIRPORTS

@app.post("/optimize")
@app.post("/api/optimize")
def optimize_route(req: OptimizationRequest):
    orig, dest = AIRPORTS.get(req.origin.upper()), AIRPORTS.get(req.destination.upper())
    if not orig or not dest:
        return {"error": "Invalid airport mapping codes detected."}

    fleet_key = req.aircraft_type.lower()
    if fleet_key not in FLEET_REGISTRY:
        return {"error": f"Aircraft model '{fleet_key}' not discovered inside centralized specs registry."}
        
    spec = FLEET_REGISTRY[fleet_key]
    burn_rate = spec["burn_rate"]
    capacity = spec["capacity"]
    true_airspeed = spec["true_airspeed"]
    hourly_crew_cost = spec["hourly_crew_cost"]
    landing_fees = spec["landing_fees"]
    overflight_fee_rate = spec["overflight_fee_rate"]
    belly_cargo_yield = spec["belly_cargo_yield"]

    base_dist = haversine_distance(orig["lat"], orig["lon"], dest["lat"], dest["lon"])
    flight_bearing = calculate_initial_bearing(orig["lat"], orig["lon"], dest["lat"], dest["lon"])
    
    mid_lat = (orig["lat"] + dest["lat"]) / 2
    mid_lon = (orig["lon"] + dest["lon"]) / 2
    
    wind_speed, wind_dir = fetch_upper_air_winds(mid_lat, mid_lon)
    wind_component = compute_wind_component(flight_bearing, wind_speed, wind_dir)
    
    if capacity > 200:
        base_suggested_price = 150 + (base_dist * 0.08)
    else:
        base_suggested_price = 80 + (base_dist * 0.06)

    market_demand_pool = ((orig["demand_factor"] + dest["demand_factor"]) / 2) * req.passenger_demand

    def calculate_yield_pax(price, base_fare, cap, demand_multiplier):
        price_ratio = price / base_fare
        load_factor = math.exp(-0.4 * (price_ratio - 0.7)) 
        adjusted_load = min(0.98, max(0.10, load_factor * demand_multiplier))
        return int(cap * adjusted_load)

    # Yield Optimization Strategy Loop
    best_suggested_price = req.ticket_price 
    max_discovered_yield = -9999999.0
    for multiplier in [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0]:
        test_price = base_suggested_price * multiplier
        test_pax = calculate_yield_pax(test_price, base_suggested_price, capacity, market_demand_pool)
        test_rev = test_pax * test_price
        if test_rev > max_discovered_yield:
            max_discovered_yield = test_rev
            best_suggested_price = test_price

    optimized_ticket_fare = round(best_suggested_price, 2)

    # --- 1. JETSTREAM FUEL EFFICIENCY ROUTE ---
    fuel_dist = base_dist * 1.01
    fuel_groundspeed = true_airspeed + (wind_component * 1.1)  
    fuel_hours = max(0.5, fuel_dist / fuel_groundspeed)
    fuel_burn = fuel_hours * true_airspeed * burn_rate * 0.95 * (1 + (fuel_dist / 14000))
    
    fuel_suggested_fare = round(req.ticket_price, 2)
    fuel_passengers = calculate_yield_pax(fuel_suggested_fare, base_suggested_price, capacity, market_demand_pool * 0.85)
    
    fuel_costs = (fuel_burn * req.fuel_price) + (fuel_hours * hourly_crew_cost) + landing_fees + (fuel_dist * overflight_fee_rate)
    fuel_revenue = (fuel_passengers * fuel_suggested_fare) + (belly_cargo_yield * 0.8)
    fuel_profit = fuel_revenue - fuel_costs

    # --- 2. HIGH-LOAD TRANSIT ROUTE ---
    pax_dist = base_dist * 1.12
    pax_groundspeed = true_airspeed + wind_component
    pax_hours = max(0.5, pax_dist / pax_groundspeed)
    pax_burn = pax_hours * true_airspeed * burn_rate * (1 + (pax_dist / 14000))
    
    discount_fare = round(base_suggested_price * 0.80, 2)
    pax_passengers = calculate_yield_pax(discount_fare, base_suggested_price, capacity, market_demand_pool * 1.2)
    
    pax_costs = (pax_burn * req.fuel_price) + (pax_hours * hourly_crew_cost) + (landing_fees * 1.4) + (pax_dist * overflight_fee_rate)
    pax_revenue = (pax_passengers * discount_fare) + (belly_cargo_yield * 0.5)
    pax_profit = pax_revenue - pax_costs

    # --- 3. MAX PROFIT STRATEGY ---
    prof_dist = base_dist * 1.03
    prof_groundspeed = true_airspeed + (wind_component * 1.02)
    prof_hours = max(0.5, prof_dist / prof_groundspeed)
    prof_burn = prof_hours * true_airspeed * burn_rate * 0.98 * (1 + (prof_dist / 14000))
    prof_passengers = calculate_yield_pax(optimized_ticket_fare, base_suggested_price, capacity, market_demand_pool)
    
    prof_costs = (prof_burn * req.fuel_price) + (prof_hours * hourly_crew_cost) + landing_fees + (prof_dist * overflight_fee_rate)
    prof_revenue = (prof_passengers * optimized_ticket_fare) + belly_cargo_yield
    prof_profit = prof_revenue - prof_costs

    wind_status = f"{abs(round(wind_component))}kts {'tailwind benefit' if wind_component >= 0 else 'headwind tax'}"
    base_data_source = f"Calculated for the {spec['name']} airframe over true geodesic tracks across {round(base_dist)} NM, matching live upper wind vectors ({wind_status}). Pricing references structural airspace overflight tracking costs, hull block hour wages, progressive distance haul drag curves, and sub-deck cargo holds."

    return {
        "fuel_route": {
            "path": generate_great_circle_path([orig["lat"], orig["lon"]], [dest["lat"], dest["lon"]], bend_offset=1.8),
            "distance": round(fuel_dist, 1),
            "fuel_burn": round(fuel_burn, 1),
            "passengers": fuel_passengers,
            "profit": round(fuel_profit, 2),
            "suggested_fare": fuel_suggested_fare,
            "description": f"Target fare mirrors your input parameters. {base_data_source}"
        },
        "passenger_route": {
            "path": generate_great_circle_path([orig["lat"], orig["lon"]], [dest["lat"], dest["lon"]], bend_offset=-2.2),
            "distance": round(pax_dist, 1),
            "fuel_burn": round(pax_burn, 1),
            "passengers": pax_passengers,
            "profit": round(pax_profit, 2),
            "suggested_fare": discount_fare,
            "description": f"Target fare utilizes a fixed 20% baseline discount matrix to stimulate regional traffic and drive high transit volume loads. {base_data_source}"
        },
        "profit_route": {
            "path": generate_great_circle_path([orig["lat"], orig["lon"]], [dest["lat"], dest["lon"]], bend_offset=0.0),
            "distance": round(prof_dist, 1),
            "fuel_burn": round(prof_burn, 1),
            "passengers": prof_passengers,
            "profit": round(prof_profit, 2),
            "suggested_fare": optimized_ticket_fare,
            "description": f"Target fare solved dynamically via an algorithmic pricing yield loop to hit the optimal corporate profit-to-passenger elasticity equilibrium. {base_data_source}"
        }
    }