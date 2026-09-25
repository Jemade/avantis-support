const os = require('os');
const si = require('systeminformation');

class MemoryProvider {
  constructor() {}

  async discover() {
    let mem = {};
    let layout = [];

    try {
      [mem, layout] = await Promise.all([
        si.mem().catch(() => ({})),
        si.memLayout().catch(() => ([]))
      ]);
    } catch (err) {
      console.warn('[MemoryProvider] systeminformation error:', err.message);
    }

    const totalBytes = mem.total || os.totalmem() || 0;
    const availableBytes = mem.available || os.freemem() || 0;
    const usedBytes = totalBytes > availableBytes ? (totalBytes - availableBytes) : (mem.used || 0);

    const totalGB = totalBytes > 0 ? parseFloat((totalBytes / (1024 ** 3)).toFixed(1)) : null;
    const usedGB = usedBytes > 0 ? parseFloat((usedBytes / (1024 ** 3)).toFixed(1)) : null;
    const availableGB = availableBytes > 0 ? parseFloat((availableBytes / (1024 ** 3)).toFixed(1)) : null;
    const usedPercent = (totalBytes > 0 && usedBytes >= 0) ? Math.min(100, Math.max(0, Math.round((usedBytes / totalBytes) * 100))) : null;

    // Discovered physical sticks/modules
    const modules = [];
    if (Array.isArray(layout) && layout.length > 0) {
      layout.forEach((m, idx) => {
        if (!m || !m.size) return;
        const capGb = parseFloat((m.size / (1024 ** 3)).toFixed(1));
        modules.push({
          slot: m.bank || m.locator || `Slot ${idx + 1}`,
          capacityGB: capGb,
          type: m.type || 'DDR',
          speedMHz: m.clockSpeed || null,
          manufacturer: m.manufacturer && !m.manufacturer.includes('0000') ? m.manufacturer.trim() : null,
          partNumber: m.partNum ? m.partNum.trim() : null
        });
      });
    }

    let layoutSummary = '';
    if (modules.length > 1) {
      const allSame = modules.every(m => m.capacityGB === modules[0].capacityGB);
      const speed = modules[0].speedMHz ? ` ${modules[0].speedMHz}MHz` : '';
      layoutSummary = allSame
        ? `${totalGB} GB (${modules.length}x ${modules[0].capacityGB}GB${speed})`
        : `${totalGB} GB across ${modules.length} slots`;
    } else if (modules.length === 1) {
      const speed = modules[0].speedMHz ? ` ${modules[0].speedMHz}MHz` : '';
      layoutSummary = `${totalGB} GB (1x ${modules[0].capacityGB}GB${speed})`;
    } else if (totalGB !== null) {
      layoutSummary = `${totalGB} GB Installed`;
    } else {
      layoutSummary = 'Memory information unavailable';
    }

    return {
      totalBytes,
      totalGB,
      usedBytes,
      usedGB,
      availableBytes,
      availableGB,
      usedPercent,
      modules,
      layoutSummary
    };
  }
}

module.exports = MemoryProvider;
