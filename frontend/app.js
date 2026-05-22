/**
 * Jalisco Crime Dashboard - Frontend Application
 * Handles API communication, data visualization, and user interactions
 */

// ===== CONFIGURATION =====
const CONFIG = {
    // Backend API URL - automatically detects environment
    apiUrl: window.location.hostname === 'localhost' 
        ? 'http://localhost:8000'
        : 'http://crime-backend-svc:8000',
    
    // Fallback for Minikube port-forward
    apiUrlFallback: 'http://localhost:8000',
    
    // Map configuration
    map: {
        center: [20.6737, -103.3440], // Guadalajara
        zoom: 9,
        maxPoints: 2000
    },
    
    // Retry configuration
    maxRetries: 3,
    retryDelay: 2000
};

// ===== GLOBAL STATE =====
const state = {
    map: null,
    markers: null,
    charts: {},
    data: {
        summary: null,
        points: [],
        filters: null
    },
    currentFilters: {
        delito: '',
        municipio: ''
    }
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Jalisco Crime Dashboard initializing...');
    initializeApp();
});

async function initializeApp() {
    try {
        showLoading(true);
        
        // Initialize map
        initializeMap();
        
        // Load initial data
        await loadAllData();
        
        // Setup event listeners
        setupEventListeners();
        
        // Update status
        updateConnectionStatus('connected', '✅ Conectado al backend');
        
        showLoading(false);
        console.log('✅ Application initialized successfully');
        
    } catch (error) {
        console.error('❌ Initialization error:', error);
        updateConnectionStatus('error', '❌ Error de conexión');
        showError('No se pudo cargar los datos. Verifica que el backend esté corriendo.');
        showLoading(false);
    }
}

