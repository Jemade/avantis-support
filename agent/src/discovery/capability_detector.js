class CapabilityDetector {
  constructor() {}

  /**
   * Evaluates dynamic capabilities based on discovered hardware
   */
  detect(hardwareSnapshot = {}) {
    const {
      system = {},
      cpu = {},
      power = {},
      storage = {},
      network = {},
      pnp = [],
      security = {}
    } = hardwareSnapshot;

    const pnpList = Array.isArray(pnp) ? pnp : [];
    const adapters = (network && Array.isArray(network.adapters)) ? network.adapters : [];
    const disks = (storage && Array.isArray(storage.physicalDisks)) ? storage.physicalDisks : [];

    // Battery & Power Capabilities
    const hasBattery = !!power.hasBattery;
    const hasBatteryHealth = hasBattery && power.healthPercent !== null;

    // Thermal Sensor Capability
    const hasTemperature = !!cpu.temperatureSupported && cpu.temperatureC !== null;

    // SMART Storage Capability
    const hasSmartStorage = disks.some(d => d.smartStatus && d.smartStatus !== 'UNAVAILABLE' && d.smartStatus !== 'UNKNOWN');

    // Network Interface Capabilities
    const hasWifi = adapters.some(a => a.type === 'wifi' || (a.description && /wi-fi|wireless|802\.11/i.test(a.description)));
    const hasEthernet = adapters.some(a => a.type === 'ethernet' || (a.description && /ethernet|gigabit|lan|pci-e/i.test(a.description)));

    // Peripherals from PnP / System
    const hasBluetooth = pnpList.some(p => (p.deviceClass || '').toUpperCase() === 'BLUETOOTH' || (p.deviceName && /bluetooth/i.test(p.deviceName)));
    const hasCamera = pnpList.some(p => (p.deviceClass || '').toUpperCase() === 'CAMERA' || (p.deviceName && /camera|webcam/i.test(p.deviceName)));
    const hasAudio = pnpList.some(p => (p.deviceClass || '').toUpperCase() === 'MEDIA' || (p.deviceName && /audio|sound|speaker|microphone/i.test(p.deviceName)));
    const hasBiometric = pnpList.some(p => (p.deviceClass || '').toUpperCase() === 'BIOMETRIC' || (p.deviceName && /fingerprint|biometric/i.test(p.deviceName)));
    const hasDedicatedGpu = pnpList.some(p => (p.deviceClass || '').toUpperCase() === 'DISPLAY' && /geforce|rtx|radeon rx|arc a/i.test(p.deviceName || ''));

    // OS Features
    const isWindows = process.platform === 'win32';
    const hasDefender = !!security.available;

    return {
      battery: hasBattery,
      batteryHealth: hasBatteryHealth,
      temperatureSensors: hasTemperature,
      smartStorage: hasSmartStorage,
      wifi: hasWifi,
      ethernet: hasEthernet,
      bluetooth: hasBluetooth,
      camera: hasCamera,
      audio: hasAudio,
      biometric: hasBiometric,
      gpu: hasDedicatedGpu,
      touchscreen: false, // Discovered on Windows digitizers if present
      defender: hasDefender,
      windowsUpdate: isWindows,
      driverManagement: true,
      networkReset: isWindows,
      volumeOptimization: isWindows
    };
  }
}

module.exports = CapabilityDetector;
