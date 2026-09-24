/**
 * AVANTIS PC ASSIST: CLIENT UI LOGIC
 * Complete Separation of Static Summary Outcomes & Live Telemetry Polling
 */

const AGENT_URL = (typeof window !== 'undefined' && window.location) 
  ? `${window.location.protocol}//${window.location.hostname || 'localhost'}:9140`
  : 'http://localhost:9140';

// Configurable Thresholds for Live Hardware Telemetry
const THRESHOLDS = {
  CPU_TEMP: { WARNING: 70, CRITICAL: 90 },
  CPU_LOAD: { WARNING: 80, CRITICAL: 95 },
  RAM_USAGE: { WARNING: 75, CRITICAL: 90 },
  STORAGE_USAGE: { WARNING: 85, CRITICAL: 95 }
};

let currentView = 'fullscan';
let currentHomeSubTab = 'summary';
let liveTelemetryTimer = null;
let latestStoredReport = null;
let liveDiagnosticsCache = null;

// Track last run status for 6 Action cards
const actionModulesState = {
  fullscan: { lastRun: null, status: 'NEVER' },
  drivers: { lastRun: null, status: 'NEVER' },
  scanhw: { lastRun: null, status: 'NEVER' },
  cleanup: { lastRun: null, status: 'NEVER' },
  network: { lastRun: null, status: 'NEVER' },
  threat: { lastRun: null, status: 'NEVER' }
};

// ============================================
// 1. ROUTING & NAVIGATION
// ============================================

function routeToNav(viewId) {
  // Normalize alias
  let targetView = viewId;
  if (targetView === 'fullscan') targetView = 'home';

  currentView = targetView;

  // Update Primary Tabs (Home, Discover, Support, History, Settings)
  document.querySelectorAll('.nav-tab-link').forEach(link => {
    link.classList.toggle('active', link.id === `tab-link-${targetView}`);
  });

  // Update Actions Toolbar Buttons (Fullscan, Drivers, Scanhw, Cleanup, Network, Threat)
  document.querySelectorAll('.toolbar-action-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `tb-btn-${viewId}` || (viewId === 'home' && btn.id === 'tb-btn-fullscan'));
  });

  // Switch Active View Page
  document.querySelectorAll('.view-page').forEach(page => {
    page.classList.toggle('active', page.id === `view-${targetView}`);
  });


  // Handle View-Specific Polling and Data Loading
  if (targetView === 'scanhw') {
    startLiveTelemetryPolling();
  } else {
    stopLiveTelemetryPolling();
  }

  if (targetView === 'home') {
    loadSummaryData();
  } else if (targetView === 'drivers') {
    loadDriversPage();
  } else if (targetView === 'cleanup') {
    loadCleanupPage();
  } else if (targetView === 'threat') {
    loadThreatPage();
  } else if (targetView === 'history') {
    loadHistoryPage();
  }
}

function switchHomeSubTab(tabKey) {
  currentHomeSubTab = tabKey;
  const btnSummary = document.getElementById('subtab-btn-summary');
  const btnActions = document.getElementById('subtab-btn-actions');
  const paneSummary = document.getElementById('subpane-summary');
  const paneActions = document.getElementById('subpane-actions');

  if (btnSummary) {
    btnSummary.classList.toggle('active', tabKey === 'summary');
    btnSummary.setAttribute('aria-selected', tabKey === 'summary' ? 'true' : 'false');
  }
  if (btnActions) {
    btnActions.classList.toggle('active', tabKey === 'actions');
    btnActions.setAttribute('aria-selected', tabKey === 'actions' ? 'true' : 'false');
  }
  if (paneSummary) paneSummary.classList.toggle('active', tabKey === 'summary');
  if (paneActions) paneActions.classList.toggle('active', tabKey === 'actions');

  if (tabKey === 'summary') {
    loadSummaryData();
  }
}

// ============================================
// 2. SUMMARY TAB: STATIC OUTCOME TILES
// ============================================

