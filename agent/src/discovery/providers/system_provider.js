const os = require('os');
const { execSync } = require('child_process');
const si = require('systeminformation');

class SystemProvider {
  constructor() {}

  execPowerShell(command, timeoutMs = 5000) {
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
    let sys = {};
    let bios = {};
    let bb = {};
    let osInfo = {};
    let chassis = {};

    try {
      [sys, bios, bb, osInfo, chassis] = await Promise.all([
        si.system().catch(() => ({})),
        si.bios().catch(() => ({})),
        si.baseboard().catch(() => ({})),
        si.osInfo().catch(() => ({})),
        si.chassis().catch(() => ({}))
      ]);
    } catch (err) {
      console.warn('[SystemProvider] systeminformation error:', err.message);
    }

    const invalidStrings = ['Default string', 'System Product Name', 'To be filled by O.E.M.', 'System Version', 'None', '-', 'N/A', ''];
    const clean = (val) => {
      if (!val || typeof val !== 'string') return null;
      const t = val.trim();
      if (invalidStrings.includes(t) || t.toLowerCase().includes('o.e.m.')) return null;
      return t;
    };

    // Chassis classification
    let chassisType = 'Desktop';
    const cTypeRaw = chassis.type || '';
    if (/laptop|notebook|portable|subnotebook/i.test(cTypeRaw)) {
      chassisType = 'Laptop';
    } else if (/all.in.one|aio/i.test(cTypeRaw)) {
      chassisType = 'All-in-One';
    } else if (/mini|micro|compact|embedded/i.test(cTypeRaw)) {
      chassisType = 'Mini PC';
    } else if (/tablet/i.test(cTypeRaw)) {
      chassisType = 'Tablet';
    } else if (/desktop|tower|workstation/i.test(cTypeRaw)) {
      chassisType = 'Desktop';
    }

    // Windows Deep Inspection for Uptime & Pending Restart
    let winUptimeSeconds = Math.round(os.uptime());
    let pendingRestart = false;
    let installDate = null;
    let windowsBuild = clean(osInfo.build) || clean(os.release());

    if (process.platform === 'win32') {
      try {
        const ps = `
          $ErrorActionPreference = 'SilentlyContinue';
          $os = Get-CimInstance Win32_OperatingSystem | Select-Object LastBootUpTime, InstallDate, BuildNumber, Caption;
          $cbs = Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending";
          $wu = Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired";
          [PSCustomObject]@{
            lastBoot = if ($os.LastBootUpTime) { $os.LastBootUpTime.ToString("o") } else { $null };
            installDate = if ($os.InstallDate) { $os.InstallDate.ToString("o") } else { $null };
            build = $os.BuildNumber;
            caption = $os.Caption;
            rebootPending = ($cbs -or $wu);
          } | ConvertTo-Json
        `.trim().replace(/\s+/g, ' ');

        const raw = this.execPowerShell(ps, 4000);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.build) windowsBuild = parsed.build;
          if (parsed.rebootPending) pendingRestart = !!parsed.rebootPending;
          if (parsed.installDate) installDate = parsed.installDate;
        }
      } catch {}
    }

    return {
      manufacturer: clean(sys.manufacturer) || clean(bb.manufacturer) || null,
      systemManufacturer: clean(sys.manufacturer) || null,
      productName: clean(sys.model) || null,
      model: clean(sys.model) || null,
      sku: clean(sys.sku) || null,
      systemFamily: clean(sys.version) || null,
      serialNumber: clean(sys.serial) || clean(bios.serial) || null,
      uuid: clean(sys.uuid) || null,
      bios: {
        vendor: clean(bios.vendor) || null,
        version: clean(bios.version) || null,
        releaseDate: clean(bios.releaseDate) || null
      },
      motherboard: {
        manufacturer: clean(bb.manufacturer) || null,
        model: clean(bb.model) || null,
        version: clean(bb.version) || null,
        serial: clean(bb.serial) || null
      },
      os: {
        platform: os.platform(),
        distro: clean(osInfo.distro) || clean(osInfo.name) || os.type(),
        caption: clean(osInfo.distro) || `${os.type()} ${os.release()}`,
        version: clean(osInfo.release) || os.release(),
        build: windowsBuild || null,
        architecture: clean(osInfo.arch) || os.arch(),
        uptimeSeconds: winUptimeSeconds,
        installDate,
        pendingRestart
      },
      chassis: {
        type: chassisType,
        rawType: cTypeRaw || null
      },
      hostname: os.hostname() || 'PC',
      user: os.userInfo ? os.userInfo().username : null
    };
  }
}

module.exports = SystemProvider;
