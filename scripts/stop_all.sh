#!/usr/bin/env bash

echo "Stopping Avantis services on ports 9140, 9141, 9142..."

for PORT in 9140 9141 9142; do
  PID=$(lsof -ti :$PORT 2>/dev/null || fuser $PORT/tcp 2>/dev/null || true)
  if [ -n "$PID" ]; then
    kill -9 $PID 2>/dev/null || true
    echo "Stopped process on port $PORT (PID $PID)"
  fi
done

echo "[OK] All Avantis services stopped."