async function loadSummaryData() {
  const updatesEl = document.getElementById('outcome-updates-installed');
  const spaceEl = document.getElementById('outcome-space-recovered');
  const filesEl = document.getElementById('outcome-files-optimized');
  const threatsEl = document.getElementById('outcome-threats-removed');
  const promptEl = document.getElementById('summary-first-run-prompt');
  const metaText = document.getElementById('summary-meta-text');

  try {
    const res = await fetch(`${AGENT_URL}/api/reports/latest`);
    const data = await res.json();

    if (data.success && data.report) {
      latestStoredReport = data.report;
      const s = data.report.summary || {};
      const mods = data.report.modules || [];

      let updatesCount = s.updatesInstalled !== undefined ? s.updatesInstalled : 0;
      let spaceGb = s.spaceRecoveredGb !== undefined ? s.spaceRecoveredGb : 0;
      let filesCount = s.filesOptimized !== undefined ? s.filesOptimized : 0;
      let threatsCount = s.threatsRemoved !== undefined ? s.threatsRemoved : 0;

      if (mods.length > 0) {
        const drvMod = mods.find(m => m.key === 'drivers');
        if (updatesCount === 0 && drvMod && drvMod.data && drvMod.data.updatedCount !== undefined) {
          updatesCount = drvMod.data.updatedCount;
        }

        const cleanMod = mods.find(m => m.key === 'cleanup');
        if (cleanMod && cleanMod.data) {
          if (spaceGb === 0 && cleanMod.data.reclaimedMb) {
            spaceGb = parseFloat((cleanMod.data.reclaimedMb / 1024).toFixed(2));
          }
          if (filesCount === 0 && (cleanMod.data.reclaimedFilesCount || cleanMod.data.deletedFilesCount)) {
            filesCount = cleanMod.data.reclaimedFilesCount || cleanMod.data.deletedFilesCount;
          }
        }

        const threatMod = mods.find(m => m.key === 'threat');
        if (threatsCount === 0 && threatMod && threatMod.data && threatMod.data.remediatedCount !== undefined) {
          threatsCount = threatMod.data.remediatedCount;
        }
      }

      if (updatesEl) updatesEl.innerText = updatesCount;
      if (spaceEl) spaceEl.innerText = `${spaceGb} GB`;
      if (filesEl) filesEl.innerText = filesCount;
      if (threatsEl) threatsEl.innerText = threatsCount;

      if (promptEl) promptEl.hidden = true;

      const dateStr = new Date(data.report.generatedAt).toLocaleString();
      if (metaText) metaText.innerText = `Last Completed Scan: ${dateStr}`;

      const status = data.report.overallStatus || 'PASS';

      // Update Full Scan action card state
      actionModulesState.fullscan.lastRun = dateStr;
      actionModulesState.fullscan.status = status;
      updateActionCardUI('fullscan');

      // Update Service Tag
      const sTag = document.getElementById('header-service-tag');
      if (sTag && data.report.hostname) {
        sTag.innerText = data.report.hostname;
      }

    } else {
      // No report ever run
      if (updatesEl) updatesEl.innerText = '0';
      if (spaceEl) spaceEl.innerText = '0 GB';
      if (filesEl) filesEl.innerText = '0';
      if (threatsEl) threatsEl.innerText = '0';

      if (promptEl) promptEl.hidden = false;
      if (metaText) metaText.innerText = 'No scans recorded yet';
    }

    await loadAiPredictions();
  } catch (err) {
    console.warn('[Summary] Could not fetch latest report:', err.message);
  }
}

// ============================================
// ============================================
// 3. ACTIONS TAB: 6 ACTION RUN CARDS
// ============================================

async function triggerActionRun(moduleKey) {
  const btn = document.getElementById(`btn-run-${moduleKey}`);
  if (!btn) return;

  btn.classList.remove('is-success');
  btn.classList.add('is-running');
  btn.disabled = true;
  btn.innerHTML = '<span class="progress-ring" aria-hidden="true"></span><span class="btn-run-label">Running…</span>';

  try {
    let endpoint = '';
    let method = 'POST';
    let body = null;

    if (moduleKey === 'fullscan') endpoint = '/api/orchestrator/start';
    else if (moduleKey === 'drivers') endpoint = '/api/drivers/scan';
    else if (moduleKey === 'scanhw') endpoint = '/api/hardware/scan';
    else if (moduleKey === 'cleanup') {
      endpoint = '/api/cleanup/execute';
      body = JSON.stringify({ includeRecycleBin: false, runVolumeOptimization: true });
    } else if (moduleKey === 'network') endpoint = '/api/network/optimize';
    else if (moduleKey === 'threat') {
      endpoint = '/api/threat/scan';
      body = JSON.stringify({ scanType: 'QuickScan' });
    }

    const options = { method };
    if (body) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = body;
    }

    const res = await fetch(`${AGENT_URL}${endpoint}`, options);
    const data = await res.json();

    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    actionModulesState[moduleKey].lastRun = timestampStr;
    actionModulesState[moduleKey].status = (data.result && data.result.overallStatus) || (data.success ? 'PASS' : 'WARNING');

    updateActionCardUI(moduleKey);

    if (moduleKey === 'fullscan') {
      loadSummaryData();
    }

    btn.classList.remove('is-running');
    btn.classList.add('is-success');
    btn.innerHTML = '<span class="progress-ring" aria-hidden="true"></span><span class="btn-run-label">Done</span>';
    showInfoModal('Module complete', `Successfully completed ${moduleKey.replace(/_/g, ' ')} routine.`);
  } catch (err) {
    actionModulesState[moduleKey].status = 'FAIL';
    updateActionCardUI(moduleKey);
    btn.classList.remove('is-running');
    btn.innerHTML = '<span class="btn-run-label">Retry</span>';
    showInfoModal('Action error', `Failed to run ${moduleKey}: ${err.message}`);
  } finally {
    setTimeout(() => {
      btn.classList.remove('is-success', 'is-running');
      btn.innerHTML = '<span class="btn-run-label">Run</span>';
      btn.disabled = false;
    }, 1400);
  }
}

