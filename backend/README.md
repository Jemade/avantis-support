
# Avantis Assist - Backend

This is the backend API for Avantis Assist. It is built using FastAPI and SQLite, handling telemetry ingestion, threshold-based health monitoring, and system diagnostics.

## Architecture

* **Backend (`main.py`)**: The FastAPI application serving the API. All incoming data is stored locally in `avantis_assist.db`.
* **Telemetry Agent (`agent.py`)**: A Windows-specific script designed to run natively on the machines you want to monitor. It securely queries hardware states (CPU, RAM, Disks, Network, Antivirus, Battery) via WMI and posts the data back to this backend.

---

## How to Run Locally (Directly on Host)

1. **Start the Backend Server**:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
2. **Start the Telemetry Agent** (on the Windows machine you want to monitor):
   ```bash
   python agent.py
   ```

