import urllib.request
import ssl
import csv
import os

# Source URL for the open-source nightly OurAirports global dump
OURAIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "airports.csv")

print("✈️ Downloading global airport dataset from OurAirports...")
try:
    # Create an unverified SSL context to bypass the missing macOS local issuer certificate error
    context = ssl._create_unverified_context()
    
    # Fetch the live stream using our custom bypass context
    response = urllib.request.urlopen(OURAIRPORTS_URL, context=context)
    lines = [line.decode('utf-8') for line in response.readlines()]
    reader = csv.DictReader(lines)
    
    count = 0
    with open(OUTPUT_PATH, mode='w', encoding='utf-8', newline='') as outfile:
        writer = csv.writer(outfile)
        # Write the exact layout headers your FastAPI backend looks for
        writer.writerow(["code", "name", "lat", "lon", "demand_factor"])
        
        for row in reader:
            iata_code = row.get("iata_code", "").strip().upper()
            airport_type = row.get("type", "")
            
            # Filter out tiny local grass strips and closed heliports
            if iata_code and iata_code != "N/A" and len(iata_code) == 3 and airport_type in ["medium_airport", "large_airport"]:
                name = f"{row.get('name', '').strip()} ({row.get('municipality', '').strip()}, {row.get('iso_country', '').strip()})"
                lat = row.get("latitude_deg", "0")
                lon = row.get("longitude_deg", "0")
                
                # Dynamically scale demand: Large international hubs get higher default weight factors
                demand = 1.3 if airport_type == "large_airport" else 1.0
                
                writer.writerow([iata_code, name, lat, lon, demand])
                count += 1
                
    print(f"✅ Success! Ingested {count} major commercial airports into backend/airports.csv")

except Exception as e:
    print(f"❌ Failed to parse data stream: {e}")