function updateActionCardUI(moduleKey) {
  const state = actionModulesState[moduleKey];
  const lastRunEl = document.getElementById(`last-run-${moduleKey}`);
  const badgeEl = document.getElementById(`badge-act-${moduleKey}`);

  if (lastRunEl && state.lastRun) {
    lastRunEl.innerText = `Last run: ${state.lastRun}`;
  }
  if (badgeEl) {
    badgeEl.innerText = state.status;
    badgeEl.className = `badge-status badge-${state.status}`;
  }
}

// ============================================
// 4. SCAN HARDWARE: 2x2 LIVE TELEMETRY GRID
// ============================================

function startLiveTelemetryPolling() {
  fetchLiveHardwareTelemetry();
  if (!liveTelemetryTimer) {
    liveTelemetryTimer = setInterval(fetchLiveHardwareTelemetry, 2500);
  }
}

function stopLiveTelemetryPolling() {
  if (liveTelemetryTimer) {
    clearInterval(liveTelemetryTimer);
    liveTelemetryTimer = null;
  }
}

async function fetchLiveHardwareTelemetry() {
  try {
    const res = await fetch(`${AGENT_URL}/api/status`);
    const data = await res.json();
    if (!data || !data.diagnostics) return;

    liveDiagnosticsCache = data.diagnostics;
    renderLiveTelemetryGrid(data.diagnostics, data.evaluation);
  } catch (err) {
    console.warn('[Telemetry] Polling error:', err.message);
  }
}

