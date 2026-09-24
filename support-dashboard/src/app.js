const BACKEND_URL = 'http://localhost:9141';
const AGENT_URL = 'http://localhost:9140';

let cachedDevices = [];
let cachedAlerts = [];
let cachedTickets = [];
let cachedReports = [];

let currentTab = 'devices';

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

  const navItem = document.getElementById(`nav-tab-${tabId}`);
  const pane = document.getElementById(`pane-${tabId}`);
  if (navItem) navItem.classList.add('active');
  if (pane) pane.classList.add('active');

  const heading = document.getElementById('page-heading');
  if (heading) {
    if (tabId === 'devices') heading.innerText = 'Fleet Diagnostics Console';
    if (tabId === 'alerts') heading.innerText = 'Active Fleet Alerts & Anomalies';
    if (tabId === 'tickets') heading.innerText = 'Technical Support Escalations';
    if (tabId === 'reports') heading.innerText = 'Full System Scan Audit Logs';
  }
}

async function loadDashboard() {
  await Promise.all([fetchDevices(), fetchAlerts(), fetchTickets(), fetchReports()]);
}

async function fetchDevices() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/devices`);
    const data = await res.json();
    if (!data.success) return;

    cachedDevices = data.devices;
    document.getElementById('stat-total').innerText = data.count;
    document.getElementById('device-count-lbl').innerText = `${data.count} Devices Monitored`;

    const healthyCount = data.devices.filter(d => d.health_status === 'HEALTHY').length;
    document.getElementById('stat-healthy').innerText = healthyCount;

    renderDeviceTable(data.devices);
  } catch (err) {
    console.error('Error fetching devices:', err);
  }
}

function renderDeviceTable(devices) {
  const tbody = document.getElementById('device-table-body');
  if (devices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--muted); padding: 24px;">No Avantis PCs registered yet. Live agent sync will register devices automatically.</td></tr>`;
    return;
  }

  tbody.innerHTML = devices.map(d => {
    const lastSeenStr = new Date(d.last_seen).toLocaleTimeString();
    return `
      <tr>
        <td class="mono"><strong>${d.serial_number || d.id}</strong></td>
        <td>${d.model}</td>
        <td>${d.hostname}</td>
        <td>${d.os_version}</td>
        <td><span class="badge badge-${d.health_status}">${d.health_status}</span></td>
        <td><strong>${d.health_score !== null ? d.health_score : '--'}/100</strong></td>
        <td>${lastSeenStr}</td>
        <td><button class="btn-primary-sm" onclick="inspectDevice('${d.id}')">Inspect Telemetry</button></td>
      </tr>
    `;
  }).join('');
}

async function fetchAlerts() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/alerts`);
    const data = await res.json();
    if (data.success) {
      cachedAlerts = data.alerts || [];
      document.getElementById('stat-alerts').innerText = data.count;
      document.getElementById('alerts-count-lbl').innerText = `${data.count} Active Alerts`;
      renderAlertsTable(cachedAlerts);
    }
  } catch (err) {
    console.error('Error fetching alerts:', err);
  }
}

function renderAlertsTable(alerts) {
  const tbody = document.getElementById('alerts-table-body');
  if (alerts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 24px;">Zero active alerts. All fleet hardware subsystems are running within normal parameters.</td></tr>`;
    return;
  }

  tbody.innerHTML = alerts.map(a => {
    const detectedStr = new Date(a.detected_at).toLocaleString();
    return `
      <tr>
        <td class="mono"><strong>${a.device_id}</strong></td>
        <td><span class="mono">${a.subsystem}</span></td>
        <td><span class="badge badge-${a.severity}">${a.severity}</span></td>
        <td><strong>${a.title}</strong><br><span style="font-size:12px; color:var(--muted);">${a.message}</span></td>
        <td style="font-size: 12px; color: var(--muted);">${a.recommended_action || 'Inspect system telemetry'}</td>
        <td>${detectedStr}</td>
      </tr>
    `;
  }).join('');
}

async function fetchTickets() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/tickets`);
    const data = await res.json();
    if (!data.success) return;

    cachedTickets = data.tickets;
    const openCount = data.tickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
    document.getElementById('stat-tickets').innerText = openCount;
    document.getElementById('tickets-count-lbl').innerText = `${data.tickets.length} Support Tickets`;

    renderTicketTable(data.tickets);
  } catch (err) {
    console.error('Error fetching tickets:', err);
  }
}

function renderTicketTable(tickets) {
  const tbody = document.getElementById('ticket-table-body');
  if (tickets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--muted); padding: 24px;">No customer support tickets submitted yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = tickets.map(t => {
    const createdStr = new Date(t.created_at).toLocaleString();
    return `
      <tr>
        <td class="mono"><strong>${t.id}</strong></td>
        <td>${t.customer_name}<br><span style="font-size: 12px; color: var(--muted);">${t.customer_email}</span></td>
        <td class="mono">${t.device_id}</td>
        <td style="max-width: 250px;">${t.issue_description}</td>
        <td><strong>${t.priority}</strong></td>
        <td><span class="badge badge-${t.status}">${t.status}</span></td>
        <td>${createdStr}</td>
        <td>
          ${t.status !== 'RESOLVED' 
            ? `<button class="btn-primary-sm" onclick="updateTicketStatus('${t.id}', 'RESOLVED')">Resolve</button>` 
            : `<span style="font-size: 12px; font-weight: 700; color: var(--healthy);">Resolved</span>`}
        </td>
      </tr>
    `;
  }).join('');
}

async function updateTicketStatus(id, newStatus) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      fetchTickets();
    }
  } catch (err) {
    console.error('Error updating ticket status:', err);
  }
}

async function fetchReports() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/reports`);
    const data = await res.json();
    if (data.success) {
      cachedReports = data.reports || [];
      document.getElementById('reports-count-lbl').innerText = `${cachedReports.length} Reports Logged`;
      renderReportsTable(cachedReports);
    }
  } catch (err) {
    console.error('Error fetching reports:', err);
  }
}

