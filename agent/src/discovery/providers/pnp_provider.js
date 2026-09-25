const { execSync } = require('child_process');
const si = require('systeminformation');

class PnpProvider {
  constructor() {}

  execPowerShell(command, timeoutMs = 8000) {
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

  extractHardwareId(deviceId) {
    if (!deviceId) return '';
    const match = deviceId.match(/(VEN_[0-9A-Fa-f]{4}&DEV_[0-9A-Fa-f]{4})/i) ||
                  deviceId.match(/(PCI\\[A-Za-z0-9_&]+)/i) ||
                  deviceId.match(/(ACPI\\[A-Za-z0-9_&]+)/i) ||
                  deviceId.match(/(USB\\VID_[0-9A-Fa-f]{4}&PID_[0-9A-Fa-f]{4})/i);
    return match ? match[1].toUpperCase() : deviceId.toUpperCase();
  }

  async discover() {
    const devices = [];

    // 1. Cross-platform baseline using systeminformation
    try {
      const [gpus, audio, usb, net] = await Promise.all([
        si.graphics().catch(() => ({ controllers: [] })),
        si.audio().catch(() => ([])),
        si.usb().catch(() => ([])),
        si.networkInterfaces().catch(() => ([]))
      ]);

      (gpus.controllers || []).forEach(g => {
        if (g && g.model) {
          devices.push({
            deviceName: g.model,
            deviceClass: 'DISPLAY',
            manufacturer: g.vendor || null,
            driverVersion: g.driverVersion || null,
            driverDate: null,
            deviceId: g.busAddress || 'PCI_DISPLAY',
            hardwareId: this.extractHardwareId(g.busAddress || g.model),
            status: 'OK'
          });
        }
      });

      (audio || []).forEach(a => {
        if (a && a.name) {
          devices.push({
            deviceName: a.name,
            deviceClass: 'MEDIA',
            manufacturer: a.manufacturer || null,
            driverVersion: a.driverVersion || null,
            driverDate: null,
            deviceId: 'AUDIO_DEVICE',
            hardwareId: this.extractHardwareId(a.name),
            status: a.status || 'OK'
          });
        }
      });

      (usb || []).forEach(u => {
        if (u && u.name) {
          devices.push({
            deviceName: u.name,
            deviceClass: 'USB',
            manufacturer: u.vendor || null,
            driverVersion: null,
            driverDate: null,
            deviceId: `USB_${u.id || ''}`,
            hardwareId: this.extractHardwareId(u.id || u.name),
            status: 'OK'
          });
        }
      });
    } catch (err) {
      console.warn('[PnpProvider] systeminformation error:', err.message);
    }

    // 2. Windows Deep Signed PnP Driver Query
    if (process.platform === 'win32') {
      try {
        const ps = `
          $ErrorActionPreference = 'SilentlyContinue';
          $drivers = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { 
            $_.DeviceName -ne $null -and ($_.DeviceClass -in @('DISPLAY', 'MEDIA', 'NET', 'SCSIADAPTER', 'FIRMWARE', 'SYSTEM', 'BLUETOOTH', 'CAMERA', 'BIOMETRIC', 'USB'))
          } | Select-Object DeviceName, DriverVersion, DriverDate, DeviceID, Manufacturer, DeviceClass);
          $drivers | ConvertTo-Json -Depth 3
        `.trim().replace(/\s+/g, ' ');

        const raw = this.execPowerShell(ps, 8000);
        if (raw) {
          const parsed = JSON.parse(raw);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          if (list.length > 0) {
            // Replace cross-platform estimates with Windows signed drivers
            devices.length = 0;
            list.forEach(item => {
              if (!item.DeviceName) return;
              devices.push({
                deviceName: item.DeviceName.trim(),
                deviceClass: item.DeviceClass || 'SYSTEM',
                manufacturer: item.Manufacturer || null,
                driverVersion: item.DriverVersion || null,
                driverDate: item.DriverDate || null,
                deviceId: item.DeviceID || '',
                hardwareId: this.extractHardwareId(item.DeviceID || ''),
                status: 'OK'
              });
            });
          }
        }
      } catch {}
    }

    return devices;
  }
}

module.exports = PnpProvider;
