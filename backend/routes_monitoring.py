# routes_monitoring.py
#
# Telemetry ingestion, per-device lookups, fleet dashboard data, and alerts.
# This file defines an APIRouter that main.py includes - it's only ever
# imported, never run directly.

import json
import datetime
from contextlib import closing

from fastapi import APIRouter, Request, HTTPException

from database import get_db
from rules import evaluate_system_alerts, evaluate_drive_health, calculate_health_score, \
    build_cleanup_plan, evaluate_network

router = APIRouter()


@router.post("/api/telemetry")
async def receive_telemetry(request: Request):
    """Accepts the same payload shape agent.py already sends (hostname, os,
    cpu_usage, ram_usage, disks, disk_usage, uptime, battery), plus optional
    extra fields (per-disk smart data, cleanup_scan, network) if a future
    agent version starts sending them."""
    data = await request.json()
    hostname = data.get("hostname", "unknown")
    now = datetime.datetime.utcnow().isoformat()

    system_alerts = evaluate_system_alerts(data)
    drive_alerts = evaluate_drive_health(data)
    all_alerts = system_alerts + drive_alerts
    score, status = calculate_health_score(all_alerts)

    cleanup_plan = build_cleanup_plan(data)
    network_tips = evaluate_network(data.get("network"))

    disk_usage = data.get("disk_usage", {}) or {}
    battery = data.get("battery") or {}
    uptime = data.get("uptime", {}) or {}

    with closing(get_db()) as conn, conn:
        conn.execute("""
            INSERT INTO devices (hostname, os, last_seen, cpu_usage, ram_usage,
                disk_percent_used, disk_free_gb, disk_total_gb, battery_percent,
                battery_plugged, uptime_seconds, health_score, health_status, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(hostname) DO UPDATE SET
                os=excluded.os, last_seen=excluded.last_seen,
                cpu_usage=excluded.cpu_usage, ram_usage=excluded.ram_usage,
                disk_percent_used=excluded.disk_percent_used,
                disk_free_gb=excluded.disk_free_gb, disk_total_gb=excluded.disk_total_gb,
                battery_percent=excluded.battery_percent,
                battery_plugged=excluded.battery_plugged,
                uptime_seconds=excluded.uptime_seconds,
                health_score=excluded.health_score, health_status=excluded.health_status,
                raw_json=excluded.raw_json
        """, (
            hostname, data.get("os"), now, data.get("cpu_usage"), data.get("ram_usage"),
            disk_usage.get("percent_used"), disk_usage.get("free_gb"), disk_usage.get("total_gb"),
            battery.get("percent"), int(bool(battery.get("plugged"))),
            uptime.get("seconds"), score, status, json.dumps(data)
        ))

        conn.execute("""
            INSERT INTO telemetry_history (hostname, timestamp, cpu_usage, ram_usage,
                disk_percent_used, battery_percent, health_score, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            hostname, now, data.get("cpu_usage"), data.get("ram_usage"),
            disk_usage.get("percent_used"), battery.get("percent"), score, json.dumps(data)
        ))

        for severity, message in all_alerts:
            conn.execute(
                "INSERT INTO alerts (hostname, timestamp, severity, message) VALUES (?, ?, ?, ?)",
                (hostname, now, severity, message)
            )

    return {
        "status": "success",
        "health_score": score,
        "health_status": status,
        "alerts": [{"severity": s, "message": m} for s, m in all_alerts],
        "cleanup_plan": cleanup_plan,
        "network_recommendations": network_tips,
    }


@router.get("/api/telemetry/{hostname}")
def get_latest_telemetry(hostname: str):
    with closing(get_db()) as conn:
        device = conn.execute("SELECT * FROM devices WHERE hostname = ?", (hostname,)).fetchone()
    if not device:
        raise HTTPException(status_code=404, detail="No telemetry found for this device")
    return dict(device)


@router.get("/api/telemetry/{hostname}/history")
def get_telemetry_history(hostname: str, limit: int = 100):
    with closing(get_db()) as conn:
        rows = conn.execute(
            "SELECT timestamp, cpu_usage, ram_usage, disk_percent_used, battery_percent, "
            "health_score FROM telemetry_history WHERE hostname = ? "
            "ORDER BY id DESC LIMIT ?", (hostname, limit)
        ).fetchall()
    return {"hostname": hostname, "history": [dict(r) for r in rows]}


@router.get("/api/devices")
def list_devices():
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


@router.get("/api/alerts")
def list_alerts(hostname: str = None, resolved: bool = False):
    query = "SELECT * FROM alerts WHERE resolved = ?"
    params = [int(resolved)]
    if hostname:
        query += " AND hostname = ?"
        params.append(hostname)
    query += " ORDER BY timestamp DESC"
    with closing(get_db()) as conn:
        rows = conn.execute(query, params).fetchall()
    return {"alerts": [dict(r) for r in rows]}


@router.patch("/api/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int):
    with closing(get_db()) as conn, conn:
        cur = conn.execute("UPDATE alerts SET resolved = 1 WHERE id = ?", (alert_id,))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "resolved", "alert_id": alert_id}
