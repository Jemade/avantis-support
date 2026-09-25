const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AuthorizationManager = require('../../agent/src/auth/authorization_manager');

async function runTests() {
  console.log('=== TEST SUITE: AuthorizationManager Local Lifecycle & Offline Resilience ===');
  const tempDir = path.join(os.tmpdir(), 'avantis-test-auth-' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const auth = new AuthorizationManager({
      backendUrl: 'http://127.0.0.1:59999', // Non-existent backend to test offline mode
      storageDir: tempDir
    });

    // 1. Unenrolled State
    await auth.init();
    let status = auth.getStatus();
    assert.strictEqual(status.status, 'UNENROLLED', 'Clean machine must start as UNENROLLED');
    assert.strictEqual(status.isAuthorized, false, 'Unenrolled machine is not authorized');
    assert.strictEqual(status.isOperational, false, 'Unenrolled machine cannot perform Avantis operations');
    console.log('[PASS] Unenrolled machine starts in protected UNENROLLED state.');

    // 2. Persisting Provisioned Credentials
    auth.saveCredentials({
      deviceId: 'AVT-DEV-UNIT01',
      installationId: 'AVT-INST-UNIT01',
      authToken: 'test-auth-token-123',
      model: 'Avantis Laptop Elite 15',
      serialNumber: 'AVT-SN-8877',
      capabilities: { battery: true, wifi: true }
    });

    status = auth.getStatus();
    assert.strictEqual(status.status, 'AUTHORIZED', 'Saved credentials transition to AUTHORIZED');
    assert.strictEqual(status.isAuthorized, true);
    assert.strictEqual(status.deviceId, 'AVT-DEV-UNIT01');
    assert.strictEqual(status.model, 'Avantis Laptop Elite 15');
    console.log('[PASS] Valid credentials transition state to AUTHORIZED.');

    // 3. Offline Verification Resilience
    // Because backend is at port 59999 (unreachable), verifyWithBackend must transition to OFFLINE
    await auth.verifyWithBackend();
    status = auth.getStatus();
    assert.strictEqual(status.status, 'OFFLINE', 'Unreachable backend with valid local token must enter OFFLINE state');
    assert.strictEqual(status.isOperational, true, 'Offline mode allows local hardware inspection');
    assert.strictEqual(status.isOffline, true, 'isOffline flag is accurately set');
    console.log('[PASS] Offline resilience: Gracefully enters OFFLINE mode for local telemetry.');

    // 4. Persistence across reboot/restart
    const authRestarted = new AuthorizationManager({
      backendUrl: 'http://127.0.0.1:59999',
      storageDir: tempDir
    });
    authRestarted.loadLocalCredentials();
    const restartedStatus = authRestarted.getStatus();
    assert.strictEqual(restartedStatus.deviceId, 'AVT-DEV-UNIT01', 'Credentials must persist across service restart');
    assert.strictEqual(restartedStatus.isEnrolled, true);
    console.log('[PASS] Credentials reload correctly across simulated service restart.');

    console.log('=== ALL AuthorizationManager TESTS PASSED ===\n');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runTests().catch(err => {
  console.error('[FAIL] AuthorizationManager Test Error:', err);
  process.exit(1);
});
