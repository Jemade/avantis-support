const os = require('os');
const { execSync } = require('child_process');
const si = require('systeminformation');

class NetworkProvider {
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
    let ifacesRaw = [];
    let defaultGw = null;

    try {
      [ifacesRaw, defaultGw] = await Promise.all([
        si.networkInterfaces().catch(() => ([])),
        si.networkGatewayDefault().catch(() => null)
      ]);
    } catch (err) {
      console.warn('[NetworkProvider] systeminformation error:', err.message);
    }

    const adapters = [];
    const virtualKeywords = ['loopback', 'vethernet', 'hyper-v', 'wsl', 'docker', 'virtual', 'vmware', 'tap', 'tun', 'bluetooth'];

    if (Array.isArray(ifacesRaw)) {
      ifacesRaw.forEach(n => {
        if (!n || !n.iface) return;
        const nameLower = (n.iface + ' ' + (n.ifaceName || '')).toLowerCase();
        const isVirtual = virtualKeywords.some(k => nameLower.includes(k)) || n.type === 'virtual';

        let netType = 'unknown';
        if (n.type === 'wireless' || /wi-fi|wireless|wlan|802\.11/i.test(nameLower)) {
          netType = 'wifi';
        } else if (n.type === 'wired' || /ethernet|eth|lan|enp/i.test(nameLower)) {
          netType = 'ethernet';
        } else if (isVirtual) {
          netType = 'virtual';
        }

        const isUp = n.operstate === 'up' || (n.ip4 && n.ip4 !== '127.0.0.1' && n.ip4 !== '0.0.0.0');

        adapters.push({
          name: n.iface,
          description: n.ifaceName || n.iface,
          type: netType,
          isPhysical: !isVirtual && n.iface !== 'lo',
          mac: n.mac && n.mac !== '00:00:00:00:00:00' ? n.mac : null,
          ipv4: (n.ip4 && n.ip4 !== '127.0.0.1') ? n.ip4 : null,
          ipv6: n.ip6 && !n.ip6.startsWith('fe80') ? n.ip6 : null,
          dhcpEnabled: !!n.dhcp,
          linkSpeedMbps: n.speed ? n.speed : null,
          status: isUp ? 'UP' : 'DISCONNECTED'
        });
      });
    }

    // Windows Deep Network & DNS Query
    let configuredDns = [];
    let detectedGateway = defaultGw || null;

    if (process.platform === 'win32') {
      try {
        const ps = `
          $ErrorActionPreference = 'SilentlyContinue';
          $net = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -or $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1;
          if ($net) {
            [PSCustomObject]@{
              alias = $net.InterfaceAlias;
              desc = $net.InterfaceDescription;
              gateway = if ($net.IPv4DefaultGateway) { $net.IPv4DefaultGateway.NextHop } else { $null };
              dns = @($net.DNSServer | Select-Object -ExpandProperty ServerAddresses);
            } | ConvertTo-Json
          } else { '{}' }
        `.trim().replace(/\s+/g, ' ');

        const raw = this.execPowerShell(ps, 4000);
        if (raw && raw !== '{}') {
          const parsed = JSON.parse(raw);
          if (parsed.gateway) detectedGateway = parsed.gateway;
          if (Array.isArray(parsed.dns) && parsed.dns.length > 0) {
            configuredDns = parsed.dns.filter(d => d && typeof d === 'string');
          }
        }
      } catch {}
    }

    // Fallback DNS from resolve.conf or standard OS
    if (configuredDns.length === 0) {
      try {
        const dns = require('dns');
        const servers = dns.getServers();
        if (servers && servers.length > 0) {
          configuredDns = servers.filter(s => s && s !== '0.0.0.0');
        }
      } catch {}
    }

    // Primary physical active adapter
    const activePhysical = adapters.find(a => a.isPhysical && a.status === 'UP' && a.ipv4) ||
      adapters.find(a => a.status === 'UP' && a.ipv4) ||
      adapters[0] || null;

    return {
      adapters,
      activeAdapter: activePhysical,
      defaultGateway: detectedGateway,
      configuredDnsServers: configuredDns,
      primaryDns: configuredDns[0] || null,
      publicDiagnosticResolver: '1.1.1.1', // Distinctly labeled public fallback test
      hasInternetConnectivity: !!(activePhysical && activePhysical.ipv4)
    };
  }
}

module.exports = NetworkProvider;
