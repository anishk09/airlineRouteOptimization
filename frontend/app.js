// ==========================================================================
// VOLARE — unified flight-operations console
// Mode A: client-side route optimizer (ported from the original Volare 1.0
//         FastAPI engine — see git history of backend/main.py).
// Mode B: live Text-to-SQL market intelligence backend.
// ==========================================================================

const ASK_URL = "https://volare-backend-gjbo.onrender.com/ask";
const COLD_START_MS = 4000;
const MAX_MARKET_PINS = 8;

let map;
let optimizerLayers = [];
let marketLayers = [];
let AIRPORTS = new Map(); // code -> {name, lat, lon, demand}
let currentSql = "";
let coldStartTimer = null;

// --------------------------------------------------------------------------
// Fleet registry (ported 1:1 from the original optimization engine)
// --------------------------------------------------------------------------
const FLEET_REGISTRY = {
    b738: { name: "Boeing 737-800", burn_rate: 5.8, capacity: 160, tas: 450, crew_cost: 750, landing_fees: 900, overflight_rate: 0.05, cargo_yield: 1100 },
    a20n: { name: "Airbus A320neo", burn_rate: 4.9, capacity: 165, tas: 445, crew_cost: 750, landing_fees: 850, overflight_rate: 0.05, cargo_yield: 1200 },
    a21n: { name: "Airbus A321neo", burn_rate: 5.4, capacity: 192, tas: 445, crew_cost: 820, landing_fees: 1050, overflight_rate: 0.06, cargo_yield: 1600 },
    a320: { name: "Airbus A320-200", burn_rate: 6.1, capacity: 150, tas: 445, crew_cost: 720, landing_fees: 880, overflight_rate: 0.05, cargo_yield: 950 },
    b38m: { name: "Boeing 737 MAX 8", burn_rate: 4.8, capacity: 172, tas: 450, crew_cost: 780, landing_fees: 920, overflight_rate: 0.05, cargo_yield: 1350 },
    b39m: { name: "Boeing 737 MAX 9", burn_rate: 5.2, capacity: 185, tas: 450, crew_cost: 800, landing_fees: 980, overflight_rate: 0.06, cargo_yield: 1500 },
    a223: { name: "Airbus A220-300", burn_rate: 4.1, capacity: 130, tas: 435, crew_cost: 650, landing_fees: 700, overflight_rate: 0.04, cargo_yield: 800 },
    b752: { name: "Boeing 757-200", burn_rate: 7.6, capacity: 176, tas: 460, crew_cost: 880, landing_fees: 1400, overflight_rate: 0.07, cargo_yield: 1900 },
    e295: { name: "Embraer E195-E2", burn_rate: 3.8, capacity: 120, tas: 430, crew_cost: 600, landing_fees: 620, overflight_rate: 0.04, cargo_yield: 650 },
    a19n: { name: "Airbus A319neo", burn_rate: 4.4, capacity: 136, tas: 445, crew_cost: 680, landing_fees: 780, overflight_rate: 0.04, cargo_yield: 850 },
    b77w: { name: "Boeing 777-300ER", burn_rate: 11.2, capacity: 310, tas: 490, crew_cost: 1400, landing_fees: 2500, overflight_rate: 0.12, cargo_yield: 4200 },
    b789: { name: "Boeing 787-9 Dreamliner", burn_rate: 7.8, capacity: 290, tas: 488, crew_cost: 1250, landing_fees: 2100, overflight_rate: 0.10, cargo_yield: 3600 },
    a359: { name: "Airbus A350-900", burn_rate: 9.4, capacity: 315, tas: 488, crew_cost: 1350, landing_fees: 2300, overflight_rate: 0.12, cargo_yield: 4500 },
    b78x: { name: "Boeing 787-10 Dreamliner", burn_rate: 8.4, capacity: 330, tas: 485, crew_cost: 1300, landing_fees: 2250, overflight_rate: 0.11, cargo_yield: 3900 },
    a35k: { name: "Airbus A350-1000", burn_rate: 10.6, capacity: 366, tas: 488, crew_cost: 1480, landing_fees: 2700, overflight_rate: 0.13, cargo_yield: 5100 },
    a333: { name: "Airbus A330-300", burn_rate: 9.8, capacity: 277, tas: 475, crew_cost: 1150, landing_fees: 1950, overflight_rate: 0.10, cargo_yield: 2800 },
    a339: { name: "Airbus A330-900neo", burn_rate: 8.1, capacity: 287, tas: 470, crew_cost: 1200, landing_fees: 1900, overflight_rate: 0.10, cargo_yield: 3100 },
    b772: { name: "Boeing 777-200ER", burn_rate: 10.1, capacity: 269, tas: 487, crew_cost: 1300, landing_fees: 2200, overflight_rate: 0.11, cargo_yield: 3300 },
    a388: { name: "Airbus A380-800", burn_rate: 19.5, capacity: 525, tas: 495, crew_cost: 2200, landing_fees: 4800, overflight_rate: 0.20, cargo_yield: 2200 },
    b748: { name: "Boeing 747-8I", burn_rate: 14.8, capacity: 410, tas: 502, crew_cost: 1800, landing_fees: 3800, overflight_rate: 0.16, cargo_yield: 5500 },
};