function renderLiveTelemetryGrid(diag, evalData) {
  const cpu = diag.cpu || {};
  const sys = diag.system || {};
  const mem = diag.memory || {};
  const storage = diag.storage || {};
  const battery = diag.battery || {};

  const sTag = document.getElementById('header-service-tag');
  if (sTag && sys.hostname) {
    sTag.innerText = sys.hostname;
  }

  // 1. PROCESSOR CARD
  const cpuLoad = typeof cpu.loadPercent === 'number' ? cpu.loadPercent : 0;
  const cpuTemp = typeof cpu.temperatureC === 'number' ? cpu.temperatureC : null;

  const telValCpu = document.getElementById('tel-val-cpu');
  const telBadgeCpu = document.getElementById('tel-badge-cpu');
  const telBarCpu = document.getElementById('tel-bar-cpu');
  const telSubCpu = document.getElementById('tel-sub-cpu');

  // Helper for telemetry bar styling
  function getBarGradient(val, warnThresh, critThresh) {
    if (val >= critThresh) return 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)';
    if (val >= warnThresh) return 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)';
    return 'linear-gradient(90deg, #0bbca8 0%, #13a3af 100%)';
  }

  if (telValCpu) telValCpu.innerText = `${cpuLoad}%`;
  if (telBadgeCpu) {
    telBadgeCpu.innerText = cpuTemp !== null ? `${cpuTemp}°C` : 'Active';
    telBadgeCpu.style.color = cpuTemp !== null && cpuTemp >= THRESHOLDS.CPU_TEMP.CRITICAL ? '#dc2626' : (cpuTemp !== null && cpuTemp >= THRESHOLDS.CPU_TEMP.WARNING ? '#d97706' : '#13a3af');
  }
  if (telBarCpu) {
    telBarCpu.style.width = `${Math.min(cpuLoad, 100)}%`;
    telBarCpu.style.background = getBarGradient(cpuLoad, THRESHOLDS.CPU_LOAD.WARNING, THRESHOLDS.CPU_LOAD.CRITICAL);
  }
  if (telSubCpu) {
    const cores = sys.cpuCores || cpu.cores || 4;
    const threads = sys.cpuThreads || cpu.threads || cores;
    telSubCpu.innerText = `${cores} cores, ${threads} logical processors · Operating at ${cpuTemp !== null ? cpuTemp + '°C' : 'normal thermal profile'}`;
  }

  // 2. INSTALLED MEMORY CARD
  const ramUsed = typeof mem.usedPercent === 'number' ? mem.usedPercent : 0;
  const telValRam = document.getElementById('tel-val-ram');
  const telBadgeRam = document.getElementById('tel-badge-ram');
  const telBarRam = document.getElementById('tel-bar-ram');
  const telSubRam = document.getElementById('tel-sub-ram');

  if (telValRam) telValRam.innerText = `${ramUsed}%`;
  if (telBadgeRam) {
    telBadgeRam.innerText = `${mem.totalGB || 8.0} GB RAM`;
  }
  if (telBarRam) {
    telBarRam.style.width = `${Math.min(ramUsed, 100)}%`;
    telBarRam.style.background = getBarGradient(ramUsed, THRESHOLDS.RAM_USAGE.WARNING, THRESHOLDS.RAM_USAGE.CRITICAL);
  }
  if (telSubRam) {
    telSubRam.innerText = `${mem.usedGB || 0} GB used of ${mem.totalGB || 8.0} GB total`;
  }

  // 3. PRIMARY STORAGE CARD
  const storageUsed = typeof storage.usedPercent === 'number' ? storage.usedPercent : 0;
  const telValStorage = document.getElementById('tel-val-storage');
  const telBadgeStorage = document.getElementById('tel-badge-storage');
  const telBarStorage = document.getElementById('tel-bar-storage');
  const telSubStorage = document.getElementById('tel-sub-storage');

  if (telValStorage) telValStorage.innerText = `${storageUsed}%`;
  if (telBadgeStorage) {
    telBadgeStorage.innerText = storage.smartStatus === 'PASSED' ? 'SMART Passed' : (storage.smartStatus || 'SMART Health OK');
  }
  if (telBarStorage) {
    telBarStorage.style.width = `${Math.min(storageUsed, 100)}%`;
    telBarStorage.style.background = getBarGradient(storageUsed, THRESHOLDS.STORAGE_USAGE.WARNING, THRESHOLDS.STORAGE_USAGE.CRITICAL);
  }
  if (telSubStorage) {
    const driveType = storage.driveType || 'SSD';
    telSubStorage.innerText = `${storage.freeGB || 0} GB free of ${storage.totalGB || 0} GB (${driveType})`;
  }

  // 4. POWER SUPPLY (PSU) CARD
  const telValPower = document.getElementById('tel-val-power');
  const telBadgePower = document.getElementById('tel-badge-power');
  const telBarPower = document.getElementById('tel-bar-power');
  const telSubPower = document.getElementById('tel-sub-power');

  if (battery.hasBattery) {
    const pct = battery.currentPercent || 100;
    if (telValPower) telValPower.innerText = `${pct}%`;
    if (telBadgePower) telBadgePower.innerText = 'On Battery';
    if (telBarPower) {
      telBarPower.style.width = `${pct}%`;
      telBarPower.style.background = pct < 20 ? 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(90deg, #0bbca8 0%, #13a3af 100%)';
    }
    if (telSubPower) telSubPower.innerText = `Battery power active · Health rating: ${battery.healthPercent || 100}%`;
  } else {
    if (telValPower) telValPower.innerText = 'AC Mains';
    if (telBadgePower) telBadgePower.innerText = 'AC Power';
    if (telBarPower) {
      telBarPower.style.width = '100%';
      telBarPower.style.background = 'linear-gradient(90deg, #0bbca8 0%, #13a3af 100%)';
    }
    if (telSubPower) telSubPower.innerText = 'Connected to AC mains (Desktop / All-In-One)';
  }
}

// ============================================
// 5. DETAIL PAGES: DRIVERS, CLEANUP, NETWORK, THREAT
// ============================================

