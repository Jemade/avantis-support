const os = require('os');
const { execSync } = require('child_process');
const si = require('systeminformation');

class CpuProvider {
  constructor() {}

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

  async discover() {
    let cpu = {};
    let load = {};
    let temp = {};

    try {
      [cpu, load, temp] = await Promise.all([
        si.cpu().catch(() => ({})),
        si.currentLoad().catch(() => ({})),
        si.cpuTemperature().catch(() => ({}))
      ]);
    } catch (err) {
      console.warn('[CpuProvider] systeminformation error:', err.message);
    }

    const cpus = os.cpus() || [];
    const firstCpu = cpus[0] || {};

    const brand = cpu.brand ? cpu.brand.trim() : (firstCpu.model ? firstCpu.model.trim() : null);
    const manufacturer = cpu.manufacturer ? cpu.manufacturer.trim() : null;
    const physicalCores = cpu.physicalCores || Math.max(1, Math.floor(cpus.length / 2)) || null;
    const logicalProcessors = cpu.cores || cpus.length || null;

    let baseClockGhz = cpu.speed ? parseFloat(Number(cpu.speed).toFixed(2)) : (firstCpu.speed ? parseFloat((firstCpu.speed / 1000).toFixed(2)) : null);
    let currentClockGhz = cpu.speed ? parseFloat(Number(cpu.speed).toFixed(2)) : null;

    // Load percentage
    let loadPercent = null;
    if (typeof load.currentLoad === 'number' && !isNaN(load.currentLoad)) {
      loadPercent = Math.min(100, Math.max(0, Math.round(load.currentLoad)));
    }

    // Genuine Temperature Inspection
    let temperatureC = null;
    let temperatureSupported = false;
    let temperatureReason = 'No thermal sensor detected';

    // 1. Check systeminformation cpuTemperature reading
    if (typeof temp.main === 'number' && temp.main > 0 && temp.main < 125) {
      temperatureC = Math.round(temp.main);
      temperatureSupported = true;
      temperatureReason = 'Hardware thermal diode';
    }

    // 2. On Windows, check ACPI / WMI thermal zones if systeminformation was null
    if (!temperatureSupported && process.platform === 'win32') {
      try {
        const ps = `
          $ErrorActionPreference = 'SilentlyContinue';
          $z = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object -First 1 CurrentTemperature;
          if ($z -and $z.CurrentTemperature -gt 2732) {
            [math]::Round(($z.CurrentTemperature - 2732) / 10)
          } else {
            $perf = Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue | Select-Object -First 1 HighPrecisionTemperature;
            if ($perf -and $perf.HighPrecisionTemperature -gt 2732) {
              [math]::Round(($perf.HighPrecisionTemperature - 2732) / 10)
            } else { $null }
          }
        `.trim().replace(/\s+/g, ' ');

        const raw = this.execPowerShell(ps, 3500);
        const parsed = raw ? parseInt(raw, 10) : null;
        if (parsed !== null && !isNaN(parsed) && parsed > 15 && parsed < 125) {
          temperatureC = parsed;
          temperatureSupported = true;
          temperatureReason = 'ACPI thermal zone sensor';
        }
      } catch {}
    }

    if (!temperatureSupported) {
      temperatureReason = 'Temperature sensor is not exposed by this hardware or hypervisor';
    }

    return {
      manufacturer,
      brand,
      model: brand,
      architecture: os.arch(),
      physicalCores,
      logicalProcessors,
      baseClockGhz,
      currentClockGhz,
      loadPercent,
      temperatureC,
      temperatureSupported,
      temperatureReason
    };
  }
}

module.exports = CpuProvider;