// ===== API COMMUNICATION =====
async function fetchWithRetry(endpoint, retries = CONFIG.maxRetries) {
    let lastError;
    
    for (let i = 0; i < retries; i++) {
        try {
            const url = `${CONFIG.apiUrl}${endpoint}`;
            console.log(`📡 Fetching: ${url} (attempt ${i + 1}/${retries})`);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`✅ Success: ${endpoint}`, data);
            return data;
            
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ Attempt ${i + 1} failed:`, error.message);
            
            if (i < retries - 1) {
                await sleep(CONFIG.retryDelay);
            }
        }
    }
    
    // Try fallback URL
    try {
        const url = `${CONFIG.apiUrlFallback}${endpoint}`;
        console.log(`📡 Trying fallback: ${url}`);
        const response = await fetch(url);
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.error('Fallback also failed:', e);
    }
    
    throw lastError;
}

async function loadAllData() {
    // Load summary data
    state.data.summary = await fetchWithRetry('/api/summary');
    renderSummaryCards(state.data.summary);
    renderCharts(state.data.summary);
    
    // Load filter options
    state.data.filters = await fetchWithRetry('/api/filters');
    populateFilters(state.data.filters);
    
    // Load initial map points
    await loadMapPoints();
}

async function loadMapPoints(filters = {}) {
    try {
        // 1. Construir parámetros de búsqueda dinámicos
        const params = new URLSearchParams();
        if (filters.delito) params.append('delito', filters.delito);
        if (filters.municipio) params.append('municipio', filters.municipio);

        console.log(`📡 Solicitando puntos geográficos con filtros:`, filters);

        // fetchWithRetry already returns parsed JSON — do NOT call .ok or .json() on it.
        const rawData = await fetchWithRetry(`/api/points?${params.toString()}`);
        let points = [];

        // 3. Validar de forma segura la estructura del JSON devuelto
        if (Array.isArray(rawData)) {
            points = rawData; // Si viene como arreglo directo en la raíz
        } else if (rawData && Array.isArray(rawData.sample)) {
            points = rawData.sample; // Si viene envuelto en la llave 'sample'
        } else if (rawData && Array.isArray(rawData.points)) {
            points = rawData.points; // Si viene envuelto en la llave 'points'
        }

        // 4. Guardar en el estado global del frontend
        state.data.points = points;

        // 5. Validar si llegaron registros válidos
        if (!points || points.length === 0) {
            console.warn('⚠️ No se encontraron puntos con los filtros aplicados.');
            return;
        }

        // 6. Mandar los puntos a pintar al mapa de Leaflet
        renderMapPoints(points);
    // AFTER renderMapPoints(points):
    try {
        renderMapPoints(points);
    } catch(e) {
        console.error('Render error:', e);
    }
    // Always update counter regardless
    document.getElementById('pointsShown').textContent = points.length.toLocaleString('es-MX');

    } catch (error) {
        // CORRECCIÓN: Eliminamos la llamada a clearMapPoints() que no existía para evitar el ReferenceError
        console.error('❌ Error cargando puntos en el mapa:', error);
    }
}

// ===== UI RENDERING =====
function renderSummaryCards(summary) {
    document.getElementById('totalRecords').textContent =
        formatNumber(summary.total_records);

    if (summary.top_delitos && summary.top_delitos.length > 0) {
        const topDelito = summary.top_delitos[0];
        document.getElementById('topDelito').textContent =
            truncateText(topDelito.delito, 20);
        document.getElementById('topDelitoCount').textContent =
            `${formatNumber(topDelito.total)} casos`;
    }

    // FIX: by_municipio is an array of {municipio, total}
    if (Array.isArray(summary.by_municipio) && summary.by_municipio.length > 0) {
        const sorted = [...summary.by_municipio].sort((a, b) => b.total - a.total);
        document.getElementById('topMunicipio').textContent =
            truncateText(sorted[0].municipio, 20);
        document.getElementById('topMunicipioCount').textContent =
            `${formatNumber(sorted[0].total)} casos`;
    }

    // FIX: by_year is an array of {año, delito, total} — aggregate by year first
    if (Array.isArray(summary.by_year) && summary.by_year.length > 0) {
        const yearTotals = {};
        summary.by_year.forEach(row => {
            yearTotals[row.año] = (yearTotals[row.año] || 0) + row.total;
        });
        const years = Object.keys(yearTotals).sort();
        if (years.length >= 2) {
            const firstYear = yearTotals[years[0]];
            const lastYear  = yearTotals[years[years.length - 1]];
            const change = ((lastYear - firstYear) / firstYear * 100).toFixed(1);
            const arrow = change > 0 ? '↑' : '↓';
            const color = change > 0 ? '#dc2626' : '#22c55e';
            const trendEl = document.getElementById('trendValue');
            trendEl.textContent = `${arrow} ${Math.abs(change)}%`;
            trendEl.style.color = color;
        }
    }
}

function populateFilters(filters) {
    const delitoSelect = document.getElementById('delitoFilter');
    const municipioSelect = document.getElementById('municipioFilter');
    
    // Populate delitos
    if (filters.delitos) {
        filters.delitos.forEach(delito => {
            const option = document.createElement('option');
            option.value = delito;
            option.textContent = truncateText(delito, 50);
            delitoSelect.appendChild(option);
        });
    }
    
    // Populate municipios
    if (filters.municipios) {
        filters.municipios.forEach(municipio => {
            const option = document.createElement('option');
            option.value = municipio;
            option.textContent = municipio;
            municipioSelect.appendChild(option);
        });
    }
}

// ===== MAP FUNCTIONS =====
function initializeMap() {
    // Initialize Leaflet map
    state.map = L.map('map').setView(
        CONFIG.map.center,
        CONFIG.map.zoom
    );
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(state.map);
    
    // Initialize marker cluster group
    state.markers = L.featureGroup().addTo(state.map);
    
    console.log('🗺️ Map initialized');
}

function renderMapPoints(points) {
     state.markers.clearLayers();
    
    // Validar que existan puntos y que el mapa esté inicializado
    if (!points || !state.map) return;
    
    // Crear el grupo de marcadores si no existe
    if (!state.markers) {
        state.markers = L.featureGroup().addTo(state.map);
    }
    
    console.log(`📍 Renderizando ${Math.min(points.length, CONFIG.map.maxPoints)} puntos en el mapa...`);

    // Iterar sobre los puntos del dataset de criminalidad
    points.forEach(point => {
        // Corrección crucial: Tu JSON usa 'y' para Latitud y 'x' para Longitud
        const lat = parseFloat(point.y || point.lat);
        const lng = parseFloat(point.x || point.lng || point.lon);
        
        // Si el registro no tiene coordenadas válidas, se descarta de forma segura
        if (isNaN(lat) || isNaN(lng)) return;
        
        // Crear un marcador circular estético para cada delito
        const marker = L.circleMarker([lat, lng], {
            radius: 6,
            fillColor: '#dc3545', // Rojo para marcar el incidente
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        });
        
        // Crear un popup interactivo con los metadatos reales del JSON
        const popupContent = `
            <div class="map-popup">
                <h4 style="margin: 0 0 5px 0; color: #dc3545;">${point.delito || 'Delito no especificado'}</h4>
                <p style="margin: 3px 0;"><strong>📅 Fecha:</strong> ${point.fecha || 'N/A'}</p>
                <p style="margin: 3px 0;"><strong>🕒 Hora:</strong> ${point.hora || 'N/A'} hrs</p>
                <p style="margin: 3px 0;"><strong>🏢 Municipio:</strong> ${point.municipio || 'N/A'}</p>
                <p style="margin: 3px 0;"><strong>📍 Colonia:</strong> ${point.colonia || 'N/A'}</p>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        state.markers.addLayer(marker);
    });
    
    // Ajustar automáticamente la vista del mapa para encuadrar los marcadores visibles
    if (state.markers.getLayers().length > 0) {
        state.map.fitBounds(state.markers.getBounds(), { padding: [20, 20] });
}

}

