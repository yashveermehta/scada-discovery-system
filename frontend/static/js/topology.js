/**
 * Topology Visualization — D3.js force-directed graph
 * Fixes applied:
 *  1. simulation.stop() called before every re-render (no ghost nodes)
 *  2. SVG resizes with window
 *  3. Node label truncation (long names no longer overflow)
 *  4. edges/links name normalisation
 *  5. statistics null-safety
 *  6. Link source/target resolved correctly from D3 objects
 *  7. Tooltip on hover
 *  8. Link bandwidth tooltip
 */

let simulation;
let svg;
let linkGroup;
let nodeGroup;
let currentTopology = null;
let svgWidth, svgHeight;

document.addEventListener('DOMContentLoaded', () => {
    initializeVisualization();
    setupEventListeners();
    loadTopology();
});

// ── Init ──────────────────────────────────────────────────────
function initializeVisualization() {
    const container = document.getElementById('topology-canvas');
    svgWidth  = container.clientWidth  || 900;
    svgHeight = container.clientHeight || 580;

    svg = d3.select('#topology-canvas')
        .append('svg')
        .attr('width',  svgWidth)
        .attr('height', svgHeight);

    // Zoom & pan
    const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
            svgGroup.attr('transform', event.transform);
        });
    svg.call(zoom);

    // Single root group so zoom works correctly
    window.svgGroup = svg.append('g').attr('class', 'svg-root');
    linkGroup = svgGroup.append('g').attr('class', 'links');
    nodeGroup = svgGroup.append('g').attr('class', 'nodes');

    simulation = d3.forceSimulation()
        .force('link',      d3.forceLink().id(d => d.id).distance(160))
        .force('charge',    d3.forceManyBody().strength(-500))
        .force('center',    d3.forceCenter(svgWidth / 2, svgHeight / 2))
        .force('collision', d3.forceCollide().radius(55));

    // FIX: resize SVG when window resizes
    window.addEventListener('resize', () => {
        const c = document.getElementById('topology-canvas');
        svgWidth  = c.clientWidth;
        svgHeight = c.clientHeight;
        svg.attr('width', svgWidth).attr('height', svgHeight);
        simulation.force('center', d3.forceCenter(svgWidth / 2, svgHeight / 2));
        simulation.alpha(0.2).restart();
    });
}

// ── Event listeners ───────────────────────────────────────────
function setupEventListeners() {
    document.getElementById('btn-discover').addEventListener('click', startDiscovery);
    document.getElementById('btn-demo').addEventListener('click', loadDemo);
    document.getElementById('btn-refresh').addEventListener('click', loadTopology);
    document.getElementById('btn-export').addEventListener('click', exportTopology);
}

// ── Load topology from DB ─────────────────────────────────────
async function loadTopology() {
    updateStatus('Loading topology...', 'discovering');
    try {
        const data = await window.API.getTopology();
        if (data.nodes && data.nodes.length > 0) {
            currentTopology = data;
            renderTopology(data);
            updateStats(data.statistics || {
                total_devices: data.nodes.length,
                total_connections: (data.edges || data.links || []).length
            });
            updateStatus('Topology loaded — ' + data.nodes.length + ' devices', 'ready');
        } else {
            clearGraph();
            updateStats({ total_devices: 0, total_connections: 0 });
            updateStatus('No topology yet — click Load Demo to begin', 'ready');
        }
    } catch (error) {
        console.error('Load topology error:', error);
        updateStatus('Cannot connect to server', 'error');
    }
}

