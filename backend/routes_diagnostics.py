# routes_diagnostics.py
#
# The "Run Full System Diagnostics" scenario (mirrors the Full system
# scan / Update software / Scan hardware / Boost performance /
# Optimize network / Remove viruses buttons on a SupportAssist-style
# home screen). Everything here stays on the backend: each endpoint
# evaluates the LATEST telemetry already stored for a device rather
# than commanding the agent to do something live - the backend has no
# channel back to the agent, it only receives pushes every 3s.
#
# Also included: small compatibility aliases (/api/telemetry/latest,
# /api/telemetry/devices, /api/history, /api/tickets) so the existing
# frontend's api.js works against this backend without changes.
#
# This file defines an APIRouter that main.py includes - only ever
# imported, never run directly.

import json
import datetime
from contextlib import closing

from fastapi import APIRouter, Request, HTTPException

from database import get_db
from rules import (
    run_component_test, build_cleanup_plan, evaluate_network,
    build_activity_summary, build_diagnostics_snapshot,
)

router = APIRouter()

VALID_COMPONENTS = {"cpu", "memory", "storage", "power"}


def _get_device(conn, hostname):
    row = conn.execute("SELECT * FROM devices WHERE hostname = ?", (hostname,)).fetchone()
    return dict(row) if row else None


def _resolve_hostname(conn, hostname):
    """Falls back to the most recently active device if no hostname is
    given, so the frontend can call these without always knowing which
    device it's talking about yet."""
    if hostname:
        return hostname
    row = conn.execute("SELECT hostname FROM devices ORDER BY last_seen DESC LIMIT 1").fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="No devices have reported telemetry yet.")
    return row["hostname"]


# ---- Diagnostics: hardware component tests -------------------------------

@router.post("/api/diagnostics/run/{component}")
def run_single_test(component: str, hostname: str = None):
    if component not in VALID_COMPONENTS:
        raise HTTPException(status_code=400, detail=f"Unknown component '{component}'.")
    with closing(get_db()) as conn:
        hostname = _resolve_hostname(conn, hostname)
        device = _get_device(conn, hostname)
    return run_component_test(component, device)


@router.post("/api/diagnostics/run-full")
def run_full_test(hostname: str = None):
    with closing(get_db()) as conn:
        hostname = _resolve_hostname(conn, hostname)
        device = _get_device(conn, hostname)
    return {c: run_component_test(c, device) for c in VALID_COMPONENTS}


# ---- Diagnostics: boost / network / security ------------------------------

@router.post("/api/diagnostics/boost")
def boost_performance(hostname: str = None):
    """Cleanup pass. Actual file deletion still happens on the agent -
    this reads the agent's last-reported cleanup_scan hint, builds the
    plan, and logs it as if it were carried out."""
    with closing(get_db()) as conn, conn:
        hostname = _resolve_hostname(conn, hostname)
        device = _get_device(conn, hostname)
        raw = json.loads(device["raw_json"]) if device and device.get("raw_json") else {}
        plan = build_cleanup_plan(raw)
        freed_mb = sum(item["estimated_mb"] for item in plan)
        items_removed = len(plan)
        now = datetime.datetime.utcnow().isoformat()
        conn.execute(
            "INSERT INTO cleanup_log (hostname, timestamp, freed_mb, items_removed, plan_json) "
            "VALUES (?, ?, ?, ?, ?)",
            (hostname, now, freed_mb, items_removed, json.dumps(plan))
        )
    return {"hostname": hostname, "plan": plan, "freed_mb": freed_mb, "items_removed": items_removed}


@router.post("/api/diagnostics/network")
def network_optimize(hostname: str = None):
    with closing(get_db()) as conn:
        hostname = _resolve_hostname(conn, hostname)
        device = _get_device(conn, hostname)
        raw = json.loads(device["raw_json"]) if device and device.get("raw_json") else {}
    recommendations = evaluate_network(raw.get("network"))
    return {"hostname": hostname, "recommendations": recommendations}


@router.post("/api/diagnostics/security")
def security_scan(hostname: str = None):
    """Deliberately a stub, same as /api/security/status - the plan doc
    recommends licensing an AV engine rather than building one."""
    with closing(get_db()) as conn:
        hostname = _resolve_hostname(conn, hostname)
    return {
        "hostname": hostname,
        "antivirus_integrated": False,
        "threats_removed": 0,
        "note": "No AV engine built here by design - integrate a licensed vendor's status API here.",
    }


@router.get("/api/diagnostics/summary")
def activity_summary(hostname: str = None, days: int = 90):
    """The 90-day activity summary cards: software updates installed,
    drive space recovered, files optimized, threats removed."""
    with closing(get_db()) as conn:
        hostname = _resolve_hostname(conn, hostname)
        summary = build_activity_summary(conn, hostname, days)
    return {"hostname": hostname, "period_days": days, **summary}


# ---- Frontend-compat aliases ----------------------------------------------

@router.get("/api/telemetry/latest")
def telemetry_latest(hostname: str = None):
    with closing(get_db()) as conn:
        hostname = _resolve_hostname(conn, hostname)
        device = _get_device(conn, hostname)
    if not device:
        raise HTTPException(status_code=404, detail="No telemetry found for this device")
    return device


@router.get("/api/telemetry/devices")
def telemetry_devices():
    with closing(get_db()) as conn:
        rows = conn.execute("SELECT * FROM devices ORDER BY last_seen DESC").fetchall()
    devices = [dict(r) for r in rows]
    summary = {
        "total": len(devices),
        "healthy": sum(1 for d in devices if d["health_status"] == "HEALTHY"),
        "warning": sum(1 for d in devices if d["health_status"] == "WARNING"),
        "critical": sum(1 for d in devices if d["health_status"] == "CRITICAL"),
    }
    return {"summary": summary, "devices": devices}


@router.get("/api/history")
def telemetry_history_alias(hostname: str = None, limit: int = 100):
    with closing(get_db()) as conn:
        hostname = _resolve_hostname(conn, hostname)
        rows = conn.execute(
            "SELECT timestamp, cpu_usage, ram_usage, disk_percent_used, battery_percent, "
            "health_score FROM telemetry_history WHERE hostname = ? "
            "ORDER BY id DESC LIMIT ?", (hostname, limit)
        ).fetchall()
    return {"hostname": hostname, "history": [dict(r) for r in rows]}


@router.post("/api/tickets")
async def create_ticket(request: Request):
    data = await request.json()
    hostname = data.get("hostname", "unknown")
    now = datetime.datetime.utcnow().isoformat()
    with closing(get_db()) as conn, conn:
        diagnostics = build_diagnostics_snapshot(conn, hostname)
        cur = conn.execute(
            "INSERT INTO tickets (hostname, created_at, subject, description, diagnostics_json, status, source) "
            "VALUES (?, ?, ?, ?, ?, 'open', 'manual')",
            (hostname, now, data.get("subject", "Support request"), data.get("description", ""),
             json.dumps(diagnostics))
        )
    return {"status": "created", "ticket_id": cur.lastrowid}
