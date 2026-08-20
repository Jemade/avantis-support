# routes_support.py
#
# AI chat assistant, knowledge base management, and ticketing. This file
# defines an APIRouter that main.py includes - only ever imported, never
# run directly.

import json
import datetime
from contextlib import closing

from fastapi import APIRouter, Request, HTTPException

from database import get_db
from rules import match_known_issue, build_diagnostics_snapshot

router = APIRouter()


@router.post("/api/chat")
async def chat(request: Request):
    data = await request.json()
    hostname = data.get("hostname", "unknown")
    message = data.get("message", "")
    now = datetime.datetime.utcnow().isoformat()

    with closing(get_db()) as conn, conn:
        match = match_known_issue(conn, message)

        if match:
            reply = f"{match['issue']}: {match['solution']}"
            escalated = False
            ticket_id = None
        else:
            diagnostics = build_diagnostics_snapshot(conn, hostname)
            reply = ("I couldn't confidently resolve that from our known issues. "
                      "I've created a support ticket with your device's current "
                      "diagnostics attached, so you won't need to repeat this.")
            escalated = True
            cur = conn.execute("""
                INSERT INTO tickets (hostname, created_at, subject, description,
                    diagnostics_json, status, source)
                VALUES (?, ?, ?, ?, ?, 'open', 'ai_escalation')
            """, (
                hostname, now, message[:80] or "Unresolved chat query",
                message, json.dumps(diagnostics)
            ))
            ticket_id = cur.lastrowid

        conn.execute("""
            INSERT INTO chat_log (hostname, timestamp, user_message, assistant_reply,
                matched_issue_id, escalated)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            hostname, now, message, reply,
            match["id"] if match else None, int(escalated)
        ))

    response = {"reply": reply, "escalated": escalated}
    if ticket_id:
        response["ticket_id"] = ticket_id
    return response


@router.get("/api/knowledge")
def list_knowledge():
    with closing(get_db()) as conn:
        rows = conn.execute("SELECT * FROM knowledge_base").fetchall()
    return {"knowledge_base": [dict(r) for r in rows]}


@router.post("/api/knowledge")
async def add_knowledge(request: Request):
    """Lets support staff grow the grounding knowledge base over time with
    real Avantis product manual entries and known issues."""
    data = await request.json()
    keywords = data.get("keywords", "")
    issue = data.get("issue", "")
    solution = data.get("solution", "")
    if not (keywords and issue and solution):
        raise HTTPException(status_code=400, detail="keywords, issue, and solution are all required")

    with closing(get_db()) as conn, conn:
        cur = conn.execute(
            "INSERT INTO knowledge_base (keywords, issue, solution) VALUES (?, ?, ?)",
            (keywords, issue, solution)
        )
    return {"status": "added", "id": cur.lastrowid}


@router.post("/api/tickets")
async def create_ticket(request: Request):
    data = await request.json()
    hostname = data.get("hostname", "unknown")
    now = datetime.datetime.utcnow().isoformat()

    with closing(get_db()) as conn, conn:
        diagnostics = build_diagnostics_snapshot(conn, hostname)
        cur = conn.execute("""
            INSERT INTO tickets (hostname, created_at, subject, description,
                diagnostics_json, status, source)
            VALUES (?, ?, ?, ?, ?, 'open', 'manual')
        """, (
            hostname, now, data.get("subject", "Support request"),
            data.get("description", ""), json.dumps(diagnostics)
        ))
    return {"status": "created", "ticket_id": cur.lastrowid}


@router.get("/api/tickets")
def list_tickets(status: str = None):
    query = "SELECT * FROM tickets"
    params = []
    if status:
        query += " WHERE status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC"
    with closing(get_db()) as conn:
        rows = conn.execute(query, params).fetchall()
    tickets = []
    for r in rows:
        t = dict(r)
        t["diagnostics"] = json.loads(t.pop("diagnostics_json") or "{}")
        tickets.append(t)
    return {"tickets": tickets}


@router.patch("/api/tickets/{ticket_id}")
async def update_ticket(ticket_id: int, request: Request):
    data = await request.json()
    new_status = data.get("status")
    if new_status not in ("open", "in_progress", "resolved", "closed"):
        raise HTTPException(status_code=400, detail="status must be one of: open, in_progress, resolved, closed")

    with closing(get_db()) as conn, conn:
        cur = conn.execute("UPDATE tickets SET status = ? WHERE id = ?", (new_status, ticket_id))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"status": "updated", "ticket_id": ticket_id, "new_status": new_status}
