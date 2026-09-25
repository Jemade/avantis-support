const SystemProvider = require('./providers/system_provider');
const SystemIdentityProvider = require('./providers/system_identity_provider');
const CpuProvider = require('./providers/cpu_provider');
const MemoryProvider = require('./providers/memory_provider');
const StorageProvider = require('./providers/storage_provider');
const PowerProvider = require('./providers/power_provider');
const NetworkProvider = require('./providers/network_provider');
const PnpProvider = require('./providers/pnp_provider');
const SecurityProvider = require('./providers/security_provider');
const DeviceIdentityResolver = require('./device_identity');
const CapabilityDetector = require('./capability_detector');

class HardwareDiscoveryService {
  constructor() {
    this.systemProvider = new SystemProvider();
    this.systemIdentityProvider = new SystemIdentityProvider();
    this.cpuProvider = new CpuProvider();
    this.memoryProvider = new MemoryProvider();
    this.storageProvider = new StorageProvider();
    this.powerProvider = new PowerProvider();
    this.networkProvider = new NetworkProvider();
    this.pnpProvider = new PnpProvider();
    this.securityProvider = new SecurityProvider();
    this.identityResolver = new DeviceIdentityResolver();
    this.capabilityDetector = new CapabilityDetector();

    this.cachedStatic = null;
    this.lastStaticDiscoveryTime = 0;
    this.STATIC_TTL_MS = 600000; // 10 minutes cache for immutable system identity & specs

    this.lastFullSnapshot = null;
  }

  /**
   * Performs full hardware discovery (or returns warm static cache + fresh live readings)
   */
  async getFullSnapshot(forceFresh = false) {
    const now = Date.now();
    const needsStaticRefresh = forceFresh || !this.cachedStatic || (now - this.lastStaticDiscoveryTime > this.STATIC_TTL_MS);

    if (needsStaticRefresh) {
      console.log('[HardwareDiscovery] Running complete hardware discovery sweep...');
      const [system, cpu, memory, storage, power, network, pnp, security] = await Promise.all([
        this.systemProvider.discover(),
        this.cpuProvider.discover(),
        this.memoryProvider.discover(),
        this.storageProvider.discover(),
        this.powerProvider.discover(),
        this.networkProvider.discover(),
        this.pnpProvider.discover(),
        this.securityProvider.discover()
      ]);

      const hardwareIdentity = await this.systemIdentityProvider.discover(system);
      const device = this.identityResolver.resolve(system, power);
      // Merge deterministic hardware identity roots
      device.deviceId = hardwareIdentity.deviceId;
      device.installationId = hardwareIdentity.installationId;
      device.hardwareIdentityHash = hardwareIdentity.hardwareIdentityHash;
      device.isProductionWindows = hardwareIdentity.isProductionWindows;
      device.targetPlatform = hardwareIdentity.targetPlatform;

      const capabilities = this.capabilityDetector.detect({ system, cpu, memory, storage, power, network, pnp, security });

      this.cachedStatic = {
        system,
        device,
        hardwareIdentity,
        capabilities,
        pnp,
        security
      };
      this.lastStaticDiscoveryTime = now;

      this.lastFullSnapshot = {
        timestamp: new Date().toISOString(),
        device,
        hardwareIdentity,
        capabilities,
        system,
        cpu,
        memory,
        storage,
        power,
        network,
        pnp,
        security
      };

      console.log(`[HardwareDiscovery] Hardware detected: ${device.displayName} (${device.isAvantis ? 'Avantis' : 'OEM'} · ${device.deviceType}) [ID: ${device.deviceId}]`);
      return this.lastFullSnapshot;
    }

    // Refresh live volatile metrics only
    const [cpu, memory, storage, power, network] = await Promise.all([
      this.cpuProvider.discover(),
      this.memoryProvider.discover(),
      this.storageProvider.discover(),
      this.powerProvider.discover(),
      this.networkProvider.discover()
    ]);

    this.lastFullSnapshot = {
      timestamp: new Date().toISOString(),
      device: this.cachedStatic.device,
      capabilities: this.cachedStatic.capabilities,
      system: this.cachedStatic.system,
      cpu,
      memory,
      storage,
      power,
      network,
      pnp: this.cachedStatic.pnp,
      security: this.cachedStatic.security
    };

    return this.lastFullSnapshot;
  }

