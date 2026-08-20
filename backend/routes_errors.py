# routes_errors.py
#
# Ingests real OS-level errors (Windows Event Log entries: driver crashes,
# disk read failures, service failures - the kind of thing you'd get from
# querying Win32_NTLogEvent on the agent side) and writes them straight
# into the same `alerts` table as everything else, mapped to a severity.
# No separate raw log table - `alerts` is the single source of truth for
# anything worth surfacing.
#
# This file defines an APIRouter that main.py includes - only ever
# imported, never run directly.

import datetime
from contextlib import closing

from fastapi import APIRouter, Request

from database import get_db
from rules import map_error_level_to_severity

router = APIRouter()


@router.post("/api/errors")
async def receive_system_errors(request: Request):
    """Expects: {"hostname": "...", "errors": [
        {"source": "disk", "event_id": "51", "level": "Error",
         "message": "..."}, ...
    ]}
    Call this regularly from the agent (e.g. alongside /api/telemetry)
    with whatever new Windows Event Log entries have appeared since the
    last check. Each error becomes an alert (severity mapped from its
    Windows Event Log level), visible via the existing /api/alerts
    endpoint and counted in the device's health score."""
    data = await request.json()
    hostname = data.get("hostname", "unknown")
    errors = data.get("errors", []) or []
    now = datetime.datetime.utcnow().isoformat()

    alerts_raised = 0
    with closing(get_db()) as conn, conn:
        for err in errors:
            severity = map_error_level_to_severity(err.get("level"))
            if not severity:
                continue  # "Information" level entries aren't alert-worthy
            source = err.get("source", "System")
            summary = (err.get("message") or "")[:150]
            conn.execute(
                "INSERT INTO alerts (hostname, timestamp, severity, message) VALUES (?, ?, ?, ?)",
                (hostname, now, severity, f"[{source}] {summary}")
            )
            alerts_raised += 1

    return {"status": "success", "alerts_raised": alerts_raised}
