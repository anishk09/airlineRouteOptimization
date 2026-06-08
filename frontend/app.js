const API_URL = window.location.origin + "/api";
let map, activeLayers = [];
let mapIsUnlocked = false; 

// Initialize Dashboard Map (Side dragging active, zoom tracks locked)
function initMap() {
    console.log("Initializing map layout canvas instance...");
    map = L.map('map', {
        center: [30, 0],
        zoom: 3,
        zoomControl: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        touchZoom: false,
        dragging: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);

    console.log("Map successfully initialized with side-to-side dragging.");
}

// Populate Searchable Expedia-Style Airport Database
async function loadAirports() {
    console.log("Attempting to connect to backend at:", `${API_URL}/airports`);
    try {
        const response = await fetch(`${API_URL}/airports`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const airports = await response.json();
        console.log("Airports received from backend:", airports);
        
        const dataList = document.getElementById('airportOptions');
        dataList.innerHTML = ""; 
        
        Object.keys(airports).forEach((code) => {
            const option = document.createElement('option');
            option.value = code; 
            option.innerText = `${code} - ${airports[code].name}`;
            dataList.appendChild(option);

            // Add ultra-minimal, dynamic star-pin markers
            const marker = L.circleMarker([airports[code].lat, airports[code].lon], {
                color: 'rgba(255, 255, 255, 0.2)', 
                radius: 0.8,                       
                weight: 1,                         
                fillColor: '#ffffff',              
                fillOpacity: 0.6,
                className: 'stellar-dot'
            }).addTo(map);

            // Smoothed cinematic bulge on mouseover
            marker.on('mouseover', function () {
                this.setStyle({
                    color: '#6366f1',              
                    radius: 5.0,                   
                    weight: 2,                     
                    fillOpacity: 1.0               
                });
            });

            // Smoothed fade back to stellar dust on mouseout
            marker.on('mouseout', function () {
                this.setStyle({
                    color: 'rgba(255, 255, 255, 0.2)',
                    radius: 0.8,                   
                    weight: 1,
                    fillOpacity: 0.6
                });
            });

            marker.bindPopup(`<b>${code}</b><br>${airports[code].name}`);
        });
        
        document.getElementById('origin').value = "JFK";
        document.getElementById('destination').value = "LAX";
        console.log("Search lookups initialized successfully.");
    } catch (err) {
        // ✨ FIXED: Proper JavaScript console logging format
        console.error("CRITICAL ERROR: Failed to fetch airports from backend:", err);
    }
}

// Handle Form Submission and Optimization Calculations
document.getElementById('optForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("Optimization calculation request triggered.");
    
    // Clean old path polylines completely off the map grid array frames
    activeLayers.forEach(layer => map.removeLayer(layer));
    activeLayers = [];

    const originVal = document.getElementById('origin').value.trim().toUpperCase();
    const destVal = document.getElementById('destination').value.trim().toUpperCase();

    const payload = {
        origin: originVal,
        destination: destVal,
        aircraft_type: document.getElementById('aircraft_type').value,
        fuel_price: parseFloat(document.getElementById('fuel_price').value),
        ticket_price: parseFloat(document.getElementById('ticket_price').value),
        passenger_demand: parseFloat(document.getElementById('passenger_demand').value)
    };

    if (!payload.origin || !payload.destination) {
        alert("Please select or enter valid Origin and Destination airports.");
        return;
    }

    if (payload.origin === payload.destination) {
        alert("Origin and Destination cannot be identical.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/optimize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error("Backend was unable to calculate optimization parameters.");
        }
        
        const data = await response.json();

        // 🔓 DYNAMIC ZOOM UNLOCK: Activate zoom layers when the route layout outputs
        if (!mapIsUnlocked) {
            map.scrollWheelZoom.enable();
            map.doubleClickZoom.enable();
            map.boxZoom.enable();
            map.touchZoom.enable();
            L.control.zoom({ position: 'topright' }).addTo(map); 
            mapIsUnlocked = true;
            console.log("Zoom systems successfully unlocked for route inspection.");
        }

        document.getElementById('resultsMatrix').classList.remove('hidden');

        // Render Matrix Data Metrics & Pricing Strategies
        // 1. Fuel Efficiency Route Card
        document.getElementById('fuel-dist').innerText = data.fuel_route.distance;
        document.getElementById('fuel-burn').innerText = data.fuel_route.fuel_burn;
        document.getElementById('fuel-prof').innerText = `$${Math.round(data.fuel_route.profit).toLocaleString()}`;
        document.getElementById('fuel-fare').innerText = `$${data.fuel_route.suggested_fare.toLocaleString()}`;
        document.getElementById('fuel-desc').innerText = data.fuel_route.description;
        
        // 2. Passenger Load Route Card
        document.getElementById('pax-dist').innerText = data.passenger_route.distance;
        document.getElementById('pax-pax').innerText = data.passenger_route.passengers;
        document.getElementById('pax-prof').innerText = `$${Math.round(data.passenger_route.profit).toLocaleString()}`;
        document.getElementById('pax-fare').innerText = `$${data.passenger_route.suggested_fare.toLocaleString()}`;
        document.getElementById('pax-desc').innerText = data.passenger_route.description;

        // 3. Profit Maximization Strategy Card
        document.getElementById('prof-dist').innerText = data.profit_route.distance;
        document.getElementById('prof-burn').innerText = data.profit_route.fuel_burn;
        document.getElementById('prof-prof').innerText = `$${Math.round(data.profit_route.profit).toLocaleString()}`;
        document.getElementById('prof-fare').innerText = `$${data.profit_route.suggested_fare.toLocaleString()}`;
        document.getElementById('prof-desc').innerText = data.profit_route.description;

        // Generate true geodesic curved path layers linked to the custom tracing CSS animation engine
        // Generate true geodesic curved path layers with coordinate system protection
        const fuelLine = L.polyline(data.fuel_route.path, {
            color: '#22c55e', 
            weight: 4, 
            opacity: 0.85,
            noWrap: true, // 🧠 Prevents the lines from fragmenting across map tiles
            className: 'animated-flight-line'
        }).addTo(map);

        const paxLine = L.polyline(data.passenger_route.path, {
            color: '#3b82f6', 
            weight: 4, 
            opacity: 0.85,
            noWrap: true, // 🧠 Keeps the transit corridor unified
            className: 'animated-flight-line'
        }).addTo(map);

        const profLine = L.polyline(data.profit_route.path, {
            color: '#f59e0b', 
            weight: 5, 
            opacity: 0.95, 
            dashArray: '8, 6', 
            noWrap: true, // 🧠 Locks the optimization track together
            className: 'animated-flight-line'
        }).addTo(map);

        // Commit elements directly into the active management layers tracker pool
        activeLayers.push(fuelLine, paxLine, profLine);

        const group = new L.featureGroup(activeLayers);
        map.fitBounds(group.getBounds().pad(0.15));
        console.log("Optimal geodesic paths fluidly traced onto active layout frame.");

    } catch (err) {
        console.error("Optimization pipeline failed:", err);
        alert(err.message || "An issue occurred connecting to the backend optimization model.");
    }
});

// 🔄 COMPREHENSIVE INTERACTIVE RESET CONTROLLER
document.getElementById('resetBtn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation(); 
    console.log("Global layout reset cleanly executed.");
    
    // 1. Wipe active flight tracking polylines from the active map scene frame
    activeLayers.forEach(layer => map.removeLayer(layer));
    activeLayers = [];
    
    // 2. Re-hide multi-objective output metrics block container
    document.getElementById('resultsMatrix').classList.add('hidden');
    
    // 3. Revert configuration input parameters back to system baselines
    document.getElementById('origin').value = "JFK";
    document.getElementById('destination').value = "LAX";
    document.getElementById('aircraft_type').value = "b77w";
    document.getElementById('fuel_price').value = "3.50";
    document.getElementById('ticket_price').value = "450";
    document.getElementById('passenger_demand').value = "1.0";
    document.getElementById('demandVal').innerText = "1.0x";
    
    // 4. Glide viewport metrics frame back to default world orientation
    map.setView([30, 0], 3);
});

document.getElementById('passenger_demand').addEventListener('input', (e) => {
    document.getElementById('demandVal').innerText = `${e.target.value}x`;
});

window.onload = () => {
    initMap();
    loadAirports();
};