#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==================================================="
echo "  AVANTIS ASSIST ENTERPRISE PLATFORM (Linux)"
echo "  Endpoint Intelligence and Diagnostics"
echo "==================================================="

echo "[1/3] Starting Avantis Platform Backend (Port 9141)..."
(cd "$DIR/backend" && node src/server.js) &
PID_BACKEND=$!

echo "[2/3] Starting Avantis Hardware Agent (Port 9140)..."
(cd "$DIR/agent" && node src/index.js) &
PID_AGENT=$!

echo "[3/3] Starting Avantis Client Desktop UI (Port 9142)..."
(cd "$DIR/client-ui" && node server.js) &
PID_CLIENT=$!

echo ""
echo "==================================================="
echo "  [OK] All Avantis Services Active!"
echo "==================================================="
echo "  - Backend API:          http://localhost:9141"
echo "  - Local Hardware Agent: http://localhost:9140"
echo "  - Client Desktop UI:    http://localhost:9142"
echo "==================================================="

wait