async function loadDriversPage() {
  const tbody = document.getElementById('page-drivers-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Scanning Plug-and-Play drivers and matching against Avantis catalog...</td></tr>';

  try {
    const res = await fetch(`${AGENT_URL}/api/drivers/scan`, { method: 'POST' });
    const data = await res.json();
    const drivers = (data.result && data.result.drivers) || [];

    if (drivers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">All installed hardware drivers are verified and up to date.</td></tr>';
      return;
    }

    tbody.innerHTML = drivers.map((d, i) => `
      <tr>
        <td><strong>${d.component}</strong></td>
        <td>${d.deviceName}</td>
        <td><code>${d.currentVersion}</code></td>
        <td><code>${d.latestVersion}</code></td>
        <td><span class="badge-status ${d.status === 'UP_TO_DATE' ? 'badge-PASS' : 'badge-WARNING'}">${d.status}</span></td>
        <td>
          ${d.status === 'OUTDATED'
            ? `<button class="btn-primary btn-sm" onclick="executeDriverUpdates()">Update</button>`
            : `<span class="badge-status badge-PASS">Verified</span>`}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-error">Error scanning drivers: ${err.message}</td></tr>`;
  }
}

async function executeDriverUpdates() {
  const btn = document.getElementById('btn-page-update-drivers');
  if (btn) {
    btn.innerText = 'Updating Drivers...';
    btn.disabled = true;
  }

  try {
    const res = await fetch(`${AGENT_URL}/api/drivers/update-all`, { method: 'POST' });
    const data = await res.json();
    showInfoModal('Driver Updates', data.result ? data.result.summaryMessage : 'Driver catalog updated.');
    loadDriversPage();
  } catch (err) {
    showInfoModal('Driver Update Error', err.message);
  } finally {
    if (btn) {
      btn.innerText = 'Update Outdated Drivers';
      btn.disabled = false;
    }
  }
}

async function loadCleanupPage() {
  const cont = document.getElementById('page-cleanup-breakdown');
  if (!cont) return;
  cont.innerHTML = '<div class="panel-soft skeleton">Analyzing volume storage and caches...</div>';

  try {
    const res = await fetch(`${AGENT_URL}/api/cleanup/scan`, { method: 'POST' });
    const data = await res.json();
    const r = data.result || {};

    cont.innerHTML = `
      <div class="panel-soft">
        <strong>Identified reclaimable storage:</strong> ${r.reclaimableMb || 0} MB across temporary files and staging caches.
      </div>
      ${(r.itemSummaries || []).map(item => `
        <div class="kv-row">
          <span>${item.path}</span>
          <strong>${item.sizeMb} MB (${item.fileCount} files)</strong>
        </div>
      `).join('')}
    `;
  } catch (err) {
    cont.innerHTML = `<div style="color:var(--status-critical);">${err.message}</div>`;
  }
}

async function executeCleanup() {
  const includeRecycle = !!document.getElementById('page-cleanup-chk-recycle')?.checked;
  try {
    const res = await fetch(`${AGENT_URL}/api/cleanup/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ includeRecycleBin: includeRecycle, runVolumeOptimization: true })
    });
    const data = await res.json();
    showInfoModal('System Cleanup Complete', data.result ? data.result.summaryMessage : 'Storage cleaned successfully.');
    loadCleanupPage();
  } catch (err) {
    showInfoModal('Cleanup Error', err.message);
  }
}

async function executeNetworkOptimization() {
  const resultsEl = document.getElementById('page-network-results');
  if (resultsEl) resultsEl.innerHTML = '<div class="panel-soft skeleton">Flushing DNS, resetting Winsock, and measuring network latency...</div>';

  try {
    const res = await fetch(`${AGENT_URL}/api/network/optimize`, { method: 'POST' });
    const data = await res.json();
    const r = data.result || {};

    if (resultsEl && r.before && r.after) {
      resultsEl.innerHTML = `
        <table class="detail-table" style="margin-bottom:12px;">
          <thead>
            <tr>
              <th>Target</th>
              <th>Before Latency / Loss</th>
              <th>After Latency / Loss</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Default Gateway</strong></td>
              <td>${r.before.gatewayLatencyMs} ms (${r.before.gatewayPacketLossPercent}% loss)</td>
              <td style="color:var(--status-healthy); font-weight:700;">${r.after.gatewayLatencyMs} ms (${r.after.gatewayPacketLossPercent}% loss)</td>
              <td><span class="badge-status badge-PASS">Verified</span></td>
            </tr>
            <tr>
              <td><strong>DNS Root (8.8.8.8)</strong></td>
              <td>${r.before.dnsLatencyMs} ms (${r.before.dnsPacketLossPercent}% loss)</td>
              <td style="color:var(--status-healthy); font-weight:700;">${r.after.dnsLatencyMs} ms (${r.after.dnsPacketLossPercent}% loss)</td>
              <td><span class="badge-status badge-PASS">Verified</span></td>
            </tr>
          </tbody>
        </table>
        ${r.rebootRequired ? '<div style="padding:10px 14px; background:#fffbeb; border:1px solid #fed7aa; border-radius:8px; font-size:12px; color:#92400e; margin-top:8px;">[Restart Recommended] Winsock catalog reset requires a system restart to fully apply socket bindings.</div>' : ''}
      `;
    }
  } catch (err) {
    showInfoModal('Network Error', err.message);
  }
}

async function loadThreatPage() {
  const card = document.getElementById('page-threat-status-card');
  if (!card) return;

  try {
    const res = await fetch(`${AGENT_URL}/api/threat/status`);
    const data = await res.json();
    const s = data.status || {};

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <strong>Antivirus Engine:</strong>
        <span style="color:var(--status-healthy); font-weight:700;">${s.engine || 'Microsoft Defender'}</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <span>Real-Time Threat Protection:</span>
        <span class="badge-status ${s.realTimeProtection ? 'badge-PASS' : 'badge-CRITICAL'}">${s.realTimeProtection ? 'Active' : 'Disabled'}</span>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span>Signature Age:</span>
        <span>${s.signatureAgeDays === 0 ? 'Up to date (Today)' : `${s.signatureAgeDays} day(s) old`}</span>
      </div>
    `;
  } catch (err) {
    card.innerText = 'Could not communicate with threat scanner service.';
  }
}

async function executeThreatScan() {
  const listEl = document.getElementById('page-threat-detections-list');
  if (listEl) listEl.innerHTML = '<div style="padding:14px; text-align:center; color:var(--text-muted);">Updating virus definitions and executing Windows Defender scan...</div>';

  try {
    const res = await fetch(`${AGENT_URL}/api/threat/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanType: 'QuickScan' })
    });
    const data = await res.json();
    const r = data.result || {};

    if (listEl) {
      if (r.threats && r.threats.length > 0) {
        listEl.innerHTML = r.threats.map(t => `
          <div style="padding:12px; background:#fef2f2; border:1px solid #fca5a5; border-radius:8px; margin-bottom:8px;">
            <strong>[Threat Detected] ${t.threatName} (Severity ${t.severityId})</strong>
            <div style="font-size:11.5px; color:#7f1d1d;">Location: ${t.filePath}</div>
            <div style="font-size:11.5px; color:#b91c1c;">Action Taken: <strong>${t.actionTaken}</strong></div>
          </div>
        `).join('');
      } else {
        listEl.innerHTML = `
          <div style="padding:14px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; color:#166534; font-size:13px; font-weight:600;">
            Windows Defender threat scan complete: Zero malware, rootkits, or active threats detected (${r.durationSeconds || 0}s duration).
          </div>
        `;
      }
    }
  } catch (err) {
    showInfoModal('Threat Scan Error', err.message);
  }
}

// ============================================
// 6. AUXILIARY PAGES: SUPPORT, HISTORY
// ============================================

async function handleSupportSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('supp-name')?.value;
  const email = document.getElementById('supp-email')?.value;
  const priority = document.getElementById('supp-priority')?.value;
  const issue = document.getElementById('supp-issue')?.value;

  try {
    const res = await fetch(`${AGENT_URL}/api/support/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: name, customerEmail: email, priority, issueDescription: issue })
    });
    const data = await res.json();
    showInfoModal('Support Ticket Submitted', `Ticket ${data.ticket ? data.ticket.id : 'AVT-TCK'} successfully submitted to Avantis Support Team.`);
    e.target.reset();
  } catch (err) {
    showInfoModal('Submission Error', err.message);
  }
}