// ── Load demo ─────────────────────────────────────────────────
async function loadDemo() {
    updateStatus('Loading GAIL SCADA demo...', 'discovering');
    document.getElementById('btn-demo').disabled = true;
    try {
        const result = await window.API.loadDemo();
        if (result.status === 'success') {
            currentTopology = result.topology;
            renderTopology(result.topology);
            const stats = result.topology.statistics || {
                total_devices:     (result.topology.nodes || []).length,
                total_connections: (result.topology.links || result.topology.edges || []).length
            };
            updateStats(stats);
            updateStatus('Demo loaded — ' + stats.total_devices + ' devices, ' + stats.total_connections + ' links', 'ready');
        } else {
            updateStatus('Failed to load demo', 'error');
        }
    } catch (error) {
        console.error('Demo load error:', error);
        updateStatus('Error: ' + error.message, 'error');
    } finally {
        document.getElementById('btn-demo').disabled = false;
    }
}

// ── Start discovery ───────────────────────────────────────────
async function startDiscovery() {
    updateStatus('Sending discovery request...', 'discovering');
    document.getElementById('btn-discover').disabled = true;
    try {
        const result = await window.API.startDiscovery();
        if (result.status === 'success') {
            currentTopology = result.topology;
            renderTopology(result.topology);
            const stats = result.topology.statistics || {
                total_devices:     (result.topology.nodes || []).length,
                total_connections: (result.topology.links || []).length
            };
            updateStats(stats);
            updateStatus('Discovery complete — ' + stats.total_devices + ' devices found', 'ready');
        } else {
            updateStatus('Discovery: ' + (result.message || result.error || 'failed'), 'error');
        }
    } catch (error) {
        console.error('Discovery error:', error);
        updateStatus('Discovery error: ' + error.message, 'error');
    } finally {
        document.getElementById('btn-discover').disabled = false;
    }
}

// ── Render topology ───────────────────────────────────────────
function renderTopology(topology) {
    if (!topology || !topology.nodes || topology.nodes.length === 0) return;

    // FIX: normalise edges/links naming
    const edges = topology.edges || topology.links || [];

    // FIX: stop simulation before clearing so tick() doesn't fire on removed elements
    simulation.stop();
    linkGroup.selectAll('*').remove();
    nodeGroup.selectAll('*').remove();

    // ── Links ──
    const linkSel = linkGroup.selectAll('line')
        .data(edges)
        .enter()
        .append('line')
        .attr('class', d => {
            const proto = (d.protocol || '').toLowerCase().replace(/[\s/]/g, '');
            return 'link ' + proto;
        })
        .attr('stroke-width', d => d.protocol === 'EIGRP' ? 2.5 : 1.8)
        // FIX: tooltip showing bandwidth on hover
        .append('title').text(d => `${d.protocol || 'Link'} — ${d.bandwidth || 'Unknown'}`);

    // Re-select after append('title') consumed the selection
    const linkLines = linkGroup.selectAll('line');

    // ── Nodes ──
    const nodeSel = nodeGroup.selectAll('g')
        .data(topology.nodes, d => d.id)
        .enter()
        .append('g')
        .attr('class', d => 'node ' + (d.type || 'unknown'))
        .call(d3.drag()
            .on('start', dragStarted)
            .on('drag',  dragged)
            .on('end',   dragEnded))
        .on('click', (event, d) => showDeviceDetails(d));

    // Outer glow ring for unauthorized devices
    nodeSel.append('circle')
        .attr('r', 32)
        .attr('fill', 'none')
        .attr('stroke', d => d.is_authorized ? 'none' : '#e53935')
        .attr('stroke-width', 2.5)
        .attr('opacity', 0.7)
        .attr('stroke-dasharray', '4,3');

    // Main circle
    nodeSel.append('circle').attr('r', 25);

    // FIX: truncate long device names so they don't overflow
    nodeSel.append('text')
        .text(d => {
            const label = d.name || d.hostname || d.id;
            return label.length > 16 ? label.slice(0, 14) + '…' : label;
        })
        .attr('dy', 42)
        .attr('text-anchor', 'middle');

    // Emoji icon inside circle
    nodeSel.append('text')
        .text(d => getDeviceIcon(d.type))
        .attr('dy', 8)
        .attr('text-anchor', 'middle')
        .attr('font-size', '18px')
        .attr('fill', 'white')
        .style('pointer-events', 'none');

    // Native tooltip
    nodeSel.append('title')
        .text(d => `${d.name || d.id}\nIP: ${d.id}\nType: ${d.type}\nOS: ${d.os || 'N/A'}`);

    // ── Simulation ──
    simulation
        .nodes(topology.nodes)
        .on('tick', () => {
            // FIX: after D3 processes links, source/target become objects not strings
            linkLines
                .attr('x1', d => (typeof d.source === 'object' ? d.source.x : 0) || 0)
                .attr('y1', d => (typeof d.source === 'object' ? d.source.y : 0) || 0)
                .attr('x2', d => (typeof d.target === 'object' ? d.target.x : 0) || 0)
                .attr('y2', d => (typeof d.target === 'object' ? d.target.y : 0) || 0);

            nodeSel.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
        });

    simulation.force('link').links(edges);
    simulation.alpha(1).restart();
}