  async getDeviceIdentity() {
    const snapshot = await this.getFullSnapshot();
    return snapshot.device;
  }

  async getCapabilities() {
    const snapshot = await this.getFullSnapshot();
    return snapshot.capabilities;
  }

  async getHardware() {
    const snapshot = await this.getFullSnapshot();
    return {
      system: snapshot.system,
      cpu: snapshot.cpu,
      memory: snapshot.memory
    };
  }

  async getStorage() {
    const snapshot = await this.getFullSnapshot();
    return snapshot.storage;
  }

  async getPower() {
    const snapshot = await this.getFullSnapshot();
    return snapshot.power;
  }

  async getNetwork() {
    const snapshot = await this.getFullSnapshot();
    return snapshot.network;
  }

  async getSoftware() {
    const snapshot = await this.getFullSnapshot();
    return {
      os: snapshot.system.os,
      hostname: snapshot.system.hostname,
      user: snapshot.system.user,
      uptimeSeconds: snapshot.system.os ? snapshot.system.os.uptimeSeconds : 0
    };
  }

  async getPnp() {
    const snapshot = await this.getFullSnapshot();
    return snapshot.pnp;
  }

  async getSecurity() {
    const snapshot = await this.getFullSnapshot();
    return snapshot.security;
  }

  /**
   * Translates normalized snapshot into legacy diagnostics format for full backward compatibility
   */
  async getLegacyDiagnosticsFormat(forceLive = false) {
    const s = await this.getFullSnapshot(forceLive);
    const cpu = s.cpu || {};
    const mem = s.memory || {};
    const stg = s.storage || {};
    const sys = s.system || {};
    const pow = s.power || {};

    return {
      system: {
        hostname: sys.hostname || 'PC',
        model: s.device ? s.device.displayName : (sys.model || 'PC'),
        serialNumber: sys.serialNumber || sys.hostname || 'DEVICE',
        osVersion: sys.os ? sys.os.caption : 'Windows',
        cpuModel: cpu.brand || 'Processor',
        cpuCores: cpu.physicalCores || 1,
        cpuThreads: cpu.logicalProcessors || 1,
        cpuSpeedGhz: cpu.baseClockGhz || null,
        ramLayoutSummary: mem.layoutSummary || `${mem.totalGB || 8} GB`,
        ramSticks: mem.modules || [],
        graphicsList: (s.pnp || []).filter(p => p.deviceClass === 'DISPLAY'),
        primaryGpu: (s.pnp || []).find(p => p.deviceClass === 'DISPLAY') || { name: 'Integrated Graphics' },
        chassisType: sys.chassis ? sys.chassis.type : 'Desktop',
        isLaptop: pow.hasBattery,
        touchCapabilities: { hasTouchscreen: s.capabilities.touchscreen, hasActivePen: false }
      },
      cpu: {
        loadPercent: cpu.loadPercent !== null ? cpu.loadPercent : null,
        temperatureC: cpu.temperatureC !== null ? cpu.temperatureC : null,
        temperatureSupported: cpu.temperatureSupported,
        brand: cpu.brand
      },
      memory: {
        totalGB: mem.totalGB,
        usedGB: mem.usedGB,
        availableGB: mem.availableGB,
        usedPercent: mem.usedPercent !== null ? mem.usedPercent : null
      },
      storage: {
        totalGB: stg.totalGB,
        usedGB: stg.usedGB,
        freeGB: stg.freeGB,
        usedPercent: stg.usedPercent !== null ? stg.usedPercent : null,
        smartStatus: stg.smartStatus,
        driveType: stg.driveType,
        physicalDisks: stg.physicalDisks || [],
        volumes: stg.volumes || []
      },
      battery: {
        hasBattery: pow.hasBattery,
        currentPercent: pow.currentPercent,
        healthPercent: pow.healthPercent,
        isCharging: pow.isCharging,
        timeRemainingMinutes: pow.timeRemainingMinutes,
        statusMessage: pow.statusMessage
      },
      device: s.device,
      hardwareIdentity: s.hardwareIdentity,
      capabilities: s.capabilities,
      network: s.network,
      security: s.security
    };
  }
}

module.exports = HardwareDiscoveryService;
