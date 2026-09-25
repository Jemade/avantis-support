const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const SystemIdentityProvider = require('../../agent/src/discovery/providers/system_identity_provider');

async function runTests() {
  console.log('=== TEST SUITE: SystemIdentityProvider ===');
  const tempDir = path.join(os.tmpdir(), 'avantis-test-identity-' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const provider1 = new SystemIdentityProvider(tempDir);
    const mockSystemSpecs = {
      manufacturer: 'Avantis',
      model: 'Laptop Elite 15',
      serialNumber: 'AVT-SN-998822',
      uuid: '4C4C4544-0050-4810-8038-B7C04F425832',
      motherboard: { serial: 'MB-882201' },
      cpuModel: 'Intel Core i7-13700H'
    };

    // 1. Initial Discovery
    const id1 = await provider1.discover(mockSystemSpecs);
    assert.ok(id1.deviceId.startsWith('AVT-DEV-'), 'Device ID must start with AVT-DEV-');
    assert.ok(id1.installationId.startsWith('AVT-INST-'), 'Installation ID must start with AVT-INST-');
    assert.strictEqual(id1.hardwareIdentityHash.length, 64, 'Hardware identity must be 64-character SHA-256 hash');
    assert.strictEqual(id1.targetPlatform, 'Windows 10/11', 'Target platform must be Windows 10/11');
    console.log('[PASS] Initial identity discovery creates normalized roots of trust.');

    // 2. Persistence test: Second provider instance in same directory
    const provider2 = new SystemIdentityProvider(tempDir);
    const id2 = await provider2.discover(mockSystemSpecs);
    assert.strictEqual(id2.installationId, id1.installationId, 'Installation ID must persist across restarts');
    assert.strictEqual(id2.deviceId, id1.deviceId, 'Device ID must be identical for identical hardware specs');
    assert.strictEqual(id2.hardwareIdentityHash, id1.hardwareIdentityHash, 'SHA-256 fingerprint must be deterministic');
    console.log('[PASS] Installation ID and Device ID persist deterministically.');

    // 3. Different hardware produces different fingerprint
    const differentSpecs = { ...mockSystemSpecs, serialNumber: 'DIFFERENT-SN', uuid: 'DIFFERENT-UUID' };
    const id3 = await provider1.discover(differentSpecs);
    assert.notStrictEqual(id3.hardwareIdentityHash, id1.hardwareIdentityHash, 'Different hardware must produce different fingerprint');
    console.log('[PASS] Hardware variations yield distinct fingerprints.');

    console.log('=== ALL SystemIdentityProvider TESTS PASSED ===\n');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runTests().catch(err => {
  console.error('[FAIL] SystemIdentityProvider Test Error:', err);
  process.exit(1);
});
