/**
 * Avantis Device Catalog (Authoritative Backend Reference)
 * Maintains specifications, driver catalogs, supported capabilities,
 * and hardware identifier signatures for official Avantis-supplied Windows PCs.
 */

const AVANTIS_DEVICE_CATALOG = {
  'AVANTIS-LAPTOP-ELITE': {
    id: 'avantis-laptop-elite',
    name: 'Avantis Laptop Elite 15',
    category: 'laptop',
    family: 'Elite',
    formFactor: 'Laptop 15.6"',
    targetAudience: 'Enterprise & Professional',
    specifications: {
      cpuVendor: 'Intel',
      typicalCpuTier: 'Core i7 / Ultra 7',
      typicalRamGB: 16,
      typicalStorageGB: 512,
      displayResolution: '1920x1080 FHD IPS'
    },
    capabilities: {
      battery: true,
      batteryHealth: true,
      temperatureSensors: true,
      smartStorage: true,
      wifi: true,
      ethernet: true,
      bluetooth: true,
      camera: true,
      audio: true,
      biometric: true,
      touchscreen: false,
      gpu: true,
      defender: true,
      windowsUpdate: true,
      driverManagement: true,
      networkReset: true,
      volumeOptimization: true
    },
    hardwareMatchSignatures: {
      models: ['Laptop Elite 15', 'Avantis Elite 15', 'Elite 15', 'AVT-LT-ELITE15'],
      skus: ['AVT-ELT-15', 'ELT15-PRO'],
      chassisType: 'Laptop'
    },
    driverCatalogKey: 'AVANTIS-LAPTOP-ELITE-V1'
  },

  'AVANTIS-LAPTOP-STUDENT': {
    id: 'avantis-laptop-student',
    name: 'Avantis Laptop Student 14',
    category: 'laptop',
    family: 'Student',
    formFactor: 'Laptop 14.0"',
    targetAudience: 'Education & Secondary Schools',
    specifications: {
      cpuVendor: 'Intel',
      typicalCpuTier: 'Core i3 / Celeron N-Series',
      typicalRamGB: 8,
      typicalStorageGB: 256,
      displayResolution: '1920x1080 FHD TN'
    },
    capabilities: {
      battery: true,
      batteryHealth: true,
      temperatureSensors: true,
      smartStorage: true,
      wifi: true,
      ethernet: false, // Thin-chassis Wi-Fi primary
      bluetooth: true,
      camera: true,
      audio: true,
      biometric: false,
      touchscreen: false,
      gpu: false,
      defender: true,
      windowsUpdate: true,
      driverManagement: true,
      networkReset: true,
      volumeOptimization: true
    },
    hardwareMatchSignatures: {
      models: ['Laptop Student 14', 'Avantis Student 14', 'Student 14', 'AVT-LT-STUD14'],
      skus: ['AVT-STU-14', 'STU14-EDU'],
      chassisType: 'Laptop'
    },
    driverCatalogKey: 'AVANTIS-LAPTOP-STUDENT-V1'
  },

  'AVANTIS-DESKTOP-PRO': {
    id: 'avantis-desktop-pro',
    name: 'Avantis Desktop Pro X',
    category: 'desktop',
    family: 'Pro',
    formFactor: 'Tower / Desktop Workstation',
    targetAudience: 'Workstation & Administrative',
    specifications: {
      cpuVendor: 'Intel / AMD',
      typicalCpuTier: 'Core i7 / Ryzen 7',
      typicalRamGB: 32,
      typicalStorageGB: 1024,
      displayResolution: 'External Monitor'
    },
    capabilities: {
      battery: false, // Stationary AC continuous power
      batteryHealth: false,
      temperatureSensors: true,
      smartStorage: true,
      wifi: true,
      ethernet: true,
      bluetooth: true,
      camera: false,
      audio: true,
      biometric: false,
      touchscreen: false,
      gpu: true,
      defender: true,
      windowsUpdate: true,
      driverManagement: true,
      networkReset: true,
      volumeOptimization: true
    },
    hardwareMatchSignatures: {
      models: ['Desktop Pro X', 'Avantis Pro X', 'Pro X Workstation', 'AVT-DT-PROX'],
      skus: ['AVT-PRO-X', 'DTPRO-X'],
      chassisType: 'Desktop'
    },
    driverCatalogKey: 'AVANTIS-DESKTOP-PRO-V1'
  },

  'AVANTIS-ALLINONE-VISION': {
    id: 'avantis-allinone-vision',
    name: 'Avantis All-in-One Vision 24',
    category: 'all-in-one',
    family: 'Vision',
    formFactor: 'All-in-One 23.8"',
    targetAudience: 'Reception, Clinical & Library',
    specifications: {
      cpuVendor: 'Intel',
      typicalCpuTier: 'Core i5',
      typicalRamGB: 16,
      typicalStorageGB: 512,
      displayResolution: '1920x1080 FHD IPS'
    },
    capabilities: {
      battery: false, // Stationary AC continuous power
      batteryHealth: false,
      temperatureSensors: true,
      smartStorage: true,
      wifi: true,
      ethernet: true,
      bluetooth: true,
      camera: true,
      audio: true,
      biometric: false,
      touchscreen: true,
      gpu: false,
      defender: true,
      windowsUpdate: true,
      driverManagement: true,
      networkReset: true,
      volumeOptimization: true
    },
    hardwareMatchSignatures: {
      models: ['All-in-One Vision 24', 'Vision 24', 'Avantis Vision 24', 'AVT-AIO-VIS24'],
      skus: ['AVT-VIS-24', 'AIO-VIS24'],
      chassisType: 'All-in-One'
    },
    driverCatalogKey: 'AVANTIS-AIO-VISION-V1'
  },

  'AVANTIS-MINIPC-EDGE': {
    id: 'avantis-minipc-edge',
    name: 'Avantis Mini PC Edge',
    category: 'mini-pc',
    family: 'Edge',
    formFactor: 'Ultra-Compact Mini PC',
    targetAudience: 'Digital Signage, Point of Sale & Edge',
    specifications: {
      cpuVendor: 'Intel',
      typicalCpuTier: 'Core i3 / N100',
      typicalRamGB: 8,
      typicalStorageGB: 256,
      displayResolution: 'External Micro-HDMI'
    },
    capabilities: {
      battery: false,
      batteryHealth: false,
      temperatureSensors: true,
      smartStorage: true,
      wifi: true,
      ethernet: true,
      bluetooth: true,
      camera: false,
      audio: true,
      biometric: false,
      touchscreen: false,
      gpu: false,
      defender: true,
      windowsUpdate: true,
      driverManagement: true,
      networkReset: true,
      volumeOptimization: true
    },
    hardwareMatchSignatures: {
      models: ['Mini PC Edge', 'Edge Mini', 'Avantis Edge Mini', 'AVT-MPC-EDGE'],
      skus: ['AVT-EDG-M', 'MPC-EDGE'],
      chassisType: 'Mini PC'
    },
    driverCatalogKey: 'AVANTIS-MINIPC-EDGE-V1'
  }
};

