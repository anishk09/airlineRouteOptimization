const API_URL = window.location.origin + "/api";
let map, activeLayers = [];
let mapIsUnlocked = false;
let airportIndex = {};

// Each strategy gets its own colour AND line pattern + icon, so meaning never relies on colour alone.
const ROUTES = [
    {
        key: "fuel_route",
        title: "Fuel efficiency",
        caption: "Rides the jetstream for the lowest burn",
        color: "#22C55E",
        dashArray: null,
        weight: 4,
        icon: '<line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>'
    },
    {
        key: "passenger_route",
        title: "High-load transit",
        caption: "Discounted fare to maximise seats filled",
        color: "#3B82F6",
        dashArray: "10 7",
        weight: 4,
        icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
    },
    {
        key: "profit_route",
        title: "Max profit",
        caption: "Yield-optimised fare on the direct track",
        color: "#F97316",
        dashArray: "1 8",
        weight: 5,
        icon: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'
    }
];

const DEFAULTS = {
    origin: "JFK",
    destination: "LAX",
    aircraft_type: "b77w",
    fuel_price: "3.50",
    ticket_price: "450",
    passenger_demand: "1.0"
};

const $ = (id) => document.getElementById(id);
const fmtInt = (n) => Math.round(n).toLocaleString();
const fmtMoney = (n) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;

// Initialize Dashboard Map (side dragging active, zoom locked until a route is plotted)
function initMap() {
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
}

function setAirportStatus(text, isError = false) {
    const el = $('airportStatus');
    el.textContent = text;
    el.classList.toggle('text-danger', isError);
    el.classList.toggle('text-muted', !isError);
}