async function loadHistoryPage() {
  const cont = document.getElementById('page-history-list');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:14px; color:var(--text-muted);">Loading audit report history...</div>';

  try {
    const res = await fetch(`${AGENT_URL}/api/reports`);
    const data = await res.json();
    const reports = data.reports || [];

    if (reports.length === 0) {
      cont.innerHTML = '<div style="padding:14px; color:var(--text-muted);">No audit records found.</div>';
      return;
    }

    cont.innerHTML = reports.map(r => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 18px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:10px;">
        <div>
          <strong>${r.hostname}</strong> · <span style="font-size:12px; color:var(--text-muted);">${new Date(r.generatedAt).toLocaleString()}</span>
          <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">${r.summary ? r.summary.summaryText : 'Automated Scan'}</div>
        </div>
        <span class="badge-status ${r.overallStatus === 'PASS' ? 'badge-PASS' : 'badge-WARNING'}">${r.overallStatus}</span>
      </div>
    `).join('');
  } catch (err) {
    cont.innerHTML = `<div style="color:var(--status-critical);">${err.message}</div>`;
  }
}

// ============================================
// 7. AVANTIS ASSISTANT FLOATING WIDGET
// ============================================

let chatMessages = [];
let isChatOpen = false;

function initAssistantChat() {
  if (chatMessages.length === 0) {
    chatMessages.push({
      sender: 'assistant',
      text: "Hello! I'm Avantis Assist. How can I help you today?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  }
  renderChatMessages();
}

function toggleAssistantChat(e) {
  if (e) e.stopPropagation();
  const panel = document.getElementById('assistant-chat-panel');
  if (!panel) return;

  isChatOpen = !panel.classList.contains('is-open');
  if (isChatOpen) {
    initAssistantChat();
    panel.classList.add('is-open');
    setTimeout(() => {
      const input = document.getElementById('chat-input-field');
      if (input) input.focus();
    }, 150);
  } else {
    panel.classList.remove('is-open');
  }
}

document.addEventListener('click', (e) => {
  const container = document.getElementById('assistant-widget-container');
  const panel = document.getElementById('assistant-chat-panel');
  if (container && panel && isChatOpen && !container.contains(e.target)) {
    panel.classList.remove('is-open');
    isChatOpen = false;
  }
});

function formatChatMessageContent(rawText) {
  if (!rawText) return '';
  
  // Escape basic HTML entities
  let text = rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert bold: **text** -> <strong>text</strong>
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Convert inline code: `code` -> <code>code</code>
  text = text.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.06); padding:2px 5px; font-family:monospace; font-size:12px;">$1</code>');

  // Convert markdown headers: ### Header or ## Header -> bold section header
  text = text.replace(/^#{1,4}\s*(.*?)$/gm, '<div style="font-weight:700; color:var(--text-main); margin-top:8px; margin-bottom:4px;">$1</div>');

  // Convert bullet points: * Item or - Item -> clean bullet div
  text = text.replace(/^[\*\-]\s+(.*?)$/gm, '<div style="display:flex; gap:6px; margin:3px 0 3px 6px;"><span>•</span><span>$1</span></div>');

  // Convert numbered lists: 1. Item -> clean numbered div
  text = text.replace(/^(\d+)\.\s+(.*?)$/gm, '<div style="display:flex; gap:6px; margin:3px 0 3px 6px;"><span style="font-weight:600;">$1.</span><span>$2</span></div>');

  // Convert newlines to paragraph breaks
  text = text.replace(/\n\n+/g, '<div style="height:8px;"></div>').replace(/\n/g, '<br>');

  return text;
}

function renderChatMessages() {
  const container = document.getElementById('chat-messages-list');
  if (!container) return;

  container.innerHTML = chatMessages.map(msg => `
    <div class="chat-message-row ${msg.sender}">
      <div class="chat-bubble ${msg.isTyping ? 'typing-bubble' : ''}">
        ${msg.isTyping ? '<span class="typing-dots">Thinking...</span>' : formatChatMessageContent(msg.text)}
      </div>
    </div>
  `).join('');

  const body = document.getElementById('chat-messages-container');
  if (body) body.scrollTop = body.scrollHeight;
}

function autoResizeChatInput() {
  const textarea = document.getElementById('chat-input-field');
  if (!textarea) return;
  textarea.style.height = 'auto';
  const newHeight = Math.min(textarea.scrollHeight, 200);
  textarea.style.height = newHeight + 'px';
  textarea.style.overflowY = textarea.scrollHeight > 200 ? 'auto' : 'hidden';
}

async function handleChatSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const textarea = document.getElementById('chat-input-field');
  const sendBtn = document.getElementById('chat-send-btn');
  if (!textarea) return;

  const text = textarea.value.trim();
  if (!text) return;

  textarea.value = '';
  autoResizeChatInput();
  if (sendBtn) sendBtn.disabled = true;

  chatMessages.push({
    sender: 'user',
    text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });

  // Add temporary typing indicator
  const typingMsgId = 'typing-' + Date.now();
  chatMessages.push({
    id: typingMsgId,
    sender: 'assistant',
    text: 'Thinking...',
    isTyping: true,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  renderChatMessages();

  try {
    const res = await fetch(`${AGENT_URL}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text })
    });
    const data = await res.json();
    
    // Remove typing bubble
    chatMessages = chatMessages.filter(m => m.id !== typingMsgId);
    
    const replyText = (data && data.success && data.answer) 
      ? data.answer 
      : generateAssistantFallbackReply(text);

    chatMessages.push({
      sender: 'assistant',
      text: replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    renderChatMessages();
  } catch (err) {
    chatMessages = chatMessages.filter(m => m.id !== typingMsgId);
    chatMessages.push({
      sender: 'assistant',
      text: generateAssistantFallbackReply(text),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    renderChatMessages();
  }
}

function generateAssistantFallbackReply(query) {
  const q = query.toLowerCase();
  const d = liveDiagnosticsCache;

  if (q.includes('cpu') || q.includes('processor') || q.includes('temp')) {
    if (d && d.cpu) {
      return `Processor: ${d.system ? d.system.cpuModel : 'Intel Core / AMD Ryzen'}. Current load is ${d.cpu.loadPercent}%. Temperature: ${d.cpu.temperatureC !== null ? d.cpu.temperatureC + '°C' : 'Normal'}.`;
    }
  }

  if (q.includes('ram') || q.includes('memory')) {
    if (d && d.memory) {
      return `Memory: ${d.memory.totalGB} GB installed. Currently using ${d.memory.usedGB} GB (${d.memory.usedPercent}% utilization).`;
    }
  }

  if (q.includes('storage') || q.includes('disk') || q.includes('space')) {
    if (d && d.storage) {
      return `Primary Storage: ${d.storage.freeGB} GB free out of ${d.storage.totalGB} GB (${d.storage.driveType || 'SSD'}). SMART Status: ${d.storage.smartStatus}.`;
    }
  }

  if (q.includes('battery') || q.includes('power')) {
    if (d && d.battery && d.battery.hasBattery) {
      return `Battery charge: ${d.battery.currentPercent}%. Health: ${d.battery.healthPercent}%. Mode: ${d.battery.statusMessage}.`;
    }
    return 'This system is operating on direct AC mains power supply (Desktop / All-In-One).';
  }

  return `I am Avantis PC Assist. All telemetry is actively monitored. You can inspect live sensors under "Scan Hardware" or run automated maintenance under "Actions".`;
}

// AI Predictive Monitoring: Proactive banners with One-Click Resolution
async function loadAiPredictions() {
  const container = document.getElementById('summary-ai-predictions');
  if (!container) return;

  try {
    const res = await fetch(`${AGENT_URL}/api/ai/predictions`);
    const data = await res.json();
    const predictions = data.predictions || [];

    if (predictions.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = predictions.map(p => `
      <div style="background:#ffffff; border:1px solid ${p.urgency === 'high' ? 'var(--status-critical-border)' : 'var(--status-warning-border)'}; border-left:4px solid ${p.urgency === 'high' ? 'var(--status-critical)' : 'var(--status-warning)'}; border-radius:14px; padding:16px 20px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; box-shadow:var(--shadow-sm);">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <span class="badge-status ${p.urgency === 'high' ? 'badge-CRITICAL' : 'badge-WARNING'}">AI Predictive Care · ${p.urgency.toUpperCase()}</span>
            <span style="font-size:11.5px; color:var(--text-muted);">${new Date(p.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <p style="font-size:13px; color:var(--text-main); font-weight:600;">${p.explanation}</p>
        </div>
        ${p.recommendedAction && p.recommendedAction !== 'no_action_needed' ? `
          <button type="button" class="btn-primary" style="padding:7px 16px; font-size:12.5px; white-space:nowrap; margin-left:16px; border-radius:8px;" onclick="resolveAiPrediction('${p.recommendedAction}', '${p.id}')">
            Resolve Now
          </button>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.warn('[AI Predictions] Could not load predictions:', err.message);
  }
}

async function resolveAiPrediction(actionKey, predictionId) {
  showInfoModal('Executing AI Resolution', `Starting recommended action [${actionKey}]...`);
  try {
    const res = await fetch(`${AGENT_URL}/api/ai/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: actionKey, predictionId })
    });
    const data = await res.json();
    showInfoModal('Resolution Completed', data.result?.summaryMessage || 'Recommended action successfully applied.');
    loadSummaryData();
    loadAiPredictions();
  } catch (err) {
    showInfoModal('Resolution Error', err.message);
  }
}

// ============================================
// 8. MODALS & UTILITIES
// ============================================

function showInfoModal(title, msg) {
  const modal = document.getElementById('info-modal');
  const titleEl = document.getElementById('info-modal-title');
  const msgEl = document.getElementById('info-modal-msg');

  if (titleEl) titleEl.innerText = title;
  if (msgEl) msgEl.innerText = msg;
  if (modal) modal.style.display = 'flex';
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}

function toggleLanguageMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('lang-dropdown-menu');
  if (menu) {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }
}

function setLanguage(lang) {
  const label = document.getElementById('current-lang-label');
  const labels = {
    en: 'English (US)',
    sn: 'ChiShona (ZW)',
    nd: 'isiNdebele (ZW)',
    fr: 'Français',
    pt: 'Português'
  };
  if (label && labels[lang]) label.innerText = labels[lang];
  const menu = document.getElementById('lang-dropdown-menu');
  if (menu) menu.style.display = 'none';
}

document.addEventListener('click', () => {
  const menu = document.getElementById('lang-dropdown-menu');
  if (menu) menu.style.display = 'none';
});

// Auto-expanding chat textarea (Claude/Gemini behavior)
const chatInputEl = document.getElementById('chat-input-field');
const chatSendBtnEl = document.getElementById('chat-send-btn');

if (chatInputEl && chatSendBtnEl) {
  chatInputEl.addEventListener('input', () => {
    autoResizeChatInput();
    chatSendBtnEl.disabled = chatInputEl.value.trim().length === 0;
  });

  chatInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!chatSendBtnEl.disabled) handleChatSubmit(e);
    }
  });
}

// Initial Bootstrap on load
loadSummaryData();
fetchLiveHardwareTelemetry();