class DeviceCatalogService {
  constructor() {
    this.catalog = AVANTIS_DEVICE_CATALOG;
  }

  getAllProfiles() {
    return Object.values(this.catalog);
  }

  getProfileById(catalogId) {
    if (!catalogId) return null;
    const key = catalogId.toUpperCase().replace(/\s+/g, '-');
    return this.catalog[key] || this.catalog[catalogId] || null;
  }

  /**
   * Matches system manufacturer & model to official catalog entry
   */
  matchSystem(systemInfo = {}) {
    const mfg = (systemInfo.manufacturer || '').toLowerCase();
    const model = (systemInfo.model || '').toLowerCase();
    const sku = (systemInfo.sku || '').toLowerCase();

    // Must have Avantis branding in manufacturer or model to match catalog
    const isAvantisTagged = mfg.includes('avantis') || model.includes('avantis');

    for (const [key, profile] of Object.entries(this.catalog)) {
      const sigs = profile.hardwareMatchSignatures;
      const modelMatch = sigs.models.some(m => model.includes(m.toLowerCase()));
      const skuMatch = sigs.skus.some(s => sku.includes(s.toLowerCase()));

      if ((isAvantisTagged && (modelMatch || skuMatch)) || modelMatch) {
        return {
          matched: true,
          catalogKey: key,
          profile
        };
      }
    }

    return {
      matched: false,
      catalogKey: null,
      profile: null
    };
  }
}

module.exports = {
  AVANTIS_DEVICE_CATALOG,
  DeviceCatalogService
};
