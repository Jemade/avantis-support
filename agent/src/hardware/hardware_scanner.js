const HardwareDiscoveryService = require('../discovery/hardware_discovery');

class HardwareScanner {
  constructor(discoveryService = null) {
    this.discoveryService = discoveryService || new HardwareDiscoveryService();
  }

  async scanDisks(snapshot = null) {
    const s = snapshot || await this.discoveryService.getFullSnapshot();
    const storage = s.storage || {};
    const disks = storage.physicalDisks || [];
    const volumes = storage.volumes || [];

    if (disks.length === 0 && volumes.length === 0) {
      return {
        status: 'WARNING',
        reading: 'Storage subsystem: No physical drives reported by OS storage controller.',
        threshold: 'Physical Storage Detected == True',
        details: { disksCount: 0, volumesCount: 0, smartStatus: 'UNAVAILABLE' }
      };
    }

    const primaryDisk = storage.primaryDisk || disks[0] || {};
    const primaryVol = storage.primaryVolume || volumes[0] || {};

    let status = 'PASS';
    let smart = primaryDisk.smartStatus || storage.smartStatus || 'UNAVAILABLE';
    let msg = '';

    if (smart === 'CRITICAL' || smart === 'FAIL') {
      status = 'FAIL';
      msg = `${primaryDisk.name || 'Primary Storage'} — Critical disk fault detected: SMART ${smart}`;
    } else if (smart === 'WARNING') {
      status = 'WARNING';
      msg = `${primaryDisk.name || 'Primary Storage'} — Elevated wear or sector reallocations detected`;
    } else {
      const capStr = primaryDisk.sizeGB ? `${primaryDisk.sizeGB} GB` : (primaryVol.totalGB ? `${primaryVol.totalGB} GB` : '');
      const smartStr = (smart !== 'UNAVAILABLE' && smart !== 'UNKNOWN') ? `Health: ${smart}` : 'Health telemetry unavailable';
      msg = `${primaryDisk.name || primaryDisk.model || 'Storage Disk'} ${capStr} (${primaryDisk.mediaType || 'Fixed Drive'}, ${smartStr})`.trim();
    }

    return {
      status,
      reading: msg,
      threshold: 'SMART Status == HEALTHY (Critical on FAILING, Warning on ELEVATED_WEAR)',
      details: {
        friendlyName: primaryDisk.name || primaryDisk.model || 'System Disk',
        mediaType: primaryDisk.mediaType || 'Storage',
        busType: primaryDisk.busType || 'Unknown',
        sizeGB: primaryDisk.sizeGB || primaryVol.totalGB,
        smartStatus: smart,
        wearPercent: primaryDisk.wearPercent || null,
        readErrors: primaryDisk.readErrors || null,
        volumesCount: volumes.length
      }
    };
  }

  async scanBattery(snapshot = null) {
    const s = snapshot || await this.discoveryService.getFullSnapshot();
    const power = s.power || {};

    if (!power.hasBattery) {
      return {
        status: 'PASS',
        reading: 'Continuous AC Mains Power Supply (No battery present on this hardware configuration)',
        threshold: 'Stationary Power System Verified',
        details: { isLaptop: false, hasBattery: false, powerSource: power.powerSource }
      };
    }

    const currentPercent = power.currentPercent;
    const health = power.healthPercent;
    let status = 'PASS';

    if (health !== null && health < 40) {
      status = 'FAIL';
    } else if (health !== null && health < 60) {
      status = 'WARNING';
    }

    const healthStr = health !== null ? `${health}% Health Retention` : 'Retention not reported';
    const chargeStr = currentPercent !== null ? `${currentPercent}% Charge` : 'Charge level not reported';

    return {
      status,
      reading: `Battery Subsystem: ${chargeStr} (${healthStr}, ${power.isCharging ? 'Charging' : 'On Battery'})`,
      threshold: 'Capacity >= 60% of Design (Warning <60%, Fail <40%)',
      details: {
        isLaptop: true,
        hasBattery: true,
        currentChargePercent: currentPercent,
        healthRetentionPercent: health,
        designCapacityMwh: power.designCapacityMwh,
        fullChargeCapacityMwh: power.fullChargeCapacityMwh,
        isCharging: power.isCharging
      }
    };
  }