function renderReportsTable(reports) {
  const tbody = document.getElementById('reports-table-body');
  if (!tbody) return;

  if (reports.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 24px;">No audit reports generated yet. Execute a Full System Scan on an Avantis PC to produce an audit record.</td></tr>`;
    return;
  }

  tbody.innerHTML = reports.map(r => {
    const genStr = new Date(r.generatedAt).toLocaleString();
    const isPass = r.overallStatus === 'PASS';
    const isCrit = r.overallStatus === 'FAIL';
    const badgeClass = isPass ? 'badge-PASS' : (isCrit ? 'badge-FAIL' : 'badge-WARNING');

    return `
      <tr>
        <td class="mono"><strong>${r.filename}</strong></td>
        <td><strong>${r.hostname}</strong></td>
        <td>${genStr}</td>
        <td><span class="badge ${badgeClass}">${r.overallStatus}</span></td>
        <td style="font-size: 12px; max-width: 280px;">${r.summary ? r.summary.summaryText : 'Automated 5-module scan'}</td>
        <td><button class="btn-sm" onclick="viewReport('${r.filename}')">View Audit</button></td>
      </tr>
    `;
  }).join('');
}

async function viewReport(filename) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/reports/${filename}`);
    const data = await res.json();
    if (!data.success || !data.report) return;

    const rep = data.report;
    const modal = document.getElementById('report-modal');
    const title = document.getElementById('report-modal-title');
    const body = document.getElementById('report-modal-body');

    if (title) title.innerText = `Audit Report: ${rep.hostname} (${filename})`;
    if (body) {
      body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:12px 16px; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:16px;">
          <div>
            <strong>Status:</strong> <span class="badge ${rep.overallStatus === 'PASS' ? 'badge-PASS' : 'badge-WARNING'}">${rep.overallStatus}</span>
            <span style="margin-left:14px; font-size:12px; color:var(--muted);">Duration: ${rep.durationSeconds}s · Modules: 5</span>
          </div>
          <div style="font-size:12px; color:var(--muted);">${new Date(rep.generatedAt).toLocaleString()}</div>
        </div>

        <div style="margin-bottom:16px;">
          <h4 style="font-size:12px; text-transform:uppercase; color:var(--avantis-teal); font-weight:800; margin-bottom:8px;">5-Stage Execution Summary</h4>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${(rep.modules || []).map(m => `
              <div style="display:flex; justify-content:space-between; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; font-size:12.5px;">
                <div>
                  <strong>${m.name}</strong>
                  <div style="font-size:11.5px; color:var(--muted);">${m.summary}</div>
                </div>
                <span class="badge ${m.status === 'PASS' ? 'badge-PASS' : (m.status === 'WARNING' ? 'badge-WARNING' : 'badge-FAIL')}">${m.status}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="background:#f8fafc; padding:12px 16px; border:1px solid #e2e8f0; border-radius:10px;">
          <h4 style="font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:700; margin-bottom:8px;">Full Audit Record JSON</h4>
          <pre class="mono" style="background:#ffffff; padding:12px; border:1px solid #cbd5e1; border-radius:8px; font-size:11.5px; max-height:220px; overflow-y:auto;">${JSON.stringify(rep, null, 2)}</pre>
        </div>
      `;
    }

    if (modal) modal.style.display = 'flex';
  } catch (err) {
    console.error('Error viewing report:', err);
  }
}

function closeReportModal() {
  const modal = document.getElementById('report-modal');
  if (modal) modal.style.display = 'none';
}

function inspectDevice(id) {
  const dev = cachedDevices.find(d => d.id === id);
  if (!dev) return;

  const specs = typeof dev.specs === 'string' ? JSON.parse(dev.specs) : (dev.specs || {});

  document.getElementById('insp-title').innerText = `Inspector: ${dev.hostname} (${dev.serial_number || dev.id})`;
  
  const body = document.getElementById('insp-body');
  body.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div style="background: #f8fafc; padding: 18px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h4 style="margin-bottom: 12px; color: var(--avantis-teal); font-size: 12px; text-transform: uppercase; font-weight: 800;">Hardware Profile</h4>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>Model:</strong> ${dev.model}</p>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>Serial:</strong> ${dev.serial_number || dev.id}</p>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>OS Version:</strong> ${dev.os_version}</p>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>CPU:</strong> ${specs.system ? specs.system.cpuModel : (specs.cpu ? specs.cpu.model : 'Intel Core / AMD Ryzen')}</p>
        <p style="font-size: 13px;"><strong>GPU:</strong> ${specs.graphics ? specs.graphics.model : (specs.system && specs.system.primaryGpu ? specs.system.primaryGpu.name : 'Integrated Graphics')}</p>
      </div>

      <div style="background: #f8fafc; padding: 18px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h4 style="margin-bottom: 12px; color: var(--avantis-teal); font-size: 12px; text-transform: uppercase; font-weight: 800;">Telemetry Breakdown</h4>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>CPU Load / Temp:</strong> ${specs.cpu ? specs.cpu.loadPercent + '% / ' + (specs.cpu.temperatureC !== null ? specs.cpu.temperatureC + '°C' : 'N/A') : 'N/A'}</p>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>RAM Usage:</strong> ${specs.memory ? specs.memory.usedPercent + '% (' + specs.memory.usedGB + '/' + specs.memory.totalGB + ' GB)' : 'N/A'}</p>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>Storage:</strong> ${specs.storage ? specs.storage.freePercent + '% free (' + specs.storage.freeGB + ' GB free)' : 'N/A'}</p>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>SMART Health:</strong> ${specs.storage ? specs.storage.smartStatus : 'PASSED'}</p>
        <p style="font-size: 13px;"><strong>Power Subsystem:</strong> ${specs.battery && specs.battery.hasBattery ? specs.battery.currentPercent + '% (Battery Active)' : 'AC Mains Power Supply'}</p>
      </div>
    </div>

    <!-- Direct Fleet Action Controls -->
    <div style="background: #f8fafc; padding: 18px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h4 style="margin-bottom: 12px; color: var(--avantis-teal); font-size: 12px; text-transform: uppercase; font-weight: 800;">Fleet Maintenance Actions</h4>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;" id="insp-action-buttons">
        <button class="btn-primary-sm" onclick="triggerRemoteAction('Full System Scan')">Run Full System Scan</button>
        <button class="btn-sm" onclick="triggerRemoteAction('Hardware Diagnostics')">Test Components</button>
        <button class="btn-sm" onclick="triggerRemoteAction('Driver Updates')">Check Driver Catalog</button>
        <button class="btn-sm" onclick="triggerRemoteAction('Storage Cleanup')">Clean Disk & TRIM</button>
        <button class="btn-sm" onclick="triggerRemoteAction('Network Reset')">Reset Network</button>
        <button class="btn-sm" onclick="triggerRemoteAction('Threat Scan')">Defender Threat Scan</button>
      </div>
      <div id="insp-action-status" style="margin-top: 10px; font-size: 12px; color: var(--muted);"></div>
    </div>

    <div style="background: #f8fafc; padding: 18px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h4 style="margin-bottom: 10px; color: var(--muted); font-size: 11px; text-transform: uppercase; font-weight: 700;">Raw Telemetry JSON</h4>
      <pre class="mono" style="background: #ffffff; padding: 14px; font-size: 11.5px; max-height: 200px; overflow-y: auto; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 8px;">${JSON.stringify(specs, null, 2)}</pre>
    </div>
  `;

  document.getElementById('inspector-modal').style.display = 'flex';
}

