const { execSync } = require('child_process');

class SecurityProvider {
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

  async discover() {
    if (process.platform !== 'win32') {
      return {
        available: false,
        engine: null,
        antivirusEnabled: false,
        realTimeProtection: false,
        behaviorMonitoring: false,
        signatureVersion: null,
        signatureAgeDays: null,
        signatureLastUpdated: null,
        engineVersion: null,
        lastQuickScanTime: null,
        lastFullScanTime: null,
        threatsDetected: [],
        reason: 'Windows Defender security services are only available on Microsoft Windows installations.'
      };
    }

    try {
      const psScript = `
        $ErrorActionPreference = 'SilentlyContinue';
        $avProducts = @(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction SilentlyContinue | Select-Object displayName, productState);
        $def = Get-MpComputerStatus -ErrorAction SilentlyContinue | Select-Object AntivirusEnabled, RealTimeProtectionEnabled, BehaviorMonitorEnabled, AntivirusSignatureVersion, AntivirusSignatureAge, AntivirusSignatureLastUpdated, AMEngineVersion, QuickScanStartTime, QuickScanEndTime, FullScanStartTime, FullScanEndTime, AMServiceEnabled;
        $threats = @(Get-MpThreatDetection -ErrorAction SilentlyContinue | Select-Object -First 10 ThreatName, InitialDetectionTime, Resources);

        [PSCustomObject]@{
          products = $avProducts;
          defender = $def;
          threats = $threats;
        } | ConvertTo-Json -Depth 3
      `.trim().replace(/\s+/g, ' ');

      const raw = this.execPowerShell(psScript, 8000);
      if (raw) {
        const parsed = JSON.parse(raw);
        const products = Array.isArray(parsed.products) ? parsed.products : (parsed.products ? [parsed.products] : []);
        const def = parsed.defender || {};
        const threats = Array.isArray(parsed.threats) ? parsed.threats : (parsed.threats ? [parsed.threats] : []);

        if (def.AMServiceEnabled !== undefined || products.length > 0) {
          let engineName = 'Microsoft Defender Antivirus';
          if (products.length > 0 && products[0].displayName) {
            engineName = products.map(p => p.displayName).join(', ');
          }

          const sigAge = def.AntivirusSignatureAge !== undefined ? parseInt(def.AntivirusSignatureAge, 10) : null;

          return {
            available: true,
            engine: engineName,
            antivirusEnabled: def.AntivirusEnabled !== undefined ? !!def.AntivirusEnabled : true,
            realTimeProtection: def.RealTimeProtectionEnabled !== undefined ? !!def.RealTimeProtectionEnabled : false,
            behaviorMonitoring: def.BehaviorMonitorEnabled !== undefined ? !!def.BehaviorMonitorEnabled : false,
            signatureVersion: def.AntivirusSignatureVersion || null,
            signatureAgeDays: isNaN(sigAge) ? null : sigAge,
            signatureLastUpdated: def.AntivirusSignatureLastUpdated || null,
            engineVersion: def.AMEngineVersion || null,
            lastQuickScanTime: def.QuickScanEndTime || def.QuickScanStartTime || null,
            lastFullScanTime: def.FullScanEndTime || def.FullScanStartTime || null,
            threatsDetected: threats.map(t => ({
              threatName: t.ThreatName,
              detectionTime: t.InitialDetectionTime,
              filePath: Array.isArray(t.Resources) ? t.Resources[0] : (t.Resources || 'Unknown path')
            })),
            reason: null
          };
        }
      }
    } catch (err) {
      console.warn('[SecurityProvider] Windows Defender query error:', err.message);
    }

    return {
      available: false,
      engine: null,
      antivirusEnabled: false,
      realTimeProtection: false,
      behaviorMonitoring: false,
      signatureVersion: null,
      signatureAgeDays: null,
      signatureLastUpdated: null,
      engineVersion: null,
      lastQuickScanTime: null,
      lastFullScanTime: null,
      threatsDetected: [],
      reason: 'Windows Defender security status could not be queried or service is disabled.'
    };
  }
}

module.exports = SecurityProvider;
