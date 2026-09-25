const { execSync } = require('child_process');
const si = require('systeminformation');

class PowerProvider {
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
    let bat = {};

    try {
      bat = await si.battery().catch(() => ({}));
    } catch (err) {
      console.warn('[PowerProvider] systeminformation error:', err.message);
    }

    let hasBattery = !!bat.hasBattery;
    let currentPercent = (typeof bat.percent === 'number' && bat.percent >= 0) ? Math.round(bat.percent) : null;
    let isCharging = typeof bat.isCharging === 'boolean' ? bat.isCharging : false;
    let acConnected = bat.acConnected !== undefined ? !!bat.acConnected : !hasBattery;
    let designCapacityMwh = null;
    let fullChargeCapacityMwh = null;
    let healthPercent = null;
    let timeRemainingMinutes = (typeof bat.timeRemaining === 'number' && bat.timeRemaining > 0) ? Math.round(bat.timeRemaining) : null;

    // Windows Deep Battery Query
    if (process.platform === 'win32') {
      try {
        const ps = `
          $ErrorActionPreference = 'SilentlyContinue';
          $b = Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining, BatteryStatus, DesignCapacity, FullChargeCapacity, EstimatedRunTime;
          if ($b) { $b | ConvertTo-Json } else { '{}' }
        `.trim().replace(/\s+/g, ' ');

        const raw = this.execPowerShell(ps, 3500);
        if (raw && raw !== '{}') {
          const parsed = JSON.parse(raw);
          hasBattery = true;
          if (parsed.EstimatedChargeRemaining !== undefined && parsed.EstimatedChargeRemaining !== null) {
            currentPercent = parseInt(parsed.EstimatedChargeRemaining, 10);
          }
          if (parsed.BatteryStatus !== undefined) {
            // 2 = Unknown, 1 = Discharging, 2 = Unknown, 6 = Charging
            isCharging = parsed.BatteryStatus === 2 || parsed.BatteryStatus === 6;
          }
          if (parsed.DesignCapacity) designCapacityMwh = parseInt(parsed.DesignCapacity, 10);
          if (parsed.FullChargeCapacity) fullChargeCapacityMwh = parseInt(parsed.FullChargeCapacity, 10);
          if (designCapacityMwh > 0 && fullChargeCapacityMwh > 0) {
            healthPercent = Math.min(100, Math.round((fullChargeCapacityMwh / designCapacityMwh) * 100));
          }
          if (parsed.EstimatedRunTime && parsed.EstimatedRunTime < 71582788) {
            timeRemainingMinutes = parseInt(parsed.EstimatedRunTime, 10);
          }
        } else {
          // No Win32_Battery instance found -> Stationary Desktop / AC
          hasBattery = false;
        }
      } catch {}
    }

    let powerSource = 'AC Mains Power';
    if (hasBattery) {
      powerSource = isCharging ? 'AC Power (Charging)' : 'Battery Power';
    }

    return {
      hasBattery,
      powerSource,
      acConnected: hasBattery ? (isCharging || acConnected) : true,
      currentPercent: hasBattery ? currentPercent : null,
      isCharging: hasBattery ? isCharging : false,
      healthPercent: hasBattery ? healthPercent : null,
      designCapacityMwh: hasBattery ? designCapacityMwh : null,
      fullChargeCapacityMwh: hasBattery ? fullChargeCapacityMwh : null,
      timeRemainingMinutes: hasBattery ? timeRemainingMinutes : null,
      statusMessage: hasBattery
        ? `${currentPercent !== null ? currentPercent + '% Charge' : 'Battery Active'} · ${isCharging ? 'Charging' : 'On Battery'}${healthPercent ? ' (Health: ' + healthPercent + '%)' : ''}`
        : 'Continuous AC mains power connected (No battery present)'
    };
  }
}

module.exports = PowerProvider;
