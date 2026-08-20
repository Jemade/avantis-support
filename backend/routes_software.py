# routes_software.py
#
# Software + driver + hotfix inventory. The agent posts a full snapshot
# of what's installed on the machine; this stores it and lets the
# frontend/dashboard query it back (mirrors SupportAssist's "Update
# software" and driver-check features).
#
# software_inventory / driver_inventory are treated as CURRENT STATE -
# each post replaces what's stored for that hostname. hotfix_inventory
# is treated as HISTORY - entries are appended and deduped by hotfix id,
# never deleted, since "software updates installed" (see
# /api/diagnostics/summary) counts these over a rolling window.
#
# This file defines an APIRouter that main.py includes - only ever
# imported, never run directly.

import datetime
from contextlib import closing

from fastapi import APIRouter, Request

from database import get_db
from rules import evaluate_driver_staleness

router = APIRouter()


@router.post("/api/software/inventory")
async def receive_software_inventory(request: Request):
    """Expects: {"hostname": "...",
        "software": [{"name", "version", "publisher", "install_date"}, ...],
        "drivers":  [{"device_name", "manufacturer", "driver_version", "driver_date"}, ...],
        "hotfixes": [{"hotfix_id", "description", "installed_on"}, ...]}
    Call this periodically from the agent (it's slower to gather than
    telemetry, so doesn't need to run every 3s - every minute or so is
    plenty)."""
    data = await request.json()
    hostname = data.get("hostname", "unknown")
    now = datetime.datetime.utcnow().isoformat()

    software = data.get("software", []) or []
    drivers = data.get("drivers", []) or []
    hotfixes = data.get("hotfixes", []) or []

    with closing(get_db()) as conn, conn:
        conn.execute("DELETE FROM software_inventory WHERE hostname = ?", (hostname,))
        conn.executemany(
            "INSERT INTO software_inventory (hostname, name, version, publisher, install_date, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            [(hostname, s.get("name"), s.get("version"), s.get("publisher"), s.get("install_date"), now)
             for s in software]
        )

        conn.execute("DELETE FROM driver_inventory WHERE hostname = ?", (hostname,))
        conn.executemany(
            "INSERT INTO driver_inventory (hostname, device_name, manufacturer, driver_version, driver_date, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            [(hostname, d.get("device_name"), d.get("manufacturer"), d.get("driver_version"), d.get("driver_date"), now)
             for d in drivers]
        )

        for h in hotfixes:
            conn.execute(
                "INSERT OR IGNORE INTO hotfix_inventory (hostname, hotfix_id, description, installed_on, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (hostname, h.get("hotfix_id"), h.get("description"), h.get("installed_on"), now)
            )

    return {
        "status": "logged", "hostname": hostname,
        "software_count": len(software), "driver_count": len(drivers), "hotfix_count": len(hotfixes),
    }


@router.get("/api/drivers")
def get_drivers(hostname: str):
    with closing(get_db()) as conn:
        drivers = evaluate_driver_staleness(conn, hostname)
    return {"hostname": hostname, "drivers": drivers, "stale_count": sum(1 for d in drivers if d["stale"])}


@router.get("/api/software/{hostname}")
def get_software(hostname: str):
    with closing(get_db()) as conn:
        rows = conn.execute(
            "SELECT * FROM software_inventory WHERE hostname = ? ORDER BY name", (hostname,)
        ).fetchall()
    return {"hostname": hostname, "software": [dict(r) for r in rows]}


@router.get("/api/hotfixes/{hostname}")
def get_hotfixes(hostname: str, limit: int = 100):
    with closing(get_db()) as conn:
        rows = conn.execute(
            "SELECT * FROM hotfix_inventory WHERE hostname = ? ORDER BY installed_on DESC LIMIT ?",
            (hostname, limit)
        ).fetchall()
    return {"hostname": hostname, "hotfixes": [dict(r) for r in rows]}
