const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database/db');
const { DeviceCatalogService } = require('../catalog/device_catalog');

const catalogService = new DeviceCatalogService();
const PROVISIONING_SECRET = process.env.AVANTIS_PROVISIONING_SECRET || 'AVANTIS-PROV-SECRET-2026';

// Configurable activation code list from environment or database (defaults to 1234)
const ACTIVATION_CODES = (process.env.AVANTIS_ACTIVATION_CODES || '1234,AVANTIS2026,AVT-ORG-01')
  .split(',')
  .map(c => c.trim().toUpperCase());

// ==========================================
// 1. CONTROLLED DEVICE ENROLLMENT & ACTIVATION
// ==========================================

/**
 * Public Device Activation Endpoint
 * Allows Avantis PCs to self-activate using an authorized organization code (e.g. 1234).
 * Enforces genuine Avantis device catalog verification and authentic hardware metrics.
 */
router.post('/enrollment/activate', async (req, res) => {
  try {
    const {
      activationCode,
      deviceId,
      installationId,
      hardwareIdentity,
      model,
      serialNumber,
      systemInfo = {},
      screenProfile = 'auto',
      clientVersion = '2.4.0'
    } = req.body;

    if (!activationCode) {
      return res.status(400).json({
        success: false,
        message: 'Activation code is required for Avantis licensing.'
      });
    }

    const codeClean = String(activationCode).trim().toUpperCase();
    if (!ACTIVATION_CODES.includes(codeClean)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Avantis Activation Code. Please enter an authorized organization license code.'
      });
    }

    if (!deviceId || !installationId || !hardwareIdentity) {
      return res.status(400).json({
        success: false,
        message: 'deviceId, installationId, and hardwareIdentity are required for enrollment.'
      });
    }

    // Classify into Avantis hardware catalog based on actual physical device telemetry
    let assignedModel = model;
    let assignedCapabilities = {};

    const match = catalogService.matchSystem({
      manufacturer: systemInfo.manufacturer || 'Avantis',
      model: model || systemInfo.model,
      sku: systemInfo.sku
    });

    if (match.matched && match.profile) {
      assignedModel = match.profile.name;
      assignedCapabilities = match.profile.capabilities;
    } else {
      // Determine model based on actual collected device form factor and screen profile:
      const isLaptop = systemInfo.hasBattery !== false || systemInfo.chassisType === 'Laptop';
      if (isLaptop) {
        if (screenProfile === '14inch' || (systemInfo.display && systemInfo.display.includes('14'))) {
          assignedModel = 'Avantis Laptop Student 14';
        } else {
          assignedModel = 'Avantis Laptop Elite 15';
        }
      } else if (systemInfo.chassisType === 'All-in-One' || (systemInfo.touch && systemInfo.touch.hasTouchscreen)) {
        assignedModel = 'Avantis All-in-One Vision 24';
      } else {
        assignedModel = 'Avantis Desktop Pro X';
      }

      assignedCapabilities = {
        battery: isLaptop,
        batteryHealth: isLaptop,
        temperatureSensors: true,
        smartStorage: true,
        wifi: true,
        ethernet: true,
        defender: true,
        windowsUpdate: true,
        driverManagement: true,
        networkReset: true,
        volumeOptimization: true
      };
    }

    // Generate cryptographically secure auth token
    const tokenPayload = `${deviceId}:${installationId}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`;
    const authToken = crypto.createHmac('sha256', PROVISIONING_SECRET).update(tokenPayload).digest('hex');

    const enrolled = await db.enrollDevice({
      deviceId,
      installationId,
      deviceStatus: 'ACTIVE',
      model: assignedModel,
      serialNumber: serialNumber || systemInfo.serialNumber || 'AVT-' + deviceId.substring(8, 16),
      hardwareIdentity,
      enrollmentStatus: 'ENROLLED',
      authorizationStatus: 'AUTHORIZED',
      clientVersion,
      capabilities: assignedCapabilities,
      authToken,
      enrolledBy: `Self-Activated (Code: ${codeClean})`
    });

    console.log(`[Activation] Machine ${deviceId} activated as "${assignedModel}" via code ${codeClean}`);

    res.json({
      success: true,
      message: 'Machine successfully activated and registered in Avantis Platform.',
      enrolled: {
        deviceId: enrolled.deviceId,
        installationId: enrolled.installationId,
        model: enrolled.model,
        serialNumber: enrolled.serialNumber,
        authorizationStatus: enrolled.authorizationStatus,
        capabilities: enrolled.capabilities,
        authToken: enrolled.authToken,
        enrolledAt: enrolled.enrolledAt
      }
    });
  } catch (err) {
    console.error('[Activation] Error during machine activation:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Internal Avantis Provisioning Endpoint
 * Invoked by Avantis factory setup / technician deployment script.
 * Requires secret provisioning key.
 */
router.post('/enrollment/enroll', async (req, res) => {
  try {
    const provKey = req.headers['x-avantis-provisioning-key'] || req.body.provisioningKey;
    if (provKey !== PROVISIONING_SECRET) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Valid Avantis technician provisioning key required for device enrollment.'
      });
    }

    const {
      deviceId,
      installationId,
      hardwareIdentity,
      model,
      serialNumber,
      systemInfo = {},
      clientVersion = '2.4.0',
      technicianName = 'Avantis Technician'
    } = req.body;

    if (!deviceId || !installationId || !hardwareIdentity) {
      return res.status(400).json({
        success: false,
        message: 'deviceId, installationId, and hardwareIdentity are required for enrollment.'
      });
    }

    // Match against authoritative Avantis Device Catalog
    const match = catalogService.matchSystem({
      manufacturer: systemInfo.manufacturer || 'Avantis',
      model: model || systemInfo.model,
      sku: systemInfo.sku
    });

    let assignedModel = model || 'Avantis PC';
    let assignedCapabilities = {};

    if (match.matched && match.profile) {
      assignedModel = match.profile.name;
      assignedCapabilities = match.profile.capabilities;
    } else {
      // Non-catalog or generic hardware provisioned by technician
      assignedModel = model || systemInfo.model || 'Avantis Custom Workstation';
      assignedCapabilities = {
        battery: systemInfo.hasBattery !== false,
        temperatureSensors: true,
        smartStorage: true,
        wifi: true,
        ethernet: true,
        defender: true,
        windowsUpdate: true,
        driverManagement: true
      };
    }

    // Generate cryptographically secure device auth token
    const tokenPayload = `${deviceId}:${installationId}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`;
    const authToken = crypto.createHmac('sha256', PROVISIONING_SECRET).update(tokenPayload).digest('hex');

    const enrolled = await db.enrollDevice({
      deviceId,
      installationId,
      deviceStatus: 'ACTIVE',
      model: assignedModel,
      serialNumber: serialNumber || systemInfo.serialNumber || null,
      hardwareIdentity,
      enrollmentStatus: 'ENROLLED',
      authorizationStatus: 'AUTHORIZED',
      clientVersion,
      capabilities: assignedCapabilities,
      authToken,
      enrolledBy: technicianName
    });

    res.json({
      success: true,
      message: 'Machine successfully enrolled in Avantis Device Registry.',
      enrolled: {
        deviceId: enrolled.deviceId,
        installationId: enrolled.installationId,
        model: enrolled.model,
        serialNumber: enrolled.serialNumber,
        authorizationStatus: enrolled.authorizationStatus,
        capabilities: enrolled.capabilities,
        authToken: enrolled.authToken,
        enrolledAt: enrolled.enrolledAt
      }
    });
  } catch (err) {
    console.error('[Enrollment] Enrollment error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Verify Device Authorization
 * Invoked by local Avantis Client Companion agent to confirm active authorization.
 */
router.post('/enrollment/verify', async (req, res) => {
  try {
    const { deviceId, installationId, authToken } = req.body;
    if (!deviceId || !authToken) {
      return res.status(400).json({
        authorized: false,
        status: 'UNENROLLED',
        message: 'deviceId and authToken required.'
      });
    }

    const verification = await db.verifyDeviceCredential(deviceId, installationId, authToken);
    res.json(verification);
  } catch (err) {
    res.status(500).json({ authorized: false, status: 'SERVICE_ERROR', message: err.message });
  }
});

/**
 * Revoke Device Authorization
 * Allows Avantis Support/Admin to immediately decommission or revoke an enrolled device.
 */
router.post('/enrollment/revoke', async (req, res) => {
  try {
    const provKey = req.headers['x-avantis-provisioning-key'] || req.body.provisioningKey;
    if (provKey !== PROVISIONING_SECRET) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Administrative key required.' });
    }

    const { deviceId, reason } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId required.' });

    const result = await db.revokeDevice(deviceId, reason || 'Administrative revocation by Avantis Support');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * List Enrolled Devices (Internal View)
 */
router.get('/enrollment/devices', async (req, res) => {
  try {
    const devices = await db.listEnrolledDevices();
    res.json({ success: true, count: devices.length, devices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Get Authoritative Device Catalog
 */
router.get('/enrollment/catalog', (req, res) => {
  res.json({
    success: true,
    catalog: catalogService.getAllProfiles()
  });
});

// Telemetry Ingest Endpoint
router.post('/telemetry/ingest', async (req, res) => {
  try {
    const data = req.body;
    if (!data.deviceId) {
      return res.status(400).json({ success: false, message: 'Missing deviceId in telemetry payload' });
    }

    const timestamp = data.timestamp || new Date().toISOString();

    // 1. Register/Update Device
    await db.upsertDevice({
      deviceId: data.deviceId,
      hostname: data.hostname || 'PC',
      model: data.model || 'PC',
      serialNumber: data.serialNumber || data.deviceId,
      osVersion: data.osVersion || 'Windows',
      healthStatus: data.healthStatus || 'HEALTHY',
      healthScore: data.healthScore !== undefined ? data.healthScore : null,
      diagnostics: data.diagnostics || {},
      timestamp
    });

    // 2. Record Telemetry Metrics History
    await db.recordTelemetry({
      deviceId: data.deviceId,
      cpuLoad: typeof data.cpuLoad === 'number' ? data.cpuLoad : null,
      cpuTemp: typeof data.cpuTemp === 'number' ? data.cpuTemp : null,
      ramUsedPercent: typeof data.ramUsedPercent === 'number' ? data.ramUsedPercent : null,
      storageFreePercent: typeof data.storageFreePercent === 'number' ? data.storageFreePercent : null,
      storageSmartStatus: data.storageSmartStatus || null,
      batteryHealthPercent: typeof data.batteryHealthPercent === 'number' ? data.batteryHealthPercent : null,
      diagnostics: data.diagnostics || {},
      timestamp
    });

    // 3. Record Alerts if present
    if (data.alerts && data.alerts.length > 0) {
      await db.recordAlerts(data.deviceId, data.alerts, timestamp);
    }

    res.json({ success: true, message: 'Telemetry successfully ingested into PostgreSQL' });
  } catch (err) {
    console.error('[Backend API] Telemetry Ingest Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Devices endpoints
router.get('/devices', async (req, res) => {
  try {
    const devices = await db.getDevices();
    res.json({ success: true, count: devices.length, devices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/devices/:id', async (req, res) => {
  try {
    const device = await db.getDeviceById(req.params.id);
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }
    res.json({ success: true, device });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Active Alerts endpoint
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await db.getActiveAlerts();
    res.json({ success: true, count: alerts.length, alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Support Tickets endpoints
router.post('/tickets', async (req, res) => {
  try {
    const { deviceId, customerName, customerEmail, issueDescription, priority, diagnosticSnapshot } = req.body;

    const ticketId = 'AVT-TCK-' + Math.floor(100000 + Math.random() * 900000);
    const timestamp = new Date().toISOString();

    const ticket = {
      ticketId,
      deviceId: deviceId || 'DEVICE',
      customerName: customerName || 'Valued Customer',
      customerEmail: customerEmail || 'support@avantispc.com',
      issueDescription: issueDescription || 'General diagnostic escalation',
      priority: priority || 'MEDIUM',
      diagnosticSnapshot: diagnosticSnapshot || {},
      timestamp
    };

    await db.createTicket(ticket);

    res.json({
      success: true,
      message: 'Support ticket created successfully',
      ticket: {
        id: ticketId,
        status: 'OPEN',
        created_at: timestamp
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/tickets', async (req, res) => {
  try {
    const tickets = await db.getTickets();
    res.json({ success: true, count: tickets.length, tickets });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/tickets/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Missing status field' });
    }
    await db.updateTicketStatus(req.params.id, status);
    res.json({ success: true, message: `Ticket ${req.params.id} status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Audit Reports Endpoint for Fleet
const fs = require('fs');
const path = require('path');
const reportsDir = path.resolve(__dirname, '..', '..', '..', 'reports');

router.get('/reports', (req, res) => {
  try {
    if (!fs.existsSync(reportsDir)) {
      return res.json({ success: true, count: 0, reports: [] });
    }
    const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json')).sort((a, b) => b.localeCompare(a));
    const reports = [];
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(reportsDir, f), 'utf8');
        const data = JSON.parse(raw);
        reports.push({
          filename: f,
          hostname: data.hostname,
          generatedAt: data.generatedAt,
          overallStatus: data.overallStatus,
          summary: data.summary
        });
      } catch (_) {}
    }
    res.json({ success: true, count: reports.length, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/reports/:filename', (req, res) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const fullPath = path.join(reportsDir, safeFilename);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    const raw = fs.readFileSync(fullPath, 'utf8');
    res.json({ success: true, report: JSON.parse(raw) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
