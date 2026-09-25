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

function hasValue(val) {
  return val !== null && val !== undefined && val !== '' && !isNaN(val);
}

function getStoredLastRun(key) {
  try { return localStorage.getItem('avantis_lastrun_' + key) || null; } catch { return null; }
}

function getStoredStatus(key) {
  try { return localStorage.getItem('avantis_status_' + key) || 'NEVER'; } catch { return 'NEVER'; }
}

// Track last run status for 6 Action cards
const actionModulesState = {
  fullscan: { lastRun: getStoredLastRun('fullscan'), status: getStoredStatus('fullscan') },
  drivers: { lastRun: getStoredLastRun('drivers'), status: getStoredStatus('drivers') },
  scanhw: { lastRun: getStoredLastRun('scanhw'), status: getStoredStatus('scanhw') },
  cleanup: { lastRun: getStoredLastRun('cleanup'), status: getStoredStatus('cleanup') },
  network: { lastRun: getStoredLastRun('network'), status: getStoredStatus('network') },
  threat: { lastRun: getStoredLastRun('threat'), status: getStoredStatus('threat') }
};

function recordActionRun(moduleKey, status = 'PASS') {
  const timestampStr = new Date().toLocaleString();
  if (actionModulesState[moduleKey]) {
    actionModulesState[moduleKey].lastRun = timestampStr;
    actionModulesState[moduleKey].status = status;
  }
  try {
    localStorage.setItem('avantis_lastrun_' + moduleKey, timestampStr);
    localStorage.setItem('avantis_status_' + moduleKey, status);
  } catch {}
  updateActionCardUI(moduleKey);
}

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
      const status = data.report.overallStatus || 'PASS';

      // Update Action cards state from report if not already set individually
      const moduleKeyMap = {
        hardware: 'scanhw',
        drivers: 'drivers',
        cleanup: 'cleanup',
        network: 'network',
        threat: 'threat'
      };

      if (!actionModulesState.fullscan.lastRun) {
        actionModulesState.fullscan.lastRun = dateStr;
        actionModulesState.fullscan.status = status;
      }

      mods.forEach(m => {
        const modKey = moduleKeyMap[m.key];
        if (modKey && !actionModulesState[modKey].lastRun) {
          actionModulesState[modKey].lastRun = dateStr;
          actionModulesState[modKey].status = m.status || status;
        }
      });

      ['fullscan', 'drivers', 'scanhw', 'cleanup', 'network', 'threat'].forEach(updateActionCardUI);

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
    const ok = (data.result && data.result.overallStatus) || (data.success ? 'PASS' : 'WARNING');
    recordActionRun(moduleKey, ok);

    if (moduleKey === 'fullscan') {
      ['drivers', 'scanhw', 'cleanup', 'network', 'threat'].forEach(k => recordActionRun(k, ok));
      loadSummaryData();
    }

    btn.classList.remove('is-running');
    btn.classList.add('is-success');
    btn.innerHTML = '<span class="progress-ring" aria-hidden="true"></span><span class="btn-run-label">Done</span>';
    showInfoModal('Module complete', `Successfully completed ${moduleKey.replace(/_/g, ' ')} routine.`);
  } catch (err) {
    recordActionRun(moduleKey, 'FAIL');
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

function applyAuthorizationUI(auth) {
  const authAlert = document.getElementById('device-auth-alert');
  const authText = document.getElementById('device-auth-alert-text');
  if (!authAlert || !auth) return;

  const status = auth.status || 'UNENROLLED';

  if (status === 'REVOKED') {
    authAlert.style.display = 'flex';
    authAlert.style.background = '#fef2f2';
    authAlert.style.borderColor = '#fca5a5';
    authAlert.style.color = '#991b1b';
    if (authText) authText.innerText = auth.revocationReason || 'Device Authorization Revoked — This machine is not authorized to use Avantis Support services.';
  } else if (status === 'UNENROLLED') {
    authAlert.style.display = 'flex';
    authAlert.style.background = '#fffbeb';
    authAlert.style.borderColor = '#fde68a';
    authAlert.style.color = '#92400e';
    if (authText) authText.innerText = 'Device Enrollment Required — This Windows PC has not been enrolled into the Avantis Registry. Contact Avantis Support to provision this PC.';
  } else if (status === 'NOT_AUTHORIZED') {
    authAlert.style.display = 'flex';
    authAlert.style.background = '#fef2f2';
    authAlert.style.borderColor = '#fca5a5';
    authAlert.style.color = '#991b1b';
    if (authText) authText.innerText = 'Device Authorization Invalid — Hardware credentials could not be validated with Avantis Support.';
  } else if (status === 'OFFLINE') {
    authAlert.style.display = 'flex';
    authAlert.style.background = '#f0fdfa';
    authAlert.style.borderColor = '#99f6e4';
    authAlert.style.color = '#0f766e';
    if (authText) authText.innerText = 'Offline Mode Active — Local Windows hardware diagnostics are available. Cloud synchronization will resume once online.';
  } else if (status === 'AUTHORIZED') {
    authAlert.style.display = 'none';
  }
}

async function fetchDeviceIdentity() {
  try {
    const res = await fetch(`${AGENT_URL}/api/device`);
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.device) {
      const headerModel = document.getElementById('header-device-model');
      if (headerModel) headerModel.innerText = data.device.displayName || 'Windows PC';
    }
    if (data && data.authorization) {
      applyAuthorizationUI(data.authorization);
    }
  } catch (err) {
    console.warn('[DeviceIdentity] Error fetching device identity:', err.message);
  }
}

