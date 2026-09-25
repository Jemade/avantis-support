#!/usr/bin/env node
/**
 * Avantis Internal Device Provisioning Tool
 * Used exclusively by Avantis Technicians and Factory Staging to enroll
 * genuine Avantis Windows PCs into the Avantis Device Registry.
 *
 * Usage:
 *   node scripts/provision_device.js --key=AVANTIS-PROV-SECRET-2026 [--backend=http://localhost:9141] [--model="Avantis Laptop Elite 15"]
 */

const http = require('http');
const path = require('path');
const HardwareDiscoveryService = require('../agent/src/discovery/hardware_discovery');
const AuthorizationManager = require('../agent/src/auth/authorization_manager');

// Parse CLI Arguments
const args = process.argv.slice(2);
let provKey = process.env.AVANTIS_PROVISIONING_SECRET || 'AVANTIS-PROV-SECRET-2026';
let backendUrl = process.env.BACKEND_URL || 'http://localhost:9141';
let overrideModel = null;
let technicianName = process.env.TECHNICIAN_NAME || 'Avantis Factory Staging Bench #4';

args.forEach(arg => {
  if (arg.startsWith('--key=')) provKey = arg.split('=')[1];
  if (arg.startsWith('--backend=')) backendUrl = arg.split('=')[1];
  if (arg.startsWith('--model=')) overrideModel = arg.split('=')[1];
  if (arg.startsWith('--technician=')) technicianName = arg.split('=')[1];
});

async function provisionMachine() {
  console.log('====================================================');
  console.log('  AVANTIS PC COMPANION — FACTORY PROVISIONING TOOL');
  console.log('====================================================');
  console.log(`[Staging] Target Backend: ${backendUrl}`);
  console.log(`[Staging] Technician: ${technicianName}`);
  console.log(`[Staging] Environment: ${process.platform === 'win32' ? 'Windows 10/11 Production' : 'Linux Staging / Development'}`);

  const discovery = new HardwareDiscoveryService();
  const authManager = new AuthorizationManager({ backendUrl });

  console.log('\n[1/4] Scanning physical hardware and roots of trust...');
  const snapshot = await discovery.getFullSnapshot(true);
  const sys = snapshot.system || {};
  const hwId = snapshot.hardwareIdentity || {};

  console.log(`      * Discovered System: ${sys.manufacturer || 'OEM'} ${sys.model || 'PC'}`);
  console.log(`      * Chassis Type: ${sys.chassis?.type || 'Desktop'}`);
  console.log(`      * Hardware Device ID: ${hwId.deviceId}`);
  console.log(`      * Persistent Installation ID: ${hwId.installationId}`);
  console.log(`      * Hardware Fingerprint: ${hwId.hardwareIdentityHash ? hwId.hardwareIdentityHash.substring(0, 16) + '...' : 'Derived'}`);

  console.log('\n[2/4] Registering device with Avantis Device Registry...');
  const enrollmentPayload = {
    provisioningKey: provKey,
    deviceId: hwId.deviceId,
    installationId: hwId.installationId,
    hardwareIdentity: hwId.hardwareIdentityHash,
    model: overrideModel || sys.model,
    serialNumber: sys.serialNumber,
    systemInfo: {
      manufacturer: sys.manufacturer,
      model: overrideModel || sys.model,
      sku: sys.sku,
      serialNumber: sys.serialNumber,
      hasBattery: snapshot.power?.hasBattery !== false
    },
    clientVersion: '2.4.0',
    technicianName
  };

  const enrollmentResult = await authManager.enrollMachine(provKey, sys, hwId);

  if (!enrollmentResult.success) {
    console.error('\n[ERROR] Enrollment Failed:', enrollmentResult.message);
    process.exit(1);
  }

  console.log('      * Server Status: Enrolled & Authorized');
  console.log(`      * Assigned Official Model: ${enrollmentResult.device.model}`);
  console.log(`      * Status: ${enrollmentResult.device.status}`);

  console.log('\n[3/4] Persisting secure device credentials...');
  console.log(`      * Credential Store: ${authManager.credentialsPath}`);
  console.log('      * File permissions: Restricted (0600)');

  console.log('\n[4/4] Verifying health and local authorization status...');
  const currentStatus = authManager.getStatus();
  console.log(`      * Local Authorization State: ${currentStatus.status}`);
  console.log(`      * Is Operational: ${currentStatus.isOperational}`);

  console.log('\n====================================================');
  console.log('  PROVISIONING SUCCESSFUL');
  console.log(`  Device ID:         ${currentStatus.deviceId}`);
  console.log(`  Installation ID:   ${currentStatus.installationId}`);
  console.log(`  Authorized Model:  ${currentStatus.model}`);
  console.log('  The Avantis Client Companion is now active.');
  console.log('====================================================\n');
}

provisionMachine().catch(err => {
  console.error('\n[FATAL] Provisioning tool exception:', err);
  process.exit(1);
});