// ===== CHARTS =====
function renderCharts(summary) {
    renderTrendChart(summary.by_year);
    renderMunicipioChart(summary.by_municipio);
    renderDelitoChart(summary.top_delitos);
}

function renderTrendChart(byYear) {
    const ctx = document.getElementById('trendChart');
    if (!ctx || !byYear) return;

    // FIX: aggregate [{año, delito, total}] → {year: total}
    const yearTotals = {};
    byYear.forEach(row => {
        yearTotals[row.año] = (yearTotals[row.año] || 0) + row.total;
    });
    const years  = Object.keys(yearTotals).sort();
    const values = years.map(y => yearTotals[y]);

    if (state.charts.trend) state.charts.trend.destroy();
    state.charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [{
                label: 'Crímenes por año',
                data: values,
                borderColor: '#FF3B30',
                backgroundColor: 'rgba(255, 59, 48, 0.08)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { callback: v => formatNumber(v) } } }
        }
    });
}

function renderMunicipioChart(byMunicipio) {
    const ctx = document.getElementById('municipioChart');
    if (!ctx || !byMunicipio) return;

    // FIX: byMunicipio is [{municipio, total}], not a plain object
    const sorted = [...byMunicipio].sort((a, b) => b.total - a.total).slice(0, 10);
    const labels = sorted.map(item => truncateText(item.municipio, 15));
    const values = sorted.map(item => item.total);

    if (state.charts.municipio) state.charts.municipio.destroy();
    state.charts.municipio = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: 'Casos', data: values, backgroundColor: '#FF3B30' }]
        },
        options: {
            responsive: true, maintainAspectRatio: true, indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { callback: v => formatNumber(v) } } }
        }
    });
}

function renderDelitoChart(topDelitos) {
    const ctx = document.getElementById('delitoChart');
    if (!ctx || !topDelitos) return;
    
    const top10 = topDelitos.slice(0, 10);
    const labels = top10.map(item => truncateText(item.delito, 20));
    const values = top10.map(item => item.total);
    
    if (state.charts.delito) {
        state.charts.delito.destroy();
    }
    
    state.charts.delito = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Casos',
                data: values,
                backgroundColor: '#0A0A0A'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => formatNumber(value)
                    }
                }
            }
        }
    });
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // Apply filters button
    document.getElementById('applyFilters').addEventListener('click', async () => {
        const delito = document.getElementById('delitoFilter').value;
        const municipio = document.getElementById('municipioFilter').value;
        
        state.currentFilters = { delito, municipio };
        
        showLoading(true);
        try {
            await loadMapPoints({ delito, municipio });
        } catch (error) {
            showError('Error al aplicar filtros');
        }
        showLoading(false);
    });
    
    // Reset filters button
    document.getElementById('resetFilters').addEventListener('click', async () => {
        document.getElementById('delitoFilter').value = '';
        document.getElementById('municipioFilter').value = '';
        state.currentFilters = { delito: '', municipio: '' };
        
        showLoading(true);
        try {
            await loadMapPoints();
        } catch (error) {
            showError('Error al resetear filtros');
        }
        showLoading(false);
    });
    
    // Retry button in error modal
    document.getElementById('retryBtn').addEventListener('click', () => {
        hideError();
        initializeApp();
    });
}

// ===== UTILITY FUNCTIONS =====
function updateConnectionStatus(status, text) {
    const dot = document.getElementById('statusDot');
    const textEl = document.getElementById('statusText');
    
    dot.className = `status-dot ${status}`;
    textEl.textContent = text;
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.toggle('hidden', !show);
}

function showError(message) {
    const modal = document.getElementById('errorModal');
    const messageEl = document.getElementById('errorMessage');
    
    messageEl.textContent = message;
    modal.classList.add('show');
}

function hideError() {
    document.getElementById('errorModal').classList.remove('show');
}

function formatNumber(num) {
    return new Intl.NumberFormat('es-MX').format(num);
}

function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== ERROR HANDLING =====
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});