function clearGraph() {
    simulation.stop();
    if (linkGroup) linkGroup.selectAll('*').remove();
    if (nodeGroup) nodeGroup.selectAll('*').remove();
    currentTopology = null;
}

// ── Icons ─────────────────────────────────────────────────────
function getDeviceIcon(type) {
    return { router: '🔷', switch: '🔶', firewall: '🛡️', server: '🖥️', unknown: '❓' }[type] || '❓';
}

// ── Drag ──────────────────────────────────────────────────────
function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
}
function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null; d.fy = null;
}

// ── Device detail panel ───────────────────────────────────────
function showDeviceDetails(device) {
    document.getElementById('panel-title').textContent = device.name || device.id;
    const authHTML = device.is_authorized
        ? '<span class="auth-badge yes">✅ Authorized</span>'
        : '<span class="auth-badge no">❌ Unauthorized — NOT in baseline</span>';

    document.getElementById('device-details').innerHTML = `
        <div class="detail-item">
            <div class="detail-label">IP Address</div>
            <div class="detail-value">${device.id || device.ip || 'N/A'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Hostname / Name</div>
            <div class="detail-value">${device.name || device.hostname || 'Unknown'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Device Type</div>
            <div class="detail-value">${getDeviceIcon(device.type)} ${(device.type || 'unknown').toUpperCase()}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Operating System</div>
            <div class="detail-value">${device.os || 'N/A'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">MAC Address</div>
            <div class="detail-value">${device.mac || 'N/A'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Uptime</div>
            <div class="detail-value">${device.uptime || 'N/A'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Status</div>
            <div class="detail-value">${device.status || 'Unknown'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Security Authorization</div>
            <div class="detail-value">${authHTML}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Last Seen</div>
            <div class="detail-value">${device.last_seen ? new Date(device.last_seen).toLocaleString() : 'N/A'}</div>
        </div>
    `;
    document.getElementById('device-panel').classList.remove('hidden');
}

function closeDevicePanel() {
    document.getElementById('device-panel').classList.add('hidden');
}

// ── Stats & status ────────────────────────────────────────────
function updateStats(stats) {
    if (!stats) return;
    document.getElementById('stat-devices').textContent     = stats.total_devices || 0;
    document.getElementById('stat-connections').textContent = stats.total_connections || 0;
}

function updateStatus(message, state = 'ready') {
    document.getElementById('status-text').textContent = message;
    const bar = document.getElementById('status-bar');
    bar.classList.remove('discovering', 'error', 'ready');
    bar.classList.add(state);
}

// ── Export ────────────────────────────────────────────────────
async function exportTopology() {
    if (!currentTopology || !currentTopology.nodes || currentTopology.nodes.length === 0) {
        alert('No topology to export. Load Demo or run Discovery first.');
        return;
    }
    const blob = new Blob([JSON.stringify(currentTopology, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `scada-topology-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    updateStatus('Topology exported as JSON', 'ready');
}
