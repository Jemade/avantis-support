const express = require('express');
const cors = require('cors');
const { execSync } = require('child_process');
const HardwareCollector = require('./diagnostics/hardware_collector');
const ThresholdEngine = require('./threshold/threshold_engine');
const CleanupEngine = require('./cleanup/cleanup_engine');
const NotificationManager = require('./notifications/notification_manager');
const HardwareScanner = require('./hardware/hardware_scanner');
const ThreatScanner = require('./threat/threat_scanner');
const DriverManager = require('./drivers/driver_manager');
const NetworkOptimizer = require('./network/network_optimizer');
const SystemScanOrchestrator = require('./orchestrator/system_scan_orchestrator');
const ReportStore = require('./reports/report_store');
const GeminiService = require('./ai/gemini_service');
const PredictiveMonitor = require('./ai/predictive_monitor');

const app = express();
app.use(cors());
app.use(express.json());

const collector = new HardwareCollector();
const thresholdEngine = new ThresholdEngine();
const cleanupEngine = new CleanupEngine();
const notificationManager = new NotificationManager();
const hardwareScanner = new HardwareScanner();
const threatScanner = new ThreatScanner();
const driverManager = new DriverManager();
const networkOptimizer = new NetworkOptimizer();
const orchestrator = new SystemScanOrchestrator();
const reportStore = new ReportStore();
const geminiService = new GeminiService();
const predictiveMonitor = new PredictiveMonitor(reportStore, geminiService, notificationManager);

const AGENT_PORT = 9140;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:9141';

let latestDiagnostics = null;
let latestEvaluation = null;
let lastSyncTime = null;
let lastBackendReportTime = 0;

async function refreshDiagnostics(forceLive = false) {
  try {
    latestDiagnostics = await collector.collectFullDiagnostics(forceLive);
    latestEvaluation = thresholdEngine.evaluate(latestDiagnostics);
    
    // Process native Windows notifications (fires on new warning/critical or escalation)
    notificationManager.processEvaluation(latestDiagnostics, latestEvaluation);

    // Rate-limit cloud backend reporting to every 30s or on forced scan, while local telemetry refreshes every 5s
    const now = Date.now();
    if (forceLive || (now - lastBackendReportTime >= 30000) || (latestEvaluation && latestEvaluation.status !== 'HEALTHY')) {
      lastBackendReportTime = now;
      await reportToBackend();
    }
  } catch (err) {
    console.error('[Agent] Diagnostic refresh error:', err.message);
  }
}

async function reportToBackend() {
  if (!latestDiagnostics || !latestEvaluation) return;

  const payload = {
    deviceId: latestDiagnostics.system.serialNumber,
    hostname: latestDiagnostics.system.hostname,
    model: latestDiagnostics.system.model,
    serialNumber: latestDiagnostics.system.serialNumber,
    osVersion: latestDiagnostics.system.osVersion,
    healthStatus: latestEvaluation.status,
    healthScore: latestEvaluation.score,
    cpuLoad: latestDiagnostics.cpu.loadPercent,
    cpuTemp: latestDiagnostics.cpu.temperatureC,
    ramUsedPercent: latestDiagnostics.memory.usedPercent,
    storageFreePercent: latestDiagnostics.storage.freePercent,
    storageSmartStatus: latestDiagnostics.storage.smartStatus,
    batteryHealthPercent: latestDiagnostics.battery.healthPercent,
    alerts: latestEvaluation.alerts,
    diagnostics: latestDiagnostics,
    timestamp: new Date().toISOString()
  };

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/telemetry/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      lastSyncTime = new Date().toISOString();
    }
  } catch {
    // Cloud backend offline or unreachable; agent operates standalone safely
  }
}

// ============================================
// IPC API ENDPOINTS
// ============================================

// 1. Live Telemetry Status & Scan
app.get('/api/status', async (req, res) => {
  if (!latestDiagnostics) {
    await refreshDiagnostics(true);
  }
  res.json({
    success: true,
    agentStatus: 'RUNNING',
    lastSyncTime,
    diagnostics: latestDiagnostics,
    evaluation: latestEvaluation
  });
});

