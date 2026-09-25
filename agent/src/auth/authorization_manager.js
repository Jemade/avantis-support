const fs = require('fs');
const path = require('path');
const http = require('http');

class AuthorizationManager {
  constructor(options = {}) {
    this.backendUrl = options.backendUrl || process.env.BACKEND_URL || 'http://localhost:9141';
    
    // Protected local credential path
    if (options.storageDir) {
      this.storageDir = options.storageDir;
    } else if (process.platform === 'win32') {
      const programData = process.env.ProgramData || 'C:\\ProgramData';
      this.storageDir = path.join(programData, 'Avantis');
    } else {
      this.storageDir = path.resolve(__dirname, '..', '..', 'data');
    }

    this.credentialsPath = path.join(this.storageDir, 'credentials.json');

    this.state = {
      status: 'UNENROLLED', // UNENROLLED, AUTHORIZING, AUTHORIZED, REVOKED, OFFLINE, NOT_AUTHORIZED
      deviceId: null,
      installationId: null,
      model: null,
      serialNumber: null,
      authToken: null,
      capabilities: {},
      enrolledAt: null,
      lastVerifiedAt: null,
      revocationReason: null,
      isEnrolled: false
    };

    this.VERIFY_INTERVAL_MS = 60000; // Check authorization validity every 60s
  }

  async init() {
    this.loadLocalCredentials();
    await this.verifyWithBackend();
  }

  loadLocalCredentials() {
    try {
      if (fs.existsSync(this.credentialsPath)) {
        const raw = fs.readFileSync(this.credentialsPath, 'utf8');
        const creds = JSON.parse(raw);
        if (creds && creds.deviceId && creds.authToken) {
          this.state.deviceId = creds.deviceId;
          this.state.installationId = creds.installationId || null;
          this.state.authToken = creds.authToken;
          this.state.model = creds.model || null;
          this.state.serialNumber = creds.serialNumber || null;
          this.state.capabilities = creds.capabilities || {};
          this.state.enrolledAt = creds.enrolledAt || null;
          this.state.isEnrolled = true;
          this.state.status = 'AUTHORIZING';
          return true;
        }
      }
    } catch (err) {
      console.warn('[AuthorizationManager] Error reading credentials:', err.message);
    }

    this.state.status = 'UNENROLLED';
    this.state.isEnrolled = false;
    return false;
  }

  saveCredentials(creds) {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      const payload = {
        deviceId: creds.deviceId,
        installationId: creds.installationId,
        authToken: creds.authToken,
        model: creds.model,
        serialNumber: creds.serialNumber,
        capabilities: creds.capabilities,
        enrolledAt: creds.enrolledAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      fs.writeFileSync(this.credentialsPath, JSON.stringify(payload, null, 2), {
        encoding: 'utf8',
        mode: 0o600 // Restrict file permissions
      });

      this.state.deviceId = payload.deviceId;
      this.state.installationId = payload.installationId;
      this.state.authToken = payload.authToken;
      this.state.model = payload.model;
      this.state.serialNumber = payload.serialNumber;
      this.state.capabilities = payload.capabilities;
      this.state.enrolledAt = payload.enrolledAt;
      this.state.isEnrolled = true;
      this.state.status = 'AUTHORIZED';
      this.state.lastVerifiedAt = new Date().toISOString();
      return true;
    } catch (err) {
      console.error('[AuthorizationManager] Failed to persist credentials:', err.message);
      return false;
    }
  }

  async verifyWithBackend() {
    if (!this.state.isEnrolled || !this.state.deviceId || !this.state.authToken) {
      this.state.status = 'UNENROLLED';
      return this.getStatus();
    }

    try {
      const result = await this.postJson(`${this.backendUrl}/api/v1/enrollment/verify`, {
        deviceId: this.state.deviceId,
        installationId: this.state.installationId,
        authToken: this.state.authToken
      });

      if (result.authorized && result.status === 'AUTHORIZED') {
        this.state.status = 'AUTHORIZED';
        this.state.lastVerifiedAt = new Date().toISOString();
        if (result.device) {
          if (result.device.model) this.state.model = result.device.model;
          if (result.device.capabilities) this.state.capabilities = result.device.capabilities;
        }
      } else if (result.status === 'REVOKED') {
        this.state.status = 'REVOKED';
        this.state.revocationReason = result.reason || 'Device authorization revoked by Avantis Support';
      } else if (result.status === 'UNENROLLED') {
        this.state.status = 'UNENROLLED';
      } else {
        this.state.status = 'NOT_AUTHORIZED';
      }
    } catch (err) {
      // Backend unreachable: If previously valid, enter OFFLINE local diagnostics mode
      console.warn('[AuthorizationManager] Backend verification unreachable, operating in OFFLINE mode:', err.message);
      if (this.state.authToken) {
        this.state.status = 'OFFLINE';
      } else {
        this.state.status = 'UNENROLLED';
      }
    }

    return this.getStatus();
  }

  async enrollMachine(provisioningKey, systemDetails, identityDetails) {
    try {
      const payload = {
        provisioningKey,
        deviceId: identityDetails.deviceId,
        installationId: identityDetails.installationId,
        hardwareIdentity: identityDetails.hardwareIdentityHash,
        model: systemDetails.model,
        serialNumber: systemDetails.serialNumber,
        systemInfo: {
          manufacturer: systemDetails.manufacturer,
          model: systemDetails.model,
          sku: systemDetails.sku,
          serialNumber: systemDetails.serialNumber,
          hasBattery: systemDetails.hasBattery
        },
        clientVersion: '2.4.0',
        technicianName: 'Avantis Authorized Provisioner'
      };

      const res = await this.postJson(`${this.backendUrl}/api/v1/enrollment/enroll`, payload);

      if (res && res.success && res.enrolled) {
        this.saveCredentials({
          deviceId: res.enrolled.deviceId,
          installationId: res.enrolled.installationId,
          authToken: res.enrolled.authToken,
          model: res.enrolled.model,
          serialNumber: res.enrolled.serialNumber,
          capabilities: res.enrolled.capabilities,
          enrolledAt: res.enrolled.enrolledAt
        });

        return {
          success: true,
          message: 'Device successfully enrolled and authorized.',
          status: 'AUTHORIZED',
          device: this.getStatus()
        };
      } else {
        return {
          success: false,
          message: res.message || 'Enrollment rejected by Avantis Backend.'
        };
      }
    } catch (err) {
      return {
        success: false,
        message: 'Could not connect to enrollment service: ' + err.message
      };
    }
  }

  async postJson(urlStr, data) {
    const res = await fetch(urlStr, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(5000)
    });
    return await res.json();
  }

  getStatus() {
    return {
      status: this.state.status, // AUTHORIZED, OFFLINE, UNENROLLED, REVOKED, NOT_AUTHORIZED
      isAuthorized: this.state.status === 'AUTHORIZED',
      isOperational: this.state.status === 'AUTHORIZED' || this.state.status === 'OFFLINE',
      isOffline: this.state.status === 'OFFLINE',
      isEnrolled: this.state.isEnrolled,
      deviceId: this.state.deviceId,
      installationId: this.state.installationId,
      model: this.state.model,
      serialNumber: this.state.serialNumber,
      capabilities: this.state.capabilities,
      lastVerifiedAt: this.state.lastVerifiedAt,
      revocationReason: this.state.revocationReason
    };
  }
}

module.exports = AuthorizationManager;
