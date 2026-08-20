# main.py
#
# Avantis Assist - Backend (entry point)
# ---------------------------------------
# This is the ONLY file you run: `python main.py`.
#
# Everything else (config.py, database.py, rules.py, routes_*.py) is a
# module that gets imported here - none of those files are meant to be
# run directly, they just organize the logic so it isn't all in one
# giant file.
#
#   config.py            - all threshold/rule constants
#   database.py           - SQLite connection + schema (stdlib, no server needed)
#   rules.py               - threshold evaluation, health scoring, cleanup
#                             plan, network tips, chat matching (pure logic,
#                             easy to test on its own)
#   routes_monitoring.py   - telemetry ingestion, devices, alerts
#   routes_actions.py      - cleanup, network diagnostics, security stub
#   routes_support.py      - AI chat assistant, knowledge base, tickets
#   routes_errors.py       - real OS-level error log ingestion (Windows
#                             Event Log style: driver crashes, disk read
#                             failures, service failures)
#
# What this fulfills, mapped to the "Avantis AI Support Plan" doc:
#   Phase 1: health monitoring via thresholds, cleanup tools, manual tickets.
#   Phase 2: AI chat assistant grounded in a knowledge base + live device
#            diagnostics, auto-escalating to a ticket when it can't resolve.
#   Deliberately NOT built: Phase 3 predictive ML (needs real fleet failure
#   data we don't have yet) and an antivirus engine (doc recommends
#   licensing one instead of building it).

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from database import init_db
import routes_monitoring
import routes_actions
import routes_support
import routes_errors
import routes_diagnostics
import routes_software

app = FastAPI(title="Avantis Assist - Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to your web app's domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_diagnostics.router)
app.include_router(routes_software.router)
app.include_router(routes_monitoring.router)
app.include_router(routes_actions.router)
app.include_router(routes_support.router)
app.include_router(routes_errors.router)


@app.get("/")
def root():
    return {"service": "Avantis Assist Backend", "status": "running"}


# Runs once, whether started via `python main.py` or `uvicorn main:app`
init_db()

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