app.post('/api/scan', async (req, res) => {
  await refreshDiagnostics(true);
  res.json({
    success: true,
    diagnostics: latestDiagnostics,
    evaluation: latestEvaluation
  });
});

// 2. Full System Scan (Orchestrator)
app.post('/api/orchestrator/start', async (req, res) => {
  const { includeRecycleBin = false } = req.body || {};
  const result = await orchestrator.runFullSystemScan({ includeRecycleBin });
  res.json(result);
});

app.get('/api/orchestrator/progress', (req, res) => {
  res.json({
    success: true,
    progress: orchestrator.getProgress()
  });
});

// 3. Update Drivers
app.get('/api/drivers/catalog', (req, res) => {
  res.json({ success: true, catalog: driverManager.catalog });
});

app.post('/api/drivers/scan', (req, res) => {
  const result = driverManager.scanDrivers();
  res.json({ success: true, result });
});

app.post('/api/drivers/update-all', (req, res) => {
  const result = driverManager.updateAllDrivers();
  res.json({ success: true, result });
});

app.post('/api/drivers/update-single', (req, res) => {
  const { driver } = req.body || {};
  if (!driver) return res.status(400).json({ success: false, message: 'Driver payload required.' });
  const result = driverManager.installDriver(driver);
  res.json({ success: true, result });
});

// 4. Scan Hardware (OS-level Telemetry)
app.post('/api/hardware/scan', (req, res) => {
  const result = hardwareScanner.scanAll();
  res.json({ success: true, result });
});

// 5. Clean Up Files
app.post('/api/cleanup/scan', (req, res) => {
  const scanResult = cleanupEngine.scanSystem();
  res.json({ success: true, result: scanResult });
});

app.post('/api/cleanup/execute', async (req, res) => {
  const { includeRecycleBin = false, runVolumeOptimization = true } = req.body || {};
  const cleanupResult = cleanupEngine.executeCleanup({ includeRecycleBin, runVolumeOptimization });
  await refreshDiagnostics(true);
  res.json({ success: true, result: cleanupResult });
});

// 6. Optimize Network
app.post('/api/network/optimize', (req, res) => {
  const result = networkOptimizer.optimize();
  res.json({ success: true, result });
});

// 7. Threat Scan (Windows Defender)
app.get('/api/threat/status', (req, res) => {
  const status = threatScanner.getDefenderStatus();
  res.json({ success: true, status });
});

app.post('/api/threat/scan', (req, res) => {
  const { scanType = 'QuickScan' } = req.body || {};
  const result = threatScanner.scan(scanType);
  res.json({ success: true, result });
});

app.post('/api/security/scan', (req, res) => {
  const { scanType = 'QuickScan' } = req.body || {};
  const result = threatScanner.scan(scanType);
  res.json({ success: true, result });
});

// 8. Audit Reports
app.get('/api/reports', (req, res) => {
  const reports = reportStore.listReports(100);
  res.json({ success: true, reports });
});

app.get('/api/reports/latest', (req, res) => {
  const reports = reportStore.listReports(1);
  if (!reports || reports.length === 0) {
    return res.json({ success: true, report: null });
  }
  const fullReport = reportStore.getReport(reports[0].filename);
  res.json({ success: true, report: fullReport });
});

app.get('/api/reports/:filename', (req, res) => {
  const report = reportStore.getReport(req.params.filename);
  if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
  res.json({ success: true, report });
});

// 9. Native Notifications & Support Tickets
app.get('/api/notifications/status', (req, res) => {
  res.json({ success: true, ...notificationManager.getStatus() });
});