  async scanMemory(snapshot = null) {
    const s = snapshot || await this.discoveryService.getFullSnapshot();
    const memory = s.memory || {};

    const totalGB = memory.totalGB;
    const usedPercent = memory.usedPercent;
    const modules = memory.modules || [];

    if (!totalGB) {
      return {
        status: 'WARNING',
        reading: 'Memory integrity: Physical memory capacity could not be queried',
        threshold: 'Total Memory > 0 GB',
        details: { totalGB: null }
      };
    }

    let status = 'PASS';
    if (usedPercent !== null && usedPercent > 95) {
      status = 'WARNING';
    }

    const modStr = modules.length > 0 ? `across ${modules.length} channel(s)` : 'physical memory';
    const reading = `${totalGB} GB RAM ${modStr} (${usedPercent !== null ? usedPercent + '% current utilization' : 'Active'})`;

    return {
      status,
      reading,
      threshold: 'Memory Utilization < 95%, Physical Module Detection OK',
      details: {
        totalGB,
        usedGB: memory.usedGB,
        availableGB: memory.availableGB,
        usedPercent,
        moduleCount: modules.length,
        modules: modules.map(m => ({ slot: m.slot, capacityGB: m.capacityGB, speedMHz: m.speedMHz }))
      }
    };
  }

  async scanThermals(snapshot = null) {
    const s = snapshot || await this.discoveryService.getFullSnapshot();
    const cpu = s.cpu || {};

    if (!cpu.temperatureSupported || cpu.temperatureC === null) {
      return {
        status: 'PASS',
        reading: 'Thermal Sensors: Onboard thermal sensor reading is unavailable on this hardware or hypervisor',
        threshold: 'Sensor Availability / Normal Operating Envelope',
        details: { temperatureC: null, supported: false, reason: cpu.temperatureReason }
      };
    }

    const temp = cpu.temperatureC;
    let status = 'PASS';
    if (temp >= 100) {
      status = 'FAIL';
    } else if (temp >= 90) {
      status = 'WARNING';
    }

    return {
      status,
      reading: `Processor Thermal Diode: ${temp}°C (${status === 'PASS' ? 'Normal Operating Thermal Profile' : 'Elevated Heat Load'})`,
      threshold: 'CPU Temp < 90°C (Warning >=90°C, Fail >=100°C)',
      details: { temperatureC: temp, supported: true }
    };
  }

  async scanAll() {
    const snapshot = await this.discoveryService.getFullSnapshot();
    const [disk, battery, memory, thermals] = await Promise.all([
      this.scanDisks(snapshot),
      this.scanBattery(snapshot),
      this.scanMemory(snapshot),
      this.scanThermals(snapshot)
    ]);

    const components = [
      { name: 'Primary Storage (Disk Health & Capacity)', ...disk },
      { name: 'Power Subsystem (AC / Battery Health)', ...battery },
      { name: 'Physical RAM (Memory Integrity)', ...memory },
      { name: 'Thermal Sensors (Processor / Chassis Heat)', ...thermals }
    ];

    let overallStatus = 'PASS';
    if (components.some(c => c.status === 'FAIL')) {
      overallStatus = 'FAIL';
    } else if (components.some(c => c.status === 'WARNING')) {
      overallStatus = 'WARNING';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      components,
      limitationsNotice: 'Hardware diagnostics are conducted using genuine OS-level telemetry (ACPI, WMI, SMART, powercfg). Proprietary pre-boot firmware diagnostics require vendor-specific UEFI environment.',
      summaryMessage: overallStatus === 'PASS' 
        ? 'All physical hardware subsystems passed telemetry verification.' 
        : (overallStatus === 'WARNING' ? 'Hardware telemetry detected warnings on one or more components.' : 'Hardware telemetry detected critical component faults.')
    };
  }
}

module.exports = HardwareScanner;