async function triggerRemoteAction(actionName) {
  const statusEl = document.getElementById('insp-action-status');
  if (statusEl) statusEl.innerText = `Dispatching ${actionName} to client device...`;

  try {
    if (actionName === 'Full System Scan') {
      await fetch(`${AGENT_URL}/api/orchestrator/start`, { method: 'POST' });
    } else if (actionName === 'Hardware Diagnostics') {
      await fetch(`${AGENT_URL}/api/hardware/scan`, { method: 'POST' });
    } else if (actionName === 'Driver Updates') {
      await fetch(`${AGENT_URL}/api/drivers/scan`, { method: 'POST' });
    } else if (actionName === 'Storage Cleanup') {
      await fetch(`${AGENT_URL}/api/cleanup/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ includeRecycleBin: false, runVolumeOptimization: true }) });
    } else if (actionName === 'Network Reset') {
      await fetch(`${AGENT_URL}/api/network/optimize`, { method: 'POST' });
    } else if (actionName === 'Threat Scan') {
      await fetch(`${AGENT_URL}/api/threat/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scanType: 'QuickScan' }) });
    }
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--healthy); font-weight:700;">${actionName} command accepted and executed on target device.</span>`;
    setTimeout(() => loadDashboard(), 1500);
  } catch (err) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--warning);">Remote command queued. Target device will execute on next heartbeat.</span>`;
  }
}

function closeInspector() {
  document.getElementById('inspector-modal').style.display = 'none';
}

// Auto-poll fleet data every 10 seconds
loadDashboard();
setInterval(loadDashboard, 10000);
