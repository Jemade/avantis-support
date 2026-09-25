const fs = require('fs');
const path = require('path');

class DeviceIdentityResolver {
  constructor() {
    this.profilesDir = path.join(__dirname, 'profiles');
    this.profiles = this.loadProfiles();
  }

  loadProfiles() {
    const list = [];
    try {
      if (fs.existsSync(this.profilesDir)) {
        const files = fs.readdirSync(this.profilesDir);
        for (const f of files) {
          if (f.endsWith('.json') && f !== 'profile_schema.json') {
            try {
              const content = JSON.parse(fs.readFileSync(path.join(this.profilesDir, f), 'utf8'));
              list.push(content);
            } catch {}
          }
        }
      }
    } catch (err) {
      console.warn('[DeviceIdentityResolver] Error reading profiles:', err.message);
    }
    return list;
  }

  /**
   * Resolves genuine device identity using discovered SMBIOS, BIOS, Motherboard, and SKU
   * @param {Object} systemInfo - Result from SystemProvider
   * @param {Object} powerInfo - Result from PowerProvider
   */
  resolve(systemInfo = {}, powerInfo = {}) {
    const manufacturer = (systemInfo.manufacturer || '').trim();
    const systemManufacturer = (systemInfo.systemManufacturer || '').trim();
    const model = (systemInfo.model || systemInfo.productName || '').trim();
    const sku = (systemInfo.sku || '').trim();
    const family = (systemInfo.systemFamily || '').trim();
    const mbMan = (systemInfo.motherboard && systemInfo.motherboard.manufacturer ? systemInfo.motherboard.manufacturer : '').trim();
    const biosVendor = (systemInfo.bios && systemInfo.bios.vendor ? systemInfo.bios.vendor : '').trim();

    const allVendorStrings = [manufacturer, systemManufacturer, mbMan, biosVendor].filter(Boolean).map(s => s.toLowerCase());
    const isAvantisManufacturer = allVendorStrings.some(s => s.includes('avantis'));

    // Check device type from chassis or power
    let detectedType = (systemInfo.chassis && systemInfo.chassis.type ? systemInfo.chassis.type.toLowerCase() : 'desktop');
    if (powerInfo.hasBattery) {
      if (detectedType !== 'tablet') detectedType = 'laptop';
    } else if (detectedType === 'laptop') {
      // If chassis says laptop but zero battery hardware exists, it might be an All-in-One or mini desktop
      detectedType = 'desktop';
    }

    // Try matching specific Avantis profile
    let matchedProfile = null;
    if (isAvantisManufacturer || model.toLowerCase().includes('avantis')) {
      for (const p of this.profiles) {
        if (p.profileId === 'generic-windows') continue;

        const patterns = p.matchingIdentifiers && p.matchingIdentifiers.modelPatterns ? p.matchingIdentifiers.modelPatterns : [];
        const skus = p.matchingIdentifiers && p.matchingIdentifiers.skus ? p.matchingIdentifiers.skus : [];

        const patternMatch = patterns.some(pat => 
          model.toLowerCase().includes(pat.toLowerCase()) || 
          family.toLowerCase().includes(pat.toLowerCase())
        );
        const skuMatch = skus.some(s => sku.toLowerCase() === s.toLowerCase());

        if (patternMatch || skuMatch) {
          matchedProfile = p;
          break;
        }
      }
    }

    if (matchedProfile) {
      return {
        isAvantis: true,
        recognizedModel: true,
        displayName: matchedProfile.modelName,
        manufacturer: manufacturer || 'Avantis Technologies',
        model: matchedProfile.modelName,
        sku: sku || matchedProfile.profileId,
        serialNumber: systemInfo.serialNumber,
        deviceFamily: matchedProfile.deviceFamily,
        deviceType: matchedProfile.deviceType,
        profileId: matchedProfile.profileId,
        driverCatalogKey: matchedProfile.driverCatalogKey,
        firmware: systemInfo.bios || null
      };
    }

    if (isAvantisManufacturer) {
      // Recognized Avantis manufacturer, but exact model pattern was not found in registered profiles
      const disp = model ? `Avantis ${model}` : 'Avantis Device';
      return {
        isAvantis: true,
        recognizedModel: false,
        displayName: disp,
        manufacturer: manufacturer,
        model: model || 'Avantis Hardware Device',
        sku: sku || null,
        serialNumber: systemInfo.serialNumber,
        deviceFamily: family || 'Avantis Custom Series',
        deviceType: detectedType,
        profileId: 'generic-avantis',
        driverCatalogKey: 'AVT-CAT-GENERIC',
        firmware: systemInfo.bios || null
      };
    }

    // Non-Avantis Machine (e.g. Acer, Dell, HP, Lenovo, VM, etc.)
    const brandName = manufacturer ? `${manufacturer} ${model}`.trim() : (model || 'Windows PC');
    return {
      isAvantis: false,
      recognizedModel: false,
      displayName: brandName,
      manufacturer: manufacturer || 'Standard OEM',
      model: model || 'Windows PC',
      sku: sku || null,
      serialNumber: systemInfo.serialNumber,
      deviceFamily: family || null,
      deviceType: detectedType,
      profileId: 'generic-windows',
      driverCatalogKey: 'GENERIC-WINDOWS',
      firmware: systemInfo.bios || null
    };
  }
}

module.exports = DeviceIdentityResolver;
