const assert = require('assert');
const crypto = require('crypto');
const db = require('../../backend/src/database/db');
const { DeviceCatalogService } = require('../../backend/src/catalog/device_catalog');

async function runTests() {
  console.log('=== TEST SUITE: DeviceCatalog & Enrollment Lifecycle ===');

  // 1. Test Device Catalog Matching
  const catalog = new DeviceCatalogService();
  const eliteMatch = catalog.matchSystem({ manufacturer: 'Avantis Technologies', model: 'Laptop Elite 15', sku: 'AVT-ELT-15' });
  assert.strictEqual(eliteMatch.matched, true, 'Laptop Elite 15 must match catalog');
  assert.strictEqual(eliteMatch.profile.name, 'Avantis Laptop Elite 15');
  assert.strictEqual(eliteMatch.profile.capabilities.battery, true);
  console.log('[PASS] Authoritative catalog correctly identifies Avantis Laptop Elite 15.');

  const desktopMatch = catalog.matchSystem({ manufacturer: 'Avantis', model: 'Desktop Pro X' });
  assert.strictEqual(desktopMatch.matched, true, 'Desktop Pro X must match catalog');
  assert.strictEqual(desktopMatch.profile.capabilities.battery, false, 'Desktop Pro X must not have battery capability');
  console.log('[PASS] Authoritative catalog correctly identifies Desktop Pro X without fake battery.');

  const thirdPartyMatch = catalog.matchSystem({ manufacturer: 'Dell Inc.', model: 'Latitude 7420' });
  assert.strictEqual(thirdPartyMatch.matched, false, 'Non-Avantis PC must not match Avantis catalog');
  console.log('[PASS] Non-Avantis machine correctly classified as non-catalog.');

  // 2. Test Database Enrollment Lifecycle
  const testDeviceId = 'AVT-DEV-TEST001';
  const testInstId = 'AVT-INST-TEST001';
  const testToken = crypto.randomBytes(32).toString('hex');
  const testHwId = crypto.randomBytes(32).toString('hex');

  // Enroll
  const enrolled = await db.enrollDevice({
    deviceId: testDeviceId,
    installationId: testInstId,
    model: 'Avantis Laptop Elite 15',
    serialNumber: 'AVT-SN-12345',
    hardwareIdentity: testHwId,
    authToken: testToken,
    capabilities: eliteMatch.profile.capabilities,
    enrolledBy: 'Test Technician'
  });

  assert.strictEqual(enrolled.deviceId, testDeviceId);
  assert.strictEqual(enrolled.authorizationStatus, 'AUTHORIZED');
  console.log('[PASS] Device enrollment creates authoritative record.');

  // Verify Valid Credential
  const validCheck = await db.verifyDeviceCredential(testDeviceId, testInstId, testToken);
  assert.strictEqual(validCheck.authorized, true, 'Valid credential must be authorized');
  assert.strictEqual(validCheck.status, 'AUTHORIZED');
  console.log('[PASS] Valid credential verification returns AUTHORIZED state.');

  // Verify Invalid Token
  const invalidTokenCheck = await db.verifyDeviceCredential(testDeviceId, testInstId, 'WRONG_TOKEN');
  assert.strictEqual(invalidTokenCheck.authorized, false, 'Wrong token must not be authorized');
  assert.strictEqual(invalidTokenCheck.status, 'NOT_AUTHORIZED');
  console.log('[PASS] Invalid token is rejected with NOT_AUTHORIZED.');

  // Verify Mismatched Installation ID
  const invalidInstCheck = await db.verifyDeviceCredential(testDeviceId, 'WRONG_INST_ID', testToken);
  assert.strictEqual(invalidInstCheck.authorized, false, 'Wrong installation ID must not be authorized');
  assert.strictEqual(invalidInstCheck.status, 'NOT_AUTHORIZED');
  console.log('[PASS] Mismatched installation ID is rejected.');

  // Revoke Device
  await db.revokeDevice(testDeviceId, 'Decommissioned by Admin');
  const revokedCheck = await db.verifyDeviceCredential(testDeviceId, testInstId, testToken);
  assert.strictEqual(revokedCheck.authorized, false, 'Revoked device must not be authorized');
  assert.strictEqual(revokedCheck.status, 'REVOKED');
  assert.strictEqual(revokedCheck.reason, 'Decommissioned by Admin');
  console.log('[PASS] Revoked device transitions to REVOKED restricted state.');

  console.log('=== ALL DeviceCatalog & Enrollment Lifecycle TESTS PASSED ===\n');
}

runTests().catch(err => {
  console.error('[FAIL] Enrollment Lifecycle Test Error:', err);
  process.exit(1);
});