// --------------------------------------------------------------------------
// Map bootstrap
// --------------------------------------------------------------------------
function initMap() {
    map = L.map("map", {
        center: [30, 5],
        zoom: 3,
        zoomControl: false,
        worldCopyJump: true,
        minZoom: 2.2,
        maxBounds: [[-85, -190], [85, 190]],
        maxBoundsViscosity: 1.0,
    });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        minZoom: 2.2,
        maxZoom: 18,
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
}

function hudPadding() {
    const isNarrow = window.innerWidth < 860;
    return { paddingTopLeft: isNarrow ? [24, 120] : [440, 100], paddingBottomRight: [40, 40] };
}

function clearLayers(list) {
    list.forEach((layer) => map.removeLayer(layer));
    list.length = 0;
}

// --------------------------------------------------------------------------
// Great-circle geometry (spherical slerp), with an optional lateral bend so
// overlapping strategy routes stay visually distinguishable on the map.
// --------------------------------------------------------------------------
function greatCirclePath([lat1, lon1], [lat2, lon2], bendOffset = 0, segments = 48) {
    const toRad = Math.PI / 180, toDeg = 180 / Math.PI;
    const phi1 = lat1 * toRad, l1 = lon1 * toRad;
    const phi2 = lat2 * toRad, l2 = lon2 * toRad;
    const d = 2 * Math.asin(Math.sqrt(
        Math.sin((phi2 - phi1) / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin((l2 - l1) / 2) ** 2
    ));
    if (d === 0) return [[lat1, lon1], [lat2, lon2]];

    const path = [];
    let prevLon = lon1;
    for (let i = 0; i <= segments; i++) {
        const f = i / segments;
        const A = Math.sin((1 - f) * d) / Math.sin(d);
        const B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(phi1) * Math.cos(l1) + B * Math.cos(phi2) * Math.cos(l2);
        const y = A * Math.cos(phi1) * Math.sin(l1) + B * Math.cos(phi2) * Math.sin(l2);
        const z = A * Math.sin(phi1) + B * Math.sin(phi2);
        const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg;
        let lon = Math.atan2(y, x) * toDeg;
        // atan2 always returns a value in (-180, 180], so a route whose shortest
        // path crosses the 180th meridian (e.g. US -> Asia/Pacific) would otherwise
        // flip sign between consecutive points and render as a line stretched
        // across the entire map. Unwrap relative to the previous point instead so
        // the polyline stays continuous along the true shortest-path direction.
        while (lon - prevLon > 180) lon -= 360;
        while (lon - prevLon < -180) lon += 360;
        prevLon = lon;
        const wave = Math.sin(f * Math.PI) * bendOffset;
        path.push([lat + wave, lon]);
    }
    return path;
}

// Shifts `lon` by ±360 so it sits within 180° of `refLon` — matches the same
// unwrapping greatCirclePath applies, so a destination marker lines up with
// the end of its arc instead of sitting a full world-width away from it.
function unwrapLon(lon, refLon) {
    let l = lon;
    while (l - refLon > 180) l -= 360;
    while (l - refLon < -180) l += 360;
    return l;
}

function haversineNM(lat1, lon1, lat2, lon2) {
    const R = 3440.065, toRad = Math.PI / 180;
    const dPhi = (lat2 - lat1) * toRad, dLambda = (lon2 - lon1) * toRad;
    const a = Math.sin(dPhi / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLambda / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --------------------------------------------------------------------------
// Sonar ping markers + animated flight arcs
// --------------------------------------------------------------------------
function sonarIcon(colorClass, label) {
    return L.divIcon({
        className: "",
        html: `
            <div class="sonar-marker ${colorClass}">
                <div class="sonar-ring r1"></div>
                <div class="sonar-ring r2"></div>
                <div class="sonar-ring r3"></div>
                <div class="sonar-core"></div>
                ${label ? `<div class="sonar-label">${label}</div>` : ""}
            </div>`,
        iconSize: [1, 1],
        iconAnchor: [0, 0],
    });
}

function addSonarPing(lat, lon, { label = "", emerald = false, popup = "" } = {}) {
    const marker = L.marker([lat, lon], { icon: sonarIcon(emerald ? "emerald" : "sky", label), zIndexOffset: 500 }).addTo(map);
    if (popup) marker.bindPopup(popup);
    return marker;
}

function addFlightArc(path, { color = "#38bdf8", weight = 3, dashed = false } = {}) {
    const glow = L.polyline(path, { color, weight: weight + 5, opacity: 0.18, className: "flight-arc-glow", interactive: false }).addTo(map);
    const line = L.polyline(path, {
        color, weight, opacity: 0.95,
        dashArray: dashed ? "8 6" : "5 7",
        className: "flight-arc",
        interactive: false,
    }).addTo(map);
    return [glow, line];
}

// --------------------------------------------------------------------------
// Numeric counter animation
// --------------------------------------------------------------------------
function countUp(el, target, formatter, duration = 900) {
    if (!el) return;
    const startTime = performance.now();
    function frame(now) {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = formatter(target * eased);
        if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

const fmtCurrency = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString();
const fmtInt = (v) => Math.round(v).toLocaleString();
const fmtDist = (v) => (Math.round(v * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// --------------------------------------------------------------------------
// Mode toggle
// --------------------------------------------------------------------------
function setMode(mode) {
    const toggle = document.getElementById("modeToggle");
    toggle.dataset.mode = mode;
    document.getElementById("panel-optimizer").classList.toggle("hidden", mode !== "optimizer");
    document.getElementById("panel-market").classList.toggle("hidden", mode !== "market");

    document.querySelectorAll("[data-mode-btn]").forEach((btn) => {
        const active = btn.dataset.modeBtn === mode;
        btn.classList.toggle("text-white", active);
        btn.classList.toggle("text-slate-400", !active);
    });

    clearLayers(mode === "optimizer" ? marketLayers : optimizerLayers);
}

document.getElementById("modeToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode-btn]");
    if (btn) setMode(btn.dataset.modeBtn);
});

// ==========================================================================
// MODE A — Route Optimizer
// ==========================================================================
async function loadAirports() {
    const response = await fetch("./data/airports.json");
    const rows = await response.json();
    const dataList = document.getElementById("airportOptions");
    const frag = document.createDocumentFragment();

    rows.forEach(([code, name, lat, lon, demand]) => {
        AIRPORTS.set(code, { name, lat, lon, demand });
        const option = document.createElement("option");
        option.value = code;
        option.innerText = `${code} - ${name}`;
        frag.appendChild(option);
    });
    dataList.appendChild(frag);

    document.getElementById("origin").value = "JFK";
    document.getElementById("destination").value = "LAX";
}

function yieldPax(price, baseFare, capacity, demandMultiplier) {
    const ratio = price / baseFare;
    const loadFactor = Math.exp(-0.4 * (ratio - 0.7));
    const adjusted = Math.min(0.98, Math.max(0.1, loadFactor * demandMultiplier));
    return Math.floor(capacity * adjusted);
}

function optimizeRoute({ origin, destination, aircraft_type, fuel_price, ticket_price, passenger_demand }) {
    const orig = AIRPORTS.get(origin);
    const dest = AIRPORTS.get(destination);
    if (!orig || !dest) throw new Error("Unknown airport code. Pick a suggestion from the list.");

    const spec = FLEET_REGISTRY[aircraft_type];
    const { burn_rate, capacity, tas, crew_cost, landing_fees, overflight_rate, cargo_yield } = spec;

    const baseDist = haversineNM(orig.lat, orig.lon, dest.lat, dest.lon);
    const baseSuggestedPrice = capacity > 200 ? 150 + baseDist * 0.08 : 80 + baseDist * 0.06;
    const demandPool = ((orig.demand + dest.demand) / 2) * passenger_demand;

    // Yield-optimization sweep to find the profit-maximizing fare
    let bestPrice = ticket_price, bestRevenue = -Infinity;
    [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0].forEach((mult) => {
        const testPrice = baseSuggestedPrice * mult;
        const testPax = yieldPax(testPrice, baseSuggestedPrice, capacity, demandPool);
        const testRev = testPax * testPrice;
        if (testRev > bestRevenue) { bestRevenue = testRev; bestPrice = testPrice; }
    });
    const optimizedFare = Math.round(bestPrice * 100) / 100;

    const strategy = (distMult, speedMult, burnMult, fare, pax, cargoShare, landingMult, bend) => {
        const dist = baseDist * distMult;
        const groundspeed = tas * speedMult;
        const hours = Math.max(0.5, dist / groundspeed);
        const burn = hours * tas * burn_rate * burnMult * (1 + dist / 14000);
        const costs = burn * fuel_price + hours * crew_cost + landing_fees * landingMult + dist * overflight_rate;
        const revenue = pax * fare + cargo_yield * cargoShare;
        return {
            path: greatCirclePath([orig.lat, orig.lon], [dest.lat, dest.lon], bend),
            distance: Math.round(dist * 10) / 10,
            fuel_burn: Math.round(burn * 10) / 10,
            passengers: pax,
            profit: Math.round((revenue - costs) * 100) / 100,
            suggested_fare: fare,
        };
    };

    const fuelFare = Math.round(ticket_price * 100) / 100;
    const fuelPax = yieldPax(fuelFare, baseSuggestedPrice, capacity, demandPool * 0.85);
    const fuel_route = strategy(1.01, 1.0, 0.95, fuelFare, fuelPax, 0.8, 1.0, 1.8);
    fuel_route.description = `Target fare mirrors your input parameters. Calculated for the ${spec.name} airframe over a true geodesic track spanning ${Math.round(baseDist)} NM.`;

    const discountFare = Math.round(baseSuggestedPrice * 0.8 * 100) / 100;
    const paxPax = yieldPax(discountFare, baseSuggestedPrice, capacity, demandPool * 1.2);
    const passenger_route = strategy(1.12, 1.0, 1.0, discountFare, paxPax, 0.5, 1.4, -2.2);
    passenger_route.description = `Target fare applies a fixed 20% baseline discount to stimulate regional traffic and drive transit volume.`;

    const profPax = yieldPax(optimizedFare, baseSuggestedPrice, capacity, demandPool);
    const profit_route = strategy(1.03, 1.02, 0.98, optimizedFare, profPax, 1.0, 1.0, 0.0);
    profit_route.description = `Target fare solved via an algorithmic yield loop for the optimal profit-to-passenger equilibrium.`;

    return { fuel_route, passenger_route, profit_route };
}

function renderOptimizerResults(data) {
    document.getElementById("resultsMatrix").classList.remove("hidden");
    document.getElementById("resultsMatrix").classList.add("entry-anim");

    countUp(document.getElementById("fuel-fare"), data.fuel_route.suggested_fare, fmtCurrency);
    countUp(document.getElementById("fuel-dist"), data.fuel_route.distance, fmtDist);
    countUp(document.getElementById("fuel-burn"), data.fuel_route.fuel_burn, fmtDist);
    countUp(document.getElementById("fuel-prof"), data.fuel_route.profit, fmtCurrency);
    document.getElementById("fuel-desc").innerText = data.fuel_route.description;

    countUp(document.getElementById("pax-fare"), data.passenger_route.suggested_fare, fmtCurrency);
    countUp(document.getElementById("pax-dist"), data.passenger_route.distance, fmtDist);
    countUp(document.getElementById("pax-pax"), data.passenger_route.passengers, fmtInt);
    countUp(document.getElementById("pax-prof"), data.passenger_route.profit, fmtCurrency);
    document.getElementById("pax-desc").innerText = data.passenger_route.description;

    countUp(document.getElementById("prof-fare"), data.profit_route.suggested_fare, fmtCurrency);
    countUp(document.getElementById("prof-dist"), data.profit_route.distance, fmtDist);
    countUp(document.getElementById("prof-burn"), data.profit_route.fuel_burn, fmtDist);
    countUp(document.getElementById("prof-prof"), data.profit_route.profit, fmtCurrency);
    document.getElementById("prof-desc").innerText = data.profit_route.description;
}

document.getElementById("optForm").addEventListener("submit", (e) => {
    e.preventDefault();
    clearLayers(optimizerLayers);

    const originVal = document.getElementById("origin").value.trim().toUpperCase();
    const destVal = document.getElementById("destination").value.trim().toUpperCase();

    if (!originVal || !destVal) return alert("Please select or enter valid Origin and Destination airports.");
    if (originVal === destVal) return alert("Origin and Destination cannot be identical.");

    const payload = {
        origin: originVal,
        destination: destVal,
        aircraft_type: document.getElementById("aircraft_type").value,
        fuel_price: parseFloat(document.getElementById("fuel_price").value),
        ticket_price: parseFloat(document.getElementById("ticket_price").value),
        passenger_demand: parseFloat(document.getElementById("passenger_demand").value),
    };

    let data;
    try {
        data = optimizeRoute(payload);
    } catch (err) {
        alert(err.message);
        return;
    }

    renderOptimizerResults(data);

    const orig = AIRPORTS.get(originVal), dest = AIRPORTS.get(destVal);
    optimizerLayers.push(...addFlightArc(data.fuel_route.path, { color: "#10b981", weight: 3 }));
    optimizerLayers.push(...addFlightArc(data.passenger_route.path, { color: "#38bdf8", weight: 3 }));
    optimizerLayers.push(...addFlightArc(data.profit_route.path, { color: "#f59e0b", weight: 4, dashed: true }));
    const destLon = unwrapLon(dest.lon, orig.lon);
    optimizerLayers.push(addSonarPing(orig.lat, orig.lon, { label: originVal, popup: `<b>${originVal}</b><br>${orig.name}` }));
    optimizerLayers.push(addSonarPing(dest.lat, destLon, { label: destVal, emerald: true, popup: `<b>${destVal}</b><br>${dest.name}` }));

    const group = L.featureGroup(optimizerLayers.filter((l) => l instanceof L.Path || l instanceof L.Marker));
    map.flyToBounds(group.getBounds(), { ...hudPadding(), duration: 1.1 });
});

document.getElementById("resetBtn").addEventListener("click", (e) => {
    e.preventDefault();
    clearLayers(optimizerLayers);
    document.getElementById("resultsMatrix").classList.add("hidden");

    document.getElementById("origin").value = "JFK";
    document.getElementById("destination").value = "LAX";
    document.getElementById("aircraft_type").value = "b77w";
    document.getElementById("fuel_price").value = "3.50";
    document.getElementById("ticket_price").value = "450";
    document.getElementById("passenger_demand").value = "1.0";
    document.getElementById("demandVal").innerText = "1.0x";

    map.flyTo([30, 5], 3, { duration: 0.9 });
});

document.getElementById("passenger_demand").addEventListener("input", (e) => {
    document.getElementById("demandVal").innerText = `${e.target.value}x`;
});

// ==========================================================================
// MODE B — Market Intelligence (Text-to-SQL)
// ==========================================================================
const SQL_KEYWORDS = new Set([
    "SELECT", "FROM", "WHERE", "GROUP", "BY", "ORDER", "LIMIT", "JOIN", "LEFT", "RIGHT",
    "INNER", "OUTER", "ON", "AS", "AND", "OR", "NOT", "NULL", "IS", "IN", "LIKE", "DESC",
    "ASC", "WITH", "DISTINCT", "HAVING", "CASE", "WHEN", "THEN", "ELSE", "END", "UNION",
    "ALL", "BETWEEN", "EXISTS", "INTERVAL", "OVER", "PARTITION",
]);
const SQL_FUNCTIONS = new Set(["SUM", "COUNT", "AVG", "MAX", "MIN", "ROUND", "COALESCE", "NULLIF", "CAST", "NOW", "EXTRACT", "LOWER", "UPPER", "ABS"]);

function highlightSql(sql) {
    const escaped = sql.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escaped.replace(
        /(--[^\n]*)|('[^']*')|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)/g,
        (match, comment, str, num, word) => {
            if (comment) return `<span class="sql-com">${comment}</span>`;
            if (str) return `<span class="sql-str">${str}</span>`;
            if (num) return `<span class="sql-num">${num}</span>`;
            if (word) {
                const upper = word.toUpperCase();
                if (SQL_KEYWORDS.has(upper)) return `<span class="sql-kw">${word}</span>`;
                if (SQL_FUNCTIONS.has(upper)) return `<span class="sql-fn">${word}</span>`;
            }
            return match;
        }
    );
}

function setAskStatus(html) {
    document.getElementById("askStatus").innerHTML = html;
}

function showColdStartBadge() {
    setAskStatus(`<div class="cold-start-badge text-[11px] text-amber-300"><span class="dot"></span>Waking up cloud compute instance...</div>`);
}

function showLoadingStatus() {
    setAskStatus(`<div class="entry-anim text-[11px] text-sky-300 flex items-center gap-2">
        <svg class="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M22 12a10 10 0 0 0-10-10"/></svg>
        Querying flight operations data...
    </div>`);
}

function toggleDrawer(bodyEl, chevronEl, open) {
    bodyEl.dataset.open = String(open);
    chevronEl.dataset.open = String(open);
}

function renderDataTable(columns, rows) {
    const head = document.getElementById("dataTableHead");
    const body = document.getElementById("dataTableBody");
    head.innerHTML = columns.map((c) => `<th>${c}</th>`).join("");
    body.innerHTML = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${cell === null ? "—" : cell}</td>`).join("")}</tr>`)
        .join("");
    document.getElementById("dataToggleLabel").textContent = `View Results Table (${rows.length} row${rows.length === 1 ? "" : "s"})`;
}

function resolveAirport(code) {
    if (!code) return null;
    return AIRPORTS.get(String(code).trim().toUpperCase()) || null;
}

function plotMarketResults(columns, rows) {
    clearLayers(marketLayers);
    if (!rows.length) return;

    const lower = columns.map((c) => c.toLowerCase());
    const originIdx = lower.indexOf("origin");
    const destIdx = lower.findIndex((c) => c === "dest" || c === "destination");
    const codeIdx = lower.findIndex((c) => ["code", "airport", "airport_code"].includes(c));
    const metricIdx = lower.findIndex((c) => ["passengers", "seats", "departures", "profit", "routes", "count"].includes(c));

    const plotRows = rows.slice(0, MAX_MARKET_PINS);
    const markerBounds = [];

    plotRows.forEach((row, i) => {
        const isTop = i === 0 && (metricIdx === -1 || metricIdx >= 0);
        if (originIdx >= 0 && destIdx >= 0) {
            const orig = resolveAirport(row[originIdx]);
            const dest = resolveAirport(row[destIdx]);
            if (!orig || !dest) return;
            const color = isTop ? "#10b981" : "#38bdf8";
            const destLon = unwrapLon(dest.lon, orig.lon);
            marketLayers.push(...addFlightArc(greatCirclePath([orig.lat, orig.lon], [dest.lat, dest.lon]), { color, weight: isTop ? 4 : 2.5 }));
            marketLayers.push(addSonarPing(orig.lat, orig.lon, { label: row[originIdx], emerald: isTop, popup: `<b>${row[originIdx]}</b><br>${orig.name}` }));
            marketLayers.push(addSonarPing(dest.lat, destLon, { label: row[destIdx], emerald: isTop, popup: `<b>${row[destIdx]}</b><br>${dest.name}` }));
            markerBounds.push([orig.lat, orig.lon], [dest.lat, destLon]);
        } else if (codeIdx >= 0) {
            const airport = resolveAirport(row[codeIdx]);
            if (!airport) return;
            marketLayers.push(addSonarPing(airport.lat, airport.lon, { label: row[codeIdx], emerald: isTop, popup: `<b>${row[codeIdx]}</b><br>${airport.name}` }));
            markerBounds.push([airport.lat, airport.lon]);
        }
    });

    if (markerBounds.length) {
        map.flyToBounds(L.latLngBounds(markerBounds), { ...hudPadding(), duration: 1.1 });
    }
}

async function askQuestion(question) {
    const askBtn = document.getElementById("askBtn");
    askBtn.disabled = true;
    document.getElementById("askResults").classList.add("hidden");
    showLoadingStatus();

    coldStartTimer = setTimeout(showColdStartBadge, COLD_START_MS);

    try {
        const response = await fetch(ASK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "The backend could not answer that question.");

        clearTimeout(coldStartTimer);
        setAskStatus("");

        document.getElementById("explanationText").innerText = data.explanation || "No explanation returned.";
        currentSql = data.sql || "";
        document.getElementById("sqlCode").innerHTML = currentSql ? highlightSql(currentSql) : "-- No SQL generated for this question.";
        renderDataTable(data.columns || [], data.rows || []);

        const results = document.getElementById("askResults");
        results.classList.remove("hidden");
        results.querySelectorAll(".entry-anim").forEach((el, i) => {
            el.style.animationDelay = `${i * 70}ms`;
        });

        toggleDrawer(document.getElementById("sqlBody"), document.getElementById("sqlChevron"), false);
        toggleDrawer(document.getElementById("dataDrawer"), document.getElementById("dataChevron"), false);

        plotMarketResults(data.columns || [], data.rows || []);
    } catch (err) {
        clearTimeout(coldStartTimer);
        setAskStatus(`<div class="entry-anim text-[11px] text-rose-400">⚠ ${err.message}</div>`);
    } finally {
        askBtn.disabled = false;
    }
}

document.getElementById("askForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const question = document.getElementById("askInput").value.trim();
    if (!question) return;
    askQuestion(question);
});

document.querySelectorAll(".prompt-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
        document.getElementById("askInput").value = chip.dataset.prompt;
        askQuestion(chip.dataset.prompt);
    });
});

document.getElementById("sqlToggle").addEventListener("click", () => {
    const body = document.getElementById("sqlBody");
    const open = body.dataset.open !== "true";
    toggleDrawer(body, document.getElementById("sqlChevron"), open);
});

document.getElementById("dataToggle").addEventListener("click", () => {
    const body = document.getElementById("dataDrawer");
    const open = body.dataset.open !== "true";
    toggleDrawer(body, document.getElementById("dataChevron"), open);
});

document.getElementById("copySqlBtn").addEventListener("click", async () => {
    const btn = document.getElementById("copySqlBtn");
    try {
        await navigator.clipboard.writeText(currentSql);
    } catch {
        const textarea = document.createElement("textarea");
        textarea.value = currentSql;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
    }
    btn.textContent = "Copied";
    btn.classList.add("copied");
    setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("copied");
    }, 1500);
});

// --------------------------------------------------------------------------
window.onload = () => {
    initMap();
    loadAirports();
    setMode("optimizer");
};
