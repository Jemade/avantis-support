# routes_actions.py
#
# Cleanup, network tuning, and the security status stub. This file defines
# an APIRouter that main.py includes - only ever imported, never run
# directly.

import json
import datetime
from contextlib import closing

from fastapi import APIRouter, Request

from database import get_db
from rules import build_cleanup_plan, evaluate_network

router = APIRouter()


@router.post("/api/cleanup/scan")
async def cleanup_scan(request: Request):
    """Given a device's reported junk-file sizes, returns a rule-based
    cleanup plan. Actual deletion is performed locally by the agent, which
    then calls /api/cleanup/log to record what happened."""
    data = await request.json()
    plan = build_cleanup_plan(data)
    return {"hostname": data.get("hostname"), "plan": plan}


@router.post("/api/cleanup/log")
async def cleanup_log(request: Request):
    data = await request.json()
    now = datetime.datetime.utcnow().isoformat()
    with closing(get_db()) as conn, conn:
        conn.execute("""
            INSERT INTO cleanup_log (hostname, timestamp, freed_mb, items_removed, plan_json)
            VALUES (?, ?, ?, ?, ?)
        """, (
            data.get("hostname"), now, data.get("freed_mb", 0),
            data.get("items_removed", 0), json.dumps(data.get("plan", []))
        ))
    return {"status": "logged"}


@router.post("/api/network/diagnose")
async def network_diagnose(request: Request):
    data = await request.json()
    recommendations = evaluate_network(data.get("network") or data)
    return {"hostname": data.get("hostname"), "recommendations": recommendations}


@router.get("/api/security/status/{hostname}")
def security_status(hostname: str):
    """Deliberately a stub. The plan doc recommends licensing an existing
    antivirus engine rather than building one in-house. This endpoint marks
    where a licensed vendor's status would be reported once integrated."""
    return {
        "hostname": hostname,
        "antivirus_integrated": False,
        "note": "No AV engine built here by design - see the plan doc's "
                "open questions. Integrate a licensed vendor's status API here."
    }