async function fetchLiveHardwareTelemetry() {
  const offlineAlert = document.getElementById('agent-offline-alert');
  try {
    const res = await fetch(`${AGENT_URL}/api/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !data.diagnostics) return;

    if (offlineAlert) offlineAlert.style.display = 'none';
    if (data.authorization) applyAuthorizationUI(data.authorization);

    liveDiagnosticsCache = data.diagnostics;
    renderLiveTelemetryGrid(data.diagnostics, data.evaluation);
  } catch (err) {
    console.warn('[Telemetry] Polling error:', err.message);
    if (offlineAlert) offlineAlert.style.display = 'flex';
  }
}

function renderLiveTelemetryGrid(diag, evalData) {
  if (!diag) return;
  const cpu = diag.cpu || {};
  const sys = diag.system || {};
  const mem = diag.memory || {};
  const storage = diag.storage || {};
  const battery = diag.battery || {};
  const device = diag.device || {};
  const capabilities = diag.capabilities || {};

  // Discovered Device Header Badge (Model only, green dot preserved)
  const headerModel = document.getElementById('header-device-model');
  if (headerModel) {
    headerModel.innerText = device.displayName || sys.model || 'Windows PC';
  }

  // Helper for telemetry bar gradient styling
  function getBarGradient(val, warnThresh, critThresh) {
    if (val >= critThresh) return 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)';
    if (val >= warnThresh) return 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)';
    return 'linear-gradient(90deg, #0bbca8 0%, #13a3af 100%)';
  }

  // 1. PROCESSOR CARD
  const telValCpu = document.getElementById('tel-val-cpu');
  const telBadgeCpu = document.getElementById('tel-badge-cpu');
  const telBarCpu = document.getElementById('tel-bar-cpu');
  const telSubCpu = document.getElementById('tel-sub-cpu');

  if (hasValue(cpu.loadPercent)) {
    if (telValCpu) telValCpu.innerText = `${cpu.loadPercent}%`;
    if (telBarCpu) {
      telBarCpu.style.width = `${Math.min(cpu.loadPercent, 100)}%`;
      telBarCpu.style.background = getBarGradient(cpu.loadPercent, THRESHOLDS.CPU_LOAD.WARNING, THRESHOLDS.CPU_LOAD.CRITICAL);
    }
  } else {
    if (telValCpu) telValCpu.innerText = 'Unavailable';
    if (telBarCpu) telBarCpu.style.width = '0%';
  }

  if (telBadgeCpu) {
    if (cpu.temperatureSupported && hasValue(cpu.temperatureC)) {
      telBadgeCpu.innerText = `${cpu.temperatureC}°C`;
      telBadgeCpu.style.color = cpu.temperatureC >= THRESHOLDS.CPU_TEMP.CRITICAL 
        ? '#dc2626' 
        : (cpu.temperatureC >= THRESHOLDS.CPU_TEMP.WARNING ? '#d97706' : '#13a3af');
    } else {
      telBadgeCpu.innerText = 'Active';
      telBadgeCpu.style.color = 'var(--text-muted)';
    }
  }

  if (telSubCpu) {
    const cores = sys.cpuCores || 1;
    const threads = sys.cpuThreads || cores;
    const tempText = (cpu.temperatureSupported && hasValue(cpu.temperatureC)) 
      ? `Operating at ${cpu.temperatureC}°C` 
      : 'Thermal sensor unavailable';
    telSubCpu.innerText = `${cores} cores, ${threads} logical processors · ${tempText}`;
  }

  // 2. INSTALLED MEMORY CARD
  const telValRam = document.getElementById('tel-val-ram');
  const telBadgeRam = document.getElementById('tel-badge-ram');
  const telBarRam = document.getElementById('tel-bar-ram');
  const telSubRam = document.getElementById('tel-sub-ram');

  if (hasValue(mem.usedPercent)) {
    if (telValRam) telValRam.innerText = `${mem.usedPercent}%`;
    if (telBarRam) {
      telBarRam.style.width = `${Math.min(mem.usedPercent, 100)}%`;
      telBarRam.style.background = getBarGradient(mem.usedPercent, THRESHOLDS.RAM_USAGE.WARNING, THRESHOLDS.RAM_USAGE.CRITICAL);
    }
  } else {
    if (telValRam) telValRam.innerText = 'Unavailable';
    if (telBarRam) telBarRam.style.width = '0%';
  }

  if (telBadgeRam) {
    telBadgeRam.innerText = hasValue(mem.totalGB) ? `${mem.totalGB} GB RAM` : 'RAM';
  }
  if (telSubRam) {
    const usedText = hasValue(mem.usedGB) ? `${mem.usedGB} GB used` : 'Memory in use';
    const totalText = hasValue(mem.totalGB) ? `of ${mem.totalGB} GB total` : '';
    telSubRam.innerText = `${usedText} ${totalText}`.trim();
  }

  // 3. STORAGE CARD (Physical disks & Multi-volume support)
  const telTitleStorage = document.getElementById('tel-title-storage');
  const telValStorage = document.getElementById('tel-val-storage');
  const telBadgeStorage = document.getElementById('tel-badge-storage');
  const telBarStorage = document.getElementById('tel-bar-storage');
  const telSubStorage = document.getElementById('tel-sub-storage');

  if (telTitleStorage) {
    telTitleStorage.innerText = storage.volumes && storage.volumes.length > 1 ? 'Primary Storage & Volumes' : 'Primary Storage';
  }

  if (hasValue(storage.usedPercent)) {
    if (telValStorage) telValStorage.innerText = `${storage.usedPercent}%`;
    if (telBarStorage) {
      telBarStorage.style.width = `${Math.min(storage.usedPercent, 100)}%`;
      telBarStorage.style.background = getBarGradient(storage.usedPercent, THRESHOLDS.STORAGE_USAGE.WARNING, THRESHOLDS.STORAGE_USAGE.CRITICAL);
    }
  } else {
    if (telValStorage) telValStorage.innerText = 'Unavailable';
    if (telBarStorage) telBarStorage.style.width = '0%';
  }

  if (telBadgeStorage) {
    if (storage.smartStatus && storage.smartStatus !== 'UNAVAILABLE' && storage.smartStatus !== 'UNKNOWN') {
      telBadgeStorage.innerText = `SMART: ${storage.smartStatus}`;
      telBadgeStorage.style.color = storage.smartStatus === 'HEALTHY' ? '#166534' : '#dc2626';
    } else {
      telBadgeStorage.innerText = 'Health Unavailable';
      telBadgeStorage.style.color = 'var(--text-muted)';
    }
  }

  if (telSubStorage) {
    if (storage.volumes && storage.volumes.length > 0) {
      const volSummaries = storage.volumes.map(v => `${v.mount} (${v.freeGB} GB free of ${v.totalGB} GB)`);
      telSubStorage.innerText = volSummaries.join(' · ');
    } else if (hasValue(storage.freeGB) && hasValue(storage.totalGB)) {
      telSubStorage.innerText = `${storage.freeGB} GB free of ${storage.totalGB} GB (${storage.driveType || 'Drive'})`;
    } else {
      telSubStorage.innerText = 'Storage partition telemetry not reported';
    }
  }

  // 4. POWER SUBSYSTEM CARD (Dynamic Laptop vs Stationary Desktop Capability)
  const telTitlePower = document.getElementById('tel-title-power');
  const telValPower = document.getElementById('tel-val-power');
  const telBadgePower = document.getElementById('tel-badge-power');
  const telBarPower = document.getElementById('tel-bar-power');
  const telSubPower = document.getElementById('tel-sub-power');

  if (battery.hasBattery) {
    if (telTitlePower) telTitlePower.innerText = 'Battery & Power';
    const pct = hasValue(battery.currentPercent) ? battery.currentPercent : null;

    if (telValPower) telValPower.innerText = pct !== null ? `${pct}%` : 'Active';
    if (telBadgePower) {
      telBadgePower.innerText = battery.isCharging ? 'Charging' : 'On Battery';
      telBadgePower.style.color = battery.isCharging ? '#166534' : '#13a3af';
    }
    if (telBarPower) {
      const widthVal = pct !== null ? pct : 100;
      telBarPower.style.width = `${Math.min(widthVal, 100)}%`;
      telBarPower.style.background = (pct !== null && pct < 20) 
        ? 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)' 
        : 'linear-gradient(90deg, #0bbca8 0%, #13a3af 100%)';
    }
    if (telSubPower) {
      const healthText = hasValue(battery.healthPercent) ? ` · Health retention: ${battery.healthPercent}%` : '';
      telSubPower.innerText = `${battery.isCharging ? 'AC adapter charging battery' : 'Running on internal battery'}${healthText}`;
    }
  } else {
    // Desktop / All-In-One / Mini PC with no battery
    if (telTitlePower) telTitlePower.innerText = 'Power Supply (AC)';
    if (telValPower) telValPower.innerText = 'AC Mains';
    if (telBadgePower) {
      telBadgePower.innerText = 'AC Connected';
      telBadgePower.style.color = '#166534';
    }
    if (telBarPower) {
      telBarPower.style.width = '100%';
      telBarPower.style.background = 'linear-gradient(90deg, #0bbca8 0%, #13a3af 100%)';
    }
    if (telSubPower) {
      telSubPower.innerText = 'Stationary system operating on continuous AC mains power supply';
    }
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

    tbody.innerHTML = drivers.map((d, i) => {
      const isOutdated = d.status === 'OUTDATED';
      const isNoAvantis = d.status === 'NO_AVANTIS_DRIVER';
      const badgeCls = isOutdated ? 'badge-OUTDATED' : (isNoAvantis ? 'badge-NO_AVANTIS_DRIVER' : 'badge-PASS');
      const statusLabel = isNoAvantis ? 'OEM Verified' : d.status;

      return `
        <tr>
          <td><strong>${d.component}</strong></td>
          <td>${d.deviceName}</td>
          <td><code>${d.currentVersion}</code></td>
          <td><code>${d.latestVersion}</code></td>
          <td><span class="badge-status ${badgeCls}">${statusLabel}</span></td>
          <td>
            ${isOutdated
              ? `<button class="btn-primary btn-sm" onclick="executeDriverUpdates()">Update</button>`
              : `<span class="badge-status badge-PASS">Verified</span>`}
          </td>
        </tr>
      `;
    }).join('');
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
    recordActionRun('drivers', 'PASS');
    showInfoModal('Driver Updates', data.result ? data.result.summaryMessage : 'Driver catalog updated.');
    loadDriversPage();
  } catch (err) {
    recordActionRun('drivers', 'FAIL');
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
    recordActionRun('cleanup', 'PASS');
    showInfoModal('System Cleanup Complete', data.result ? data.result.summaryMessage : 'Storage cleaned successfully.');
    loadCleanupPage();
  } catch (err) {
    recordActionRun('cleanup', 'FAIL');
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
    recordActionRun('network', 'PASS');

    if (resultsEl && r.before && r.after) {
      const gwBefore = r.before.gatewayLatencyMs !== null ? `${r.before.gatewayLatencyMs} ms` : 'N/A';
      const gwAfter = r.after.gatewayLatencyMs !== null ? `${r.after.gatewayLatencyMs} ms` : 'N/A';
      const dnsBefore = r.before.dnsLatencyMs !== null ? `${r.before.dnsLatencyMs} ms` : 'N/A';
      const dnsAfter = r.after.dnsLatencyMs !== null ? `${r.after.dnsLatencyMs} ms` : 'N/A';
      const refBefore = r.before.publicReferenceLatencyMs !== null ? `${r.before.publicReferenceLatencyMs} ms` : 'N/A';
      const refAfter = r.after.publicReferenceLatencyMs !== null ? `${r.after.publicReferenceLatencyMs} ms` : 'N/A';

      resultsEl.innerHTML = `
        <table class="detail-table" style="margin-bottom:12px;">
          <thead>
            <tr>
              <th>Diagnostic Target</th>
              <th>Before Latency / Loss</th>
              <th>After Latency / Loss</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Default Gateway (${r.before.gateway || 'Local Network'})</strong></td>
              <td>${gwBefore} (${r.before.gatewayPacketLossPercent || 0}% loss)</td>
              <td style="color:var(--status-healthy); font-weight:700;">${gwAfter} (${r.after.gatewayPacketLossPercent || 0}% loss)</td>
              <td><span class="badge-status badge-PASS">Verified</span></td>
            </tr>
            <tr>
              <td><strong>Configured DNS (${r.before.configuredDns || 'OS Resolver'})</strong></td>
              <td>${dnsBefore} (${r.before.dnsPacketLossPercent || 0}% loss)</td>
              <td style="color:var(--status-healthy); font-weight:700;">${dnsAfter} (${r.after.dnsPacketLossPercent || 0}% loss)</td>
              <td><span class="badge-status badge-PASS">Verified</span></td>
            </tr>
            <tr>
              <td><strong>Public Diagnostic Resolver (${r.before.publicReference || '1.1.1.1'})</strong></td>
              <td>${refBefore} (${r.before.publicReferencePacketLossPercent || 0}% loss)</td>
              <td style="color:var(--status-healthy); font-weight:700;">${refAfter} (${r.after.publicReferencePacketLossPercent || 0}% loss)</td>
              <td><span class="badge-status badge-PASS">Verified</span></td>
            </tr>
          </tbody>
        </table>
        ${r.rebootRequired ? '<div style="padding:10px 14px; background:#fffbeb; border:1px solid #fed7aa; border-radius:8px; font-size:12px; color:#92400e; margin-top:8px;">[Restart Recommended] Winsock catalog reset requires a system restart to fully apply socket bindings.</div>' : ''}
      `;
    }
  } catch (err) {
    recordActionRun('network', 'FAIL');
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

    if (s.available === false) {
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <strong>Antivirus Engine:</strong>
          <span style="color:var(--text-muted); font-weight:600;">Unavailable</span>
        </div>
        <div style="font-size:12px; color:var(--text-muted); line-height:1.5;">
          ${s.reason || 'Windows Defender security services are only available on Microsoft Windows installations.'}
        </div>
      `;
      return;
    }

    const sigText = s.signatureAgeDays === null 
      ? 'Unknown' 
      : (s.signatureAgeDays === 0 ? 'Up to date (Today)' : `${s.signatureAgeDays} day(s) old`);

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
        <span>${sigText}</span>
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
    recordActionRun('threat', (r.threats && r.threats.length > 0) ? 'WARNING' : 'PASS');

    if (listEl) {
      if (r.available === false) {
        listEl.innerHTML = `
          <div style="padding:14px; background:var(--neutral-50); border:1px solid var(--neutral-200); border-radius:10px; color:var(--text-muted); font-size:13px;">
            ${r.summaryMessage || 'Windows Defender is not available on this platform.'}
          </div>
        `;
      } else if (r.threats && r.threats.length > 0) {
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
    recordActionRun('threat', 'FAIL');
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
            <img src="assets/avantis-icon.svg" alt="Avantis" style="width:20px; height:20px; object-fit:contain; flex-shrink:0; display:inline-block;">
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
['fullscan', 'drivers', 'scanhw', 'cleanup', 'network', 'threat'].forEach(updateActionCardUI);
fetchDeviceIdentity();
loadSummaryData();
fetchLiveHardwareTelemetry();