app.post('/api/notifications/test', (req, res) => {
  const { component = 'cpu', severity = 'WARNING' } = req.body || {};
  const testAlerts = [{
    type: `${component.toUpperCase()}_TEST`,
    severity,
    title: `Avantis ${severity} Test Notification`,
    message: `This is a test notification for the ${component} component.`
  }];
  const summary = notificationManager.buildNotificationSummary(component, severity, testAlerts, latestDiagnostics || {});
  notificationManager.sendWindowsToast(summary);
  res.json({ success: true, message: 'Test notification triggered', summary });
});

// 8. AI Assistant & Predictive Monitoring Endpoints
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { question } = req.body || {};
    if (!question) return res.status(400).json({ success: false, message: 'Question required.' });

    const latestReport = reportStore.getLatestReport();
    const answer = await geminiService.askAssistant(question, latestReport, latestDiagnostics);
    res.json({ success: true, answer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/ai/predictions', (req, res) => {
  res.json({
    success: true,
    predictions: predictiveMonitor.getActivePredictions()
  });
});

app.post('/api/ai/predict/check', async (req, res) => {
  await predictiveMonitor.checkTrends();
  res.json({
    success: true,
    predictions: predictiveMonitor.getActivePredictions()
  });
});

app.post('/api/ai/resolve', async (req, res) => {
  try {
    const { action } = req.body || {};
    let executionResult = null;

    if (action === 'run_cleanup') {
      executionResult = cleanupEngine.executeCleanup({ includeRecycleBin: false, runVolumeOptimization: true });
    } else if (action === 'run_driver_update') {
      executionResult = driverManager.updateAllDrivers();
    } else if (action === 'optimize_network') {
      executionResult = networkOptimizer.optimize();
    } else if (action === 'schedule_disk_check' || action === 'reduce_startup_apps') {
      executionResult = { status: 'QUEUED', message: 'Diagnostic check queued for next scheduled maintenance window.' };
    } else {
      executionResult = { status: 'NOOP', message: 'No action required.' };
    }

    // Refresh trend detection after fix execution
    setTimeout(() => predictiveMonitor.checkTrends(), 2000);

    res.json({ success: true, action, result: executionResult });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/support/ticket', async (req, res) => {
  try {
    const { customerName, customerEmail, issueDescription, priority } = req.body;
    
    if (!latestDiagnostics) {
      await refreshDiagnostics(true);
    }

    const ticketPayload = {
      deviceId: latestDiagnostics.system.serialNumber,
      customerName: customerName || 'Valued Avantis Customer',
      customerEmail: customerEmail || 'customer@avantispc.com',
      issueDescription: issueDescription || 'General Support Escalation',
      priority: priority || 'MEDIUM',
      diagnosticSnapshot: {
        diagnostics: latestDiagnostics,
        evaluation: latestEvaluation
      }
    };

    const backendRes = await fetch(`${BACKEND_URL}/api/v1/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticketPayload)
    });

    if (backendRes.ok) {
      const data = await backendRes.json();
      return res.json({ success: true, ticket: data.ticket });
    } else {
      const errData = await backendRes.json().catch(() => ({}));
      return res.status(500).json({ success: false, message: errData.message || 'Failed to submit ticket to backend' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Initialize & start background monitoring loop
async function startAgent() {
  app.listen(AGENT_PORT, () => {
    console.log(`[Avantis Agent] IPC API listening on http://localhost:${AGENT_PORT}`);
  });

  console.log('[Avantis Agent] Initializing background health monitoring service...');

  if (process.platform === 'win32') {
    try {
      const { exec } = require('child_process');
      const path = require('path');
      const regScript = path.join(__dirname, 'notifications', 'create_aumid_shortcut.ps1');
      exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${regScript}"`, (err) => {
        if (!err) console.log('[Avantis Agent] Registered Windows AppUserModelId (Avantis.Support)');
      });
    } catch {}
  }

  await refreshDiagnostics(true);

  // Initialize predictive monitoring engine
  predictiveMonitor.start();

  // Real-time polling loop every 5 seconds (5000ms)
  setInterval(() => refreshDiagnostics(false), 5000);
}

startAgent();
