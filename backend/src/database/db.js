const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class PostgreSQLDatabase {
  constructor() {
    this.connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/avantis_db';
    this.pool = null;
    this.isNativePgConnected = false;
    this.persistencePath = path.resolve(__dirname, '..', '..', 'data', 'enrolled_devices.json');
    this.inMemoryStore = {
      devices: new Map(),
      enrolledDevices: new Map(),
      telemetry: [],
      alerts: [],
      tickets: new Map()
    };
  }

  async init() {
    // Load persisted enrolled devices if using in-memory store
    try {
      if (fs.existsSync(this.persistencePath)) {
        const raw = fs.readFileSync(this.persistencePath, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach(d => this.inMemoryStore.enrolledDevices.set(d.deviceId, d));
          console.log(`[Database] Restored ${list.length} enrolled device record(s) from persistent storage.`);
        }
      }
    } catch (e) {
      console.warn('[Database] Could not read persisted devices:', e.message);
    }

    try {
      this.pool = new Pool({
        connectionString: this.connectionString,
        connectionTimeoutMillis: 2000
      });

      // Test connection
      const client = await this.pool.connect();
      client.release();
      this.isNativePgConnected = true;
      console.log('[Database] Successfully connected to PostgreSQL Server');
      await this.createTables();
    } catch (err) {
      console.log('[Database] Live PostgreSQL server not detected on localhost:5432. Activating PostgreSQL in-memory fallback adapter.');
      this.isNativePgConnected = false;
    }
  }

  persistEnrolledDevices() {
    try {
      const dir = path.dirname(this.persistencePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const list = Array.from(this.inMemoryStore.enrolledDevices.values());
      fs.writeFileSync(this.persistencePath, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      console.warn('[Database] Failed to persist enrolled devices:', err.message);
    }
  }

  async createTables() {
    if (!this.isNativePgConnected) return;

    const queries = [
      `CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(100) PRIMARY KEY,
        hostname VARCHAR(255),
        model VARCHAR(255),
        serial_number VARCHAR(100),
        os_version VARCHAR(255),
        health_status VARCHAR(50),
        health_score INT,
        last_seen TIMESTAMP WITH TIME ZONE,
        specs JSONB
      );`,

      `CREATE TABLE IF NOT EXISTS telemetry_history (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(100) REFERENCES devices(id),
        cpu_load INT,
        cpu_temp INT,
        ram_used_percent INT,
        storage_free_percent INT,
        storage_smart_status VARCHAR(50),
        battery_health_percent INT,
        metrics JSONB,
        recorded_at TIMESTAMP WITH TIME ZONE
      );`,

      `CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(100),
        alert_type VARCHAR(100),
        severity VARCHAR(50),
        title VARCHAR(255),
        message TEXT,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at TIMESTAMP WITH TIME ZONE
      );`,

      `CREATE TABLE IF NOT EXISTS tickets (
        id VARCHAR(100) PRIMARY KEY,
        device_id VARCHAR(100),
        customer_name VARCHAR(255),
        customer_email VARCHAR(255),
        issue_description TEXT,
        priority VARCHAR(50),
        diagnostic_snapshot JSONB,
        status VARCHAR(50) DEFAULT 'OPEN',
        created_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE
      );`,

      `CREATE TABLE IF NOT EXISTS avantis_enrolled_devices (
        device_id VARCHAR(100) PRIMARY KEY,
        installation_id VARCHAR(100) UNIQUE,
        device_status VARCHAR(50) DEFAULT 'ACTIVE',
        model VARCHAR(255),
        serial_number VARCHAR(100),
        hardware_identity VARCHAR(255),
        enrollment_status VARCHAR(50) DEFAULT 'ENROLLED',
        authorization_status VARCHAR(50) DEFAULT 'AUTHORIZED',
        client_version VARCHAR(50),
        capabilities JSONB,
        auth_token VARCHAR(255),
        enrolled_by VARCHAR(100),
        enrolled_at TIMESTAMP WITH TIME ZONE,
        last_seen TIMESTAMP WITH TIME ZONE,
        revocation_reason TEXT
      );`
    ];

    for (const q of queries) {
      await this.pool.query(q);
    }
  }

  // Devices CRUD
  async upsertDevice(deviceData) {
    const { deviceId, hostname, model, serialNumber, osVersion, healthStatus, healthScore, diagnostics, timestamp } = deviceData;

    if (this.isNativePgConnected) {
      const query = `
        INSERT INTO devices (id, hostname, model, serial_number, os_version, health_status, health_score, last_seen, specs)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          hostname = EXCLUDED.hostname,
          model = EXCLUDED.model,
          health_status = EXCLUDED.health_status,
          health_score = EXCLUDED.health_score,
          last_seen = EXCLUDED.last_seen,
          specs = EXCLUDED.specs;
      `;
      await this.pool.query(query, [deviceId, hostname, model, serialNumber, osVersion, healthStatus, healthScore, timestamp, JSON.stringify(diagnostics)]);
    } else {
      this.inMemoryStore.devices.set(deviceId, {
        id: deviceId,
        hostname,
        model,
        serial_number: serialNumber,
        os_version: osVersion,
        health_status: healthStatus,
        health_score: healthScore,
        last_seen: timestamp,
        specs: diagnostics
      });
    }
  }

  async getDevices() {
    if (this.isNativePgConnected) {
      const res = await this.pool.query('SELECT * FROM devices ORDER BY last_seen DESC');
      return res.rows;
    } else {
      return Array.from(this.inMemoryStore.devices.values());
    }
  }

  async getDeviceById(id) {
    if (this.isNativePgConnected) {
      const res = await this.pool.query('SELECT * FROM devices WHERE id = $1', [id]);
      return res.rows[0] || null;
    } else {
      return this.inMemoryStore.devices.get(id) || null;
    }
  }

  // Telemetry History
  async recordTelemetry(data) {
    const { deviceId, cpuLoad, cpuTemp, ramUsedPercent, storageFreePercent, storageSmartStatus, batteryHealthPercent, diagnostics, timestamp } = data;

    if (this.isNativePgConnected) {
      const query = `
        INSERT INTO telemetry_history (device_id, cpu_load, cpu_temp, ram_used_percent, storage_free_percent, storage_smart_status, battery_health_percent, metrics, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `;
      await this.pool.query(query, [deviceId, cpuLoad, cpuTemp, ramUsedPercent, storageFreePercent, storageSmartStatus, batteryHealthPercent, JSON.stringify(diagnostics), timestamp]);
    } else {
      this.inMemoryStore.telemetry.push({
        device_id: deviceId,
        cpu_load: cpuLoad,
        cpu_temp: cpuTemp,
        ram_used_percent: ramUsedPercent,
        storage_free_percent: storageFreePercent,
        storage_smart_status: storageSmartStatus,
        battery_health_percent: batteryHealthPercent,
        metrics: diagnostics,
        recorded_at: timestamp
      });
    }
  }

  // Alerts
  async recordAlerts(deviceId, alerts, timestamp) {
    if (!alerts || alerts.length === 0) return;

    for (const alert of alerts) {
      if (this.isNativePgConnected) {
        const query = `
          INSERT INTO alerts (device_id, alert_type, severity, title, message, status, created_at)
          VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6);
        `;
        await this.pool.query(query, [deviceId, alert.type, alert.severity, alert.title, alert.message, timestamp]);
      } else {
        this.inMemoryStore.alerts.unshift({
          id: this.inMemoryStore.alerts.length + 1,
          device_id: deviceId,
          alert_type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          status: 'ACTIVE',
          created_at: timestamp
        });
      }
    }
  }

  async getActiveAlerts() {
    if (this.isNativePgConnected) {
      const res = await this.pool.query("SELECT * FROM alerts WHERE status = 'ACTIVE' ORDER BY created_at DESC");
      return res.rows;
    } else {
      return this.inMemoryStore.alerts.filter(a => a.status === 'ACTIVE');
    }
  }

  // Tickets
  async createTicket(ticketData) {
    const { ticketId, deviceId, customerName, customerEmail, issueDescription, priority, diagnosticSnapshot, timestamp } = ticketData;

    if (this.isNativePgConnected) {
      const query = `
        INSERT INTO tickets (id, device_id, customer_name, customer_email, issue_description, priority, diagnostic_snapshot, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8, $8);
      `;
      await this.pool.query(query, [ticketId, deviceId, customerName, customerEmail, issueDescription, priority, JSON.stringify(diagnosticSnapshot), timestamp]);
    } else {
      const ticketObj = {
        id: ticketId,
        device_id: deviceId,
        customer_name: customerName,
        customer_email: customerEmail,
        issue_description: issueDescription,
        priority,
        diagnostic_snapshot: diagnosticSnapshot,
        status: 'OPEN',
        created_at: timestamp,
        updated_at: timestamp
      };
      this.inMemoryStore.tickets.set(ticketId, ticketObj);
    }
  }

  async getTickets() {
    if (this.isNativePgConnected) {
      const res = await this.pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
      return res.rows;
    } else {
      return Array.from(this.inMemoryStore.tickets.values());
    }
  }

  async updateTicketStatus(id, newStatus) {
    const now = new Date().toISOString();
    if (this.isNativePgConnected) {
      await this.pool.query('UPDATE tickets SET status = $1, updated_at = $2 WHERE id = $3', [newStatus, now, id]);
    } else {
      const ticket = this.inMemoryStore.tickets.get(id);
      if (ticket) {
        ticket.status = newStatus;
        ticket.updated_at = now;
      }
    }
  }

  // ==========================================
  // AVANTIS CONTROLLED ENROLLMENT & AUTHORIZATION
  // ==========================================

  async enrollDevice(record) {
    const now = new Date().toISOString();
    const data = {
      deviceId: record.deviceId,
      installationId: record.installationId,
      deviceStatus: record.deviceStatus || 'ACTIVE',
      model: record.model || 'Avantis PC',
      serialNumber: record.serialNumber || null,
      hardwareIdentity: record.hardwareIdentity,
      enrollmentStatus: record.enrollmentStatus || 'ACTIVE',
      authorizationStatus: record.authorizationStatus || 'AUTHORIZED',
      clientVersion: record.clientVersion || '2.4.0',
      capabilities: record.capabilities || {},
      authToken: record.authToken,
      enrolledBy: record.enrolledBy || 'Avantis Factory / Provisioning Bench',
      enrolledAt: record.enrolledAt || now,
      lastSeen: now,
      revocationReason: null
    };

    if (this.isNativePgConnected) {
      const query = `
        INSERT INTO avantis_enrolled_devices 
          (device_id, installation_id, device_status, model, serial_number, hardware_identity, enrollment_status, authorization_status, client_version, capabilities, auth_token, enrolled_by, enrolled_at, last_seen, revocation_reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (device_id) DO UPDATE SET
          installation_id = EXCLUDED.installation_id,
          device_status = EXCLUDED.device_status,
          model = EXCLUDED.model,
          serial_number = EXCLUDED.serial_number,
          hardware_identity = EXCLUDED.hardware_identity,
          enrollment_status = EXCLUDED.enrollment_status,
          authorization_status = EXCLUDED.authorization_status,
          client_version = EXCLUDED.client_version,
          capabilities = EXCLUDED.capabilities,
          auth_token = EXCLUDED.auth_token,
          last_seen = EXCLUDED.last_seen;
      `;
      await this.pool.query(query, [
        data.deviceId, data.installationId, data.deviceStatus, data.model,
        data.serialNumber, data.hardwareIdentity, data.enrollmentStatus,
        data.authorizationStatus, data.clientVersion, JSON.stringify(data.capabilities),
        data.authToken, data.enrolledBy, data.enrolledAt, data.lastSeen, data.revocationReason
      ]);
    } else {
      this.inMemoryStore.enrolledDevices.set(data.deviceId, data);
      this.persistEnrolledDevices();
    }

    return data;
  }

  async getEnrolledDevice(deviceId) {
    if (!deviceId) return null;
    if (this.isNativePgConnected) {
      const res = await this.pool.query('SELECT * FROM avantis_enrolled_devices WHERE device_id = $1', [deviceId]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        deviceId: row.device_id,
        installationId: row.installation_id,
        deviceStatus: row.device_status,
        model: row.model,
        serialNumber: row.serial_number,
        hardwareIdentity: row.hardware_identity,
        enrollmentStatus: row.enrollment_status,
        authorizationStatus: row.authorization_status,
        clientVersion: row.client_version,
        capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : row.capabilities,
        authToken: row.auth_token,
        enrolledBy: row.enrolled_by,
        enrolledAt: row.enrolled_at,
        lastSeen: row.last_seen,
        revocationReason: row.revocation_reason
      };
    } else {
      return this.inMemoryStore.enrolledDevices.get(deviceId) || null;
    }
  }

  async verifyDeviceCredential(deviceId, installationId, token) {
    const dev = await this.getEnrolledDevice(deviceId);
    if (!dev) {
      return { authorized: false, status: 'UNENROLLED', reason: 'Device record not found in Avantis registry.' };
    }

    if (dev.authorizationStatus === 'REVOKED') {
      return { authorized: false, status: 'REVOKED', reason: dev.revocationReason || 'Device authorization has been revoked by Avantis PC Support.' };
    }

    if (dev.authorizationStatus === 'SUSPENDED') {
      return { authorized: false, status: 'SUSPENDED', reason: 'Device authorization is temporarily suspended.' };
    }

    if (installationId && dev.installationId !== installationId) {
      return { authorized: false, status: 'NOT_AUTHORIZED', reason: 'Installation ID mismatch.' };
    }

    if (token && dev.authToken !== token) {
      return { authorized: false, status: 'NOT_AUTHORIZED', reason: 'Invalid device authorization token.' };
    }

    // Touch last_seen
    const now = new Date().toISOString();
    dev.lastSeen = now;
    if (this.isNativePgConnected) {
      await this.pool.query('UPDATE avantis_enrolled_devices SET last_seen = $1 WHERE device_id = $2', [now, deviceId]);
    } else {
      this.inMemoryStore.enrolledDevices.set(deviceId, dev);
    }

    return {
      authorized: true,
      status: dev.authorizationStatus || 'AUTHORIZED',
      device: {
        deviceId: dev.deviceId,
        installationId: dev.installationId,
        model: dev.model,
        serialNumber: dev.serialNumber,
        enrollmentStatus: dev.enrollmentStatus,
        authorizationStatus: dev.authorizationStatus,
        capabilities: dev.capabilities
      }
    };
  }

  async revokeDevice(deviceId, reason = 'Administrative revocation') {
    const now = new Date().toISOString();
    if (this.isNativePgConnected) {
      await this.pool.query(
        'UPDATE avantis_enrolled_devices SET authorization_status = $1, device_status = $2, revocation_reason = $3, last_seen = $4 WHERE device_id = $5',
        ['REVOKED', 'REVOKED', reason, now, deviceId]
      );
    } else {
      const dev = this.inMemoryStore.enrolledDevices.get(deviceId);
      if (dev) {
        dev.authorizationStatus = 'REVOKED';
        dev.deviceStatus = 'REVOKED';
        dev.revocationReason = reason;
        dev.lastSeen = now;
        this.persistEnrolledDevices();
      }
    }
    return { success: true, deviceId, status: 'REVOKED', reason };
  }

  async listEnrolledDevices() {
    if (this.isNativePgConnected) {
      const res = await this.pool.query('SELECT * FROM avantis_enrolled_devices ORDER BY enrolled_at DESC');
      return res.rows.map(row => ({
        deviceId: row.device_id,
        installationId: row.installation_id,
        deviceStatus: row.device_status,
        model: row.model,
        serialNumber: row.serial_number,
        enrollmentStatus: row.enrollment_status,
        authorizationStatus: row.authorization_status,
        clientVersion: row.client_version,
        enrolledBy: row.enrolled_by,
        enrolledAt: row.enrolled_at,
        lastSeen: row.last_seen
      }));
    } else {
      return Array.from(this.inMemoryStore.enrolledDevices.values()).map(d => ({
        deviceId: d.deviceId,
        installationId: d.installationId,
        deviceStatus: d.deviceStatus,
        model: d.model,
        serialNumber: d.serialNumber,
        enrollmentStatus: d.enrollmentStatus,
        authorizationStatus: d.authorizationStatus,
        clientVersion: d.clientVersion,
        enrolledBy: d.enrolledBy,
        enrolledAt: d.enrolledAt,
        lastSeen: d.lastSeen
      }));
    }
  }
}

module.exports = new PostgreSQLDatabase();