// Populate the searchable airport database and the map's airport dots
async function loadAirports() {
    try {
        const response = await fetch(`${API_URL}/airports`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        airportIndex = await response.json();

        const dataList = $('airportOptions');
        dataList.innerHTML = "";

        Object.keys(airportIndex).forEach((code) => {
            const airport = airportIndex[code];
            const option = document.createElement('option');
            option.value = code;
            option.textContent = `${code} – ${airport.name}`;
            dataList.appendChild(option);

            const marker = L.circleMarker([airport.lat, airport.lon], {
                color: 'rgba(255, 255, 255, 0.2)',
                radius: 0.8,
                weight: 1,
                fillColor: '#ffffff',
                fillOpacity: 0.6
            }).addTo(map);

            marker.on('mouseover', function () {
                this.setStyle({ color: '#60A5FA', radius: 5.0, weight: 2, fillOpacity: 1.0 });
            });
            marker.on('mouseout', function () {
                this.setStyle({ color: 'rgba(255, 255, 255, 0.2)', radius: 0.8, weight: 1, fillOpacity: 0.6 });
            });

            const popup = document.createElement('div');
            popup.innerHTML = '<b></b><br><span></span>';
            popup.querySelector('b').textContent = code;
            popup.querySelector('span').textContent = airport.name;
            marker.bindPopup(popup);
        });

        $('origin').value = DEFAULTS.origin;
        $('destination').value = DEFAULTS.destination;
        setAirportStatus(`${Object.keys(airportIndex).length.toLocaleString()} airports loaded`);
    } catch (err) {
        console.error("Failed to fetch airports from backend:", err);
        setAirportStatus("Couldn't load the airport list. Check the backend and refresh.", true);
    }
}

// ---------- Validation (inline errors next to each field) ----------

function setFieldError(id, message) {
    const input = $(id);
    const err = $(`${id}-error`);
    if (message) {
        input.setAttribute('aria-invalid', 'true');
        err.textContent = message;
        err.classList.remove('hidden');
    } else {
        input.removeAttribute('aria-invalid');
        err.textContent = "";
        err.classList.add('hidden');
    }
}

function validateAirport(id, label) {
    const code = $(id).value.trim().toUpperCase();
    if (!code) return `Enter a ${label} airport code.`;
    if (Object.keys(airportIndex).length && !airportIndex[code]) return `"${code}" isn't a known airport code.`;
    return null;
}

function validateForm() {
    const errors = {
        origin: validateAirport('origin', 'origin'),
        destination: validateAirport('destination', 'destination'),
        fuel_price: null,
        ticket_price: null
    };

    if (!errors.origin && !errors.destination &&
        $('origin').value.trim().toUpperCase() === $('destination').value.trim().toUpperCase()) {
        errors.destination = "Destination must differ from origin.";
    }

    const fuel = parseFloat($('fuel_price').value);
    if (!(fuel > 0)) errors.fuel_price = "Enter a price above 0.";
    const ticket = parseFloat($('ticket_price').value);
    if (!(ticket > 0)) errors.ticket_price = "Enter a price above 0.";

    Object.entries(errors).forEach(([id, msg]) => setFieldError(id, msg));
    const firstInvalid = Object.keys(errors).find((id) => errors[id]);
    if (firstInvalid) $(firstInvalid).focus();
    return !firstInvalid;
}

function showFormError(message) {
    const box = $('formError');
    if (message) {
        $('formErrorText').textContent = message;
        box.classList.remove('hidden');
        box.focus();
    } else {
        box.classList.add('hidden');
    }
}

['origin', 'destination'].forEach((id) => {
    $(id).addEventListener('blur', () => {
        if ($(id).value.trim()) setFieldError(id, validateAirport(id, id));
    });
    $(id).addEventListener('input', () => setFieldError(id, null));
});
['fuel_price', 'ticket_price'].forEach((id) => {
    $(id).addEventListener('input', () => setFieldError(id, null));
});

function setLoading(isLoading) {
    const btn = $('optimizeBtn');
    btn.disabled = isLoading;
    btn.setAttribute('aria-busy', String(isLoading));
    $('optimizeSpinner').classList.toggle('hidden', !isLoading);
    $('optimizeLabel').textContent = isLoading ? "Optimizing…" : "Optimize routes";
}

function clearRoutes() {
    activeLayers.forEach(layer => map.removeLayer(layer));
    activeLayers = [];
}

// ---------- Results ----------

function legendSwatch(route) {
    const dash = route.dashArray ? `stroke-dasharray="${route.dashArray}"` : "";
    return `<svg width="28" height="8" viewBox="0 0 28 8" aria-hidden="true"><line x1="2" y1="4" x2="26" y2="4" stroke="${route.color}" stroke-width="${route.weight - 1}" stroke-linecap="round" ${dash}/></svg>`;
}

function metric(label, value, extraClass = "") {
    return `<div><dt class="text-xs text-muted whitespace-nowrap">${label}</dt><dd class="font-mono text-sm tabular-nums ${extraClass}">${value}</dd></div>`;
}

function renderResults(data) {
    const best = ROUTES.reduce((a, b) => (data[b.key].profit > data[a.key].profit ? b : a));

    $('resultCards').innerHTML = ROUTES.map((route) => {
        const r = data[route.key];
        const isBest = route === best;
        const profitClass = r.profit < 0 ? "text-danger" : "text-foreground font-semibold";
        return `
        <article class="rounded-xl border bg-field/60 p-3 ${isBest ? "border-white/25" : "border-hairline"}">
            <header class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="shrink-0 rounded-md p-1.5" style="color:${route.color};background:${route.color}1f">
                        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${route.icon}</svg>
                    </span>
                    <div class="min-w-0">
                        <h3 class="text-sm font-semibold leading-tight">${route.title}</h3>
                        <p class="text-xs text-muted">${route.caption}</p>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1 shrink-0">
                    ${legendSwatch(route)}
                    ${isBest ? '<span class="text-[11px] font-medium rounded-full bg-white/10 px-2 py-0.5 whitespace-nowrap">Top profit</span>' : ""}
                </div>
            </header>
            <dl class="grid grid-cols-4 gap-2 mt-3">
                ${metric("Fare", fmtMoney(r.suggested_fare))}
                ${metric("Dist (nm)", fmtInt(r.distance))}
                ${metric("Burn (gal)", fmtInt(r.fuel_burn))}
                ${metric("Pax", fmtInt(r.passengers))}
            </dl>
            <div class="mt-2 pt-2 border-t border-hairline flex items-baseline justify-between">
                <span class="text-xs text-muted">Net profit / flight</span>
                <span class="font-mono tabular-nums ${profitClass}">${fmtMoney(r.profit)}</span>
            </div>
            <details class="mt-2 group">
                <summary class="text-xs text-muted cursor-pointer hover:text-foreground transition-colors duration-200 select-none">How this was calculated</summary>
                <p class="text-xs text-muted leading-relaxed mt-1.5" data-desc></p>
            </details>
        </article>`;
    }).join("");

    // Descriptions come from the backend: insert as text, never HTML
    $('resultCards').querySelectorAll('[data-desc]').forEach((el, i) => {
        el.textContent = data[ROUTES[i].key].description;
    });

    $('resultsRoute').textContent = `${$('origin').value.trim().toUpperCase()} → ${$('destination').value.trim().toUpperCase()}`;
    $('resultsMatrix').classList.remove('hidden');
}

function drawRoutes(data) {
    ROUTES.forEach((route) => {
        const line = L.polyline(data[route.key].path, {
            color: route.color,
            weight: route.weight,
            opacity: 0.9,
            dashArray: route.dashArray,
            lineCap: 'round',
            noWrap: true,
            className: 'route-line'
        }).addTo(map);
        line.bindTooltip(route.title, { sticky: true });
        activeLayers.push(line);
    });

    // Keep routes clear of the control panel (left sidebar on desktop, bottom sheet on mobile)
    const panel = document.querySelector('.panel').getBoundingClientRect();
    const isSheet = window.matchMedia('(max-width: 767px)').matches;
    const group = new L.featureGroup(activeLayers);
    map.fitBounds(group.getBounds(), {
        paddingTopLeft: isSheet ? [24, 24] : [panel.right + 24, 24],
        paddingBottomRight: isSheet ? [24, window.innerHeight - panel.top + 24] : [24, 24]
    });
}

function unlockMapZoom() {
    if (mapIsUnlocked) return;
    map.scrollWheelZoom.enable();
    map.doubleClickZoom.enable();
    map.boxZoom.enable();
    map.touchZoom.enable();
    L.control.zoom({ position: 'topright' }).addTo(map);
    mapIsUnlocked = true;
}

// Handle form submission and optimization calculations
$('optForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showFormError(null);
    if (!validateForm()) return;

    const payload = {
        origin: $('origin').value.trim().toUpperCase(),
        destination: $('destination').value.trim().toUpperCase(),
        aircraft_type: $('aircraft_type').value,
        fuel_price: parseFloat($('fuel_price').value),
        ticket_price: parseFloat($('ticket_price').value),
        passenger_demand: parseFloat($('passenger_demand').value)
    };

    setLoading(true);
    try {
        const response = await fetch(`${API_URL}/optimize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error("The optimizer couldn't calculate these routes. Please try again.");
        }

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        clearRoutes();
        unlockMapZoom();
        renderResults(data);
        drawRoutes(data);
    } catch (err) {
        console.error("Optimization pipeline failed:", err);
        showFormError(err.message || "Couldn't reach the optimization service.");
    } finally {
        setLoading(false);
    }
});

// Reset everything back to defaults
$('resetBtn').addEventListener('click', (e) => {
    e.preventDefault();
    clearRoutes();
    $('resultsMatrix').classList.add('hidden');
    $('resultCards').innerHTML = "";
    showFormError(null);

    Object.entries(DEFAULTS).forEach(([id, value]) => { $(id).value = value; });
    ['origin', 'destination', 'fuel_price', 'ticket_price'].forEach((id) => setFieldError(id, null));
    $('demandVal').textContent = `${DEFAULTS.passenger_demand}×`;

    map.setView([30, 0], 3);
});

$('passenger_demand').addEventListener('input', (e) => {
    $('demandVal').textContent = `${parseFloat(e.target.value).toFixed(1)}×`;
});

window.onload = () => {
    initMap();
    loadAirports();
};
