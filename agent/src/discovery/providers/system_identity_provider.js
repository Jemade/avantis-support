const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

class SystemIdentityProvider {
  constructor(storageDir = null) {
    // Protected local configuration location
    // On Windows: %ProgramData%\Avantis or local AppData
    // In Dev/Linux: agent/data/
    if (storageDir) {
      this.storageDir = storageDir;
    } else if (process.platform === 'win32') {
      const programData = process.env.ProgramData || 'C:\\ProgramData';
      this.storageDir = path.join(programData, 'Avantis');
    } else {
      this.storageDir = path.resolve(__dirname, '..', '..', '..', 'data');
    }

    this.identityFilePath = path.join(this.storageDir, 'device_identity.json');
    this.cachedIdentity = null;
  }

  execPowerShell(command, timeoutMs = 4000) {
    if (process.platform !== 'win32') return null;
    try {
      const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${command.replace(/"/g, '\\"')}"`, {
        timeout: timeoutMs,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true
      });
      return raw ? raw.trim() : null;
    } catch {
      return null;
    }
  }

  getWindowsMachineGuid() {
    if (process.platform !== 'win32') return null;
    try {
      const ps = `(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid -ErrorAction SilentlyContinue).MachineGuid`;
      const val = this.execPowerShell(ps, 3000);
      return val && val.length > 10 ? val.trim() : null;
    } catch {
      return null;
    }
  }

  getWindowsMotherboardSerial() {
    if (process.platform !== 'win32') return null;
    try {
      const ps = `(Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue | Select-Object -ExpandProperty SerialNumber)`;
      const val = this.execPowerShell(ps, 3000);
      return val && !['None', 'Default string', 'To be filled by O.E.M.'].includes(val.trim()) ? val.trim() : null;
    } catch {
      return null;
    }
  }

  getWindowsBiosUuid() {
    if (process.platform !== 'win32') return null;
    try {
      const ps = `(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction SilentlyContinue | Select-Object -ExpandProperty UUID)`;
      const val = this.execPowerShell(ps, 3000);
      return val && val.length > 15 ? val.trim() : null;
    } catch {
      return null;
    }
  }

  /**
   * Generates or retrieves persistent installation ID
   */
  getOrCreateInstallationId() {
    try {
      if (fs.existsSync(this.identityFilePath)) {
        const raw = fs.readFileSync(this.identityFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.installationId) {
          return parsed.installationId;
        }
      }
    } catch {}

    const newId = 'AVT-INST-' + crypto.randomUUID().toUpperCase();
    this.persistInstallationData({ installationId: newId });
    return newId;
  }

  persistInstallationData(data) {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      let existing = {};
      if (fs.existsSync(this.identityFilePath)) {
        existing = JSON.parse(fs.readFileSync(this.identityFilePath, 'utf8') || '{}');
      }
      const merged = { ...existing, ...data, updatedAt: new Date().toISOString() };
      fs.writeFileSync(this.identityFilePath, JSON.stringify(merged, null, 2), 'utf8');
    } catch (err) {
      console.warn('[SystemIdentityProvider] Could not persist identity to disk:', err.message);
    }
  }

  /**
   * Resolves complete machine hardware identity
   */
  async discover(systemSpecs = {}) {
    const isWin = process.platform === 'win32';
    const installationId = this.getOrCreateInstallationId();

    let biosUuid = systemSpecs.uuid || null;
    let mbSerial = (systemSpecs.motherboard && systemSpecs.motherboard.serial) || null;
    let machineGuid = null;
    let systemSerial = systemSpecs.serialNumber || null;

    if (isWin) {
      machineGuid = this.getWindowsMachineGuid();
      const psUuid = this.getWindowsBiosUuid();
      if (psUuid) biosUuid = psUuid;
      const psMb = this.getWindowsMotherboardSerial();
      if (psMb) mbSerial = psMb;
    } else {
      // In dev environment on Linux: read machine-id if available
      try {
        if (fs.existsSync('/etc/machine-id')) {
          machineGuid = fs.readFileSync('/etc/machine-id', 'utf8').trim();
        }
      } catch {}
    }

    // Build multi-factor composite hardware identity
    const identityComponents = [
      `PLATFORM:${process.platform}`,
      `UUID:${biosUuid || 'UNKNOWN_UUID'}`,
      `SYS_SERIAL:${systemSerial || 'UNKNOWN_SERIAL'}`,
      `MB_SERIAL:${mbSerial || 'UNKNOWN_MB'}`,
      `MACHINE_GUID:${machineGuid || 'UNKNOWN_GUID'}`,
      `CPU_MODEL:${systemSpecs.cpuModel || os.cpus()[0]?.model || 'UNKNOWN_CPU'}`
    ];

    const compositeString = identityComponents.join('|');
    const hardwareFingerprint = crypto.createHash('sha256').update(compositeString).digest('hex');

    // Deterministic hardware device ID
    const shortHardwareHash = hardwareFingerprint.substring(0, 12).toUpperCase();
    const deviceId = `AVT-DEV-${shortHardwareHash}`;

    this.cachedIdentity = {
      deviceId,
      installationId,
      hardwareIdentityHash: hardwareFingerprint,
      isProductionWindows: isWin,
      targetPlatform: 'Windows 10/11',
      runtimePlatform: process.platform,
      hostname: os.hostname(),
      rootsOfTrust: {
        biosUuid: biosUuid ? `${biosUuid.substring(0, 8)}...` : null,
        machineGuid: machineGuid ? `${machineGuid.substring(0, 8)}...` : null,
        systemSerial: systemSerial ? `${systemSerial.substring(0, 4)}...` : null,
        motherboardSerialPresent: !!mbSerial
      }
    };

    return this.cachedIdentity;
  }
}

module.exports = SystemIdentityProvider;
