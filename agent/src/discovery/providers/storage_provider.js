const os = require('os');
const { execSync } = require('child_process');
const si = require('systeminformation');

class StorageProvider {
  constructor() {}

  execPowerShell(command, timeoutMs = 6000) {
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
    let disksRaw = [];
    let fsRaw = [];

    try {
      [disksRaw, fsRaw] = await Promise.all([
        si.diskLayout().catch(() => ([])),
        si.fsSize().catch(() => ([]))
      ]);
    } catch (err) {
      console.warn('[StorageProvider] systeminformation error:', err.message);
    }

    // --- 1. Physical Disks ---
    let physicalDisks = [];
    if (Array.isArray(disksRaw) && disksRaw.length > 0) {
      physicalDisks = disksRaw.map((d, i) => {
        const sizeGb = d.size ? parseFloat((d.size / (1024 ** 3)).toFixed(1)) : null;
        let smart = 'UNAVAILABLE';
        if (d.smartStatus && d.smartStatus !== 'unknown') {
          smart = d.smartStatus.toUpperCase() === 'OK' ? 'HEALTHY' : d.smartStatus.toUpperCase();
        }

        return {
          id: d.device || `Disk_${i}`,
          name: d.name ? d.name.trim() : (d.model ? d.model.trim() : `Physical Disk ${i + 1}`),
          model: d.name || d.model || 'Generic Storage Device',
          vendor: d.vendor && !d.vendor.includes('0000') ? d.vendor.trim() : null,
          busType: d.interfaceType || d.type || 'SATA/NVMe',
          mediaType: d.type === 'NVMe' ? 'NVMe SSD' : (d.type || 'Fixed Disk'),
          sizeBytes: d.size || 0,
          sizeGB: sizeGb,
          serialNumber: d.serialNum ? d.serialNum.trim() : null,
          smartStatus: smart,
          temperatureC: typeof d.temperature === 'number' && d.temperature > 0 ? d.temperature : null,
          operationalStatus: 'OK'
        };
      });
    }

    // Windows Deep Physical Disk & SMART Query
    if (process.platform === 'win32') {
      try {
        const ps = `
          $ErrorActionPreference = 'SilentlyContinue';
          $pDisks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue | Select-Object DeviceId, FriendlyName, MediaType, BusType, Size, OperationalStatus, HealthStatus);
          $rel = @(Get-StorageReliabilityCounter -ErrorAction SilentlyContinue | Select-Object DeviceId, ReadErrorsTotal, WriteErrorsTotal, Wear, Temperature);
          [PSCustomObject]@{
            pDisks = $pDisks;
            rel = $rel;
          } | ConvertTo-Json -Depth 3
        `.trim().replace(/\s+/g, ' ');

        const raw = this.execPowerShell(ps, 5000);
        if (raw) {
          const parsed = JSON.parse(raw);
          const pList = Array.isArray(parsed.pDisks) ? parsed.pDisks : (parsed.pDisks ? [parsed.pDisks] : []);
          const rList = Array.isArray(parsed.rel) ? parsed.rel : (parsed.rel ? [parsed.rel] : []);

          if (pList.length > 0) {
            physicalDisks = pList.map((pd, idx) => {
              const rel = rList.find(r => String(r.DeviceId) === String(pd.DeviceId)) || rList[idx] || {};
              const rawHealth = (pd.HealthStatus || '').toUpperCase();
              let smartStatus = 'UNAVAILABLE';
              if (rawHealth === 'HEALTHY') smartStatus = 'HEALTHY';
              else if (rawHealth === 'WARNING') smartStatus = 'WARNING';
              else if (rawHealth === 'UNHEALTHY') smartStatus = 'CRITICAL';

              const wear = typeof rel.Wear === 'number' ? rel.Wear : (rel.Wear ? parseInt(rel.Wear, 10) : null);
              const readErr = typeof rel.ReadErrorsTotal === 'number' ? rel.ReadErrorsTotal : (rel.ReadErrorsTotal ? parseInt(rel.ReadErrorsTotal, 10) : null);
              const temp = typeof rel.Temperature === 'number' ? rel.Temperature : (rel.Temperature ? parseInt(rel.Temperature, 10) : null);

              const sizeGb = pd.Size ? parseFloat((pd.Size / (1024 ** 3)).toFixed(1)) : null;

              return {
                id: `PhysicalDrive${pd.DeviceId || idx}`,
                name: pd.FriendlyName || `Physical Disk ${idx + 1}`,
                model: pd.FriendlyName || 'Storage Device',
                vendor: null,
                busType: pd.BusType || 'NVMe/SATA',
                mediaType: pd.MediaType ? (pd.MediaType === 'SSD' ? 'SSD' : pd.MediaType) : 'Storage Disk',
                sizeBytes: pd.Size || 0,
                sizeGB: sizeGb,
                serialNumber: null,
                smartStatus,
                wearPercent: wear,
                readErrors: readErr,
                temperatureC: temp,
                operationalStatus: pd.OperationalStatus || 'OK'
              };
            });
          }
        }
      } catch {}
    }

    // --- 2. Logical Volumes (Partitions / Mounts) ---
    const volumes = [];
    if (Array.isArray(fsRaw) && fsRaw.length > 0) {
      // Filter out special or zero-size mounts
      const validMounts = fsRaw.filter(f => f && f.size > 1024 * 1024 * 50); // > 50MB
      validMounts.forEach(v => {
        const totalGb = parseFloat((v.size / (1024 ** 3)).toFixed(1));
        const usedGb = parseFloat((v.used / (1024 ** 3)).toFixed(1));
        const freeGb = parseFloat(((v.size - v.used) / (1024 ** 3)).toFixed(1));
        const pct = v.use !== undefined && v.use !== null ? Math.round(v.use) : Math.round((v.used / v.size) * 100);

        const mountName = v.mount || v.fs;
        const isSystem = mountName === 'C:' || mountName === '/' || mountName.toLowerCase().startsWith('c:');

        volumes.push({
          mount: mountName,
          label: isSystem ? `System (${mountName})` : `Volume (${mountName})`,
          fileSystem: v.type || 'NTFS',
          totalGB: totalGb,
          usedGB: usedGb,
          freeGB: freeGb,
          usedPercent: pct,
          isSystem
        });
      });
    }

    // Primary system volume summary
    const primaryVolume = volumes.find(v => v.isSystem) || volumes[0] || null;
    const primaryDisk = physicalDisks[0] || null;

    let overallSmart = 'UNAVAILABLE';
    if (physicalDisks.length > 0) {
      if (physicalDisks.some(d => d.smartStatus === 'CRITICAL')) overallSmart = 'CRITICAL';
      else if (physicalDisks.some(d => d.smartStatus === 'WARNING')) overallSmart = 'WARNING';
      else if (physicalDisks.every(d => d.smartStatus === 'HEALTHY')) overallSmart = 'HEALTHY';
      else if (physicalDisks.some(d => d.smartStatus === 'HEALTHY')) overallSmart = 'HEALTHY';
    }

    return {
      physicalDisks,
      volumes,
      primaryVolume,
      primaryDisk,
      smartStatus: overallSmart,
      // Summary metrics for backward compatibility with status API
      totalGB: primaryVolume ? primaryVolume.totalGB : (primaryDisk ? primaryDisk.sizeGB : null),
      freeGB: primaryVolume ? primaryVolume.freeGB : null,
      usedGB: primaryVolume ? primaryVolume.usedGB : null,
      usedPercent: primaryVolume ? primaryVolume.usedPercent : null,
      driveType: primaryDisk ? primaryDisk.mediaType : 'SSD'
    };
  }
}

module.exports = StorageProvider;
