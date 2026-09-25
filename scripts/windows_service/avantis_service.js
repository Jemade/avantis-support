/**
 * Avantis Windows Service Runner
 * Runs the Avantis Client Companion Background Health & Telemetry service
 * independently of whether the client desktop UI application is running.
 */

const path = require('path');

// Ensure correct working directory when spawned as a Windows Service
process.chdir(path.resolve(__dirname, '..', '..', 'agent'));

console.log('[Avantis Windows Service] Starting Avantis Hardware Agent Service...');

// Start the core background agent
require('../../agent/src/index.js');
