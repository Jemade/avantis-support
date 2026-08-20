# database.py
#
# SQLite connection + schema. Standard library only (sqlite3) - no external
# database service needed. This file is only ever imported, never run
# directly.

import sqlite3
from contextlib import closing

from config import DB_PATH


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with closing(get_db()) as conn, conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS devices (
                hostname TEXT PRIMARY KEY,
                os TEXT,
                last_seen TEXT,
                cpu_usage REAL,
                ram_usage REAL,
                disk_percent_used REAL,
                disk_free_gb REAL,
                disk_total_gb REAL,
                battery_percent REAL,
                battery_plugged INTEGER,
                uptime_seconds INTEGER,
                health_score INTEGER,
                health_status TEXT,
                raw_json TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS telemetry_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hostname TEXT,
                timestamp TEXT,
                cpu_usage REAL,
                ram_usage REAL,
                disk_percent_used REAL,
                battery_percent REAL,
                health_score INTEGER,
                raw_json TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hostname TEXT,
                timestamp TEXT,
                severity TEXT,
                message TEXT,
                resolved INTEGER DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hostname TEXT,
                created_at TEXT,
                subject TEXT,
                description TEXT,
                diagnostics_json TEXT,
                status TEXT DEFAULT 'open',
                source TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cleanup_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hostname TEXT,
                timestamp TEXT,
                freed_mb REAL,
                items_removed INTEGER,
                plan_json TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hostname TEXT,
                timestamp TEXT,
                user_message TEXT,
                assistant_reply TEXT,
                matched_issue_id INTEGER,
                escalated INTEGER DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS knowledge_base (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keywords TEXT,
                issue TEXT,
                solution TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS software_inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hostname TEXT,
                name TEXT,
                version TEXT,
                publisher TEXT,
                install_date TEXT,
                updated_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS driver_inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hostname TEXT,
                device_name TEXT,
                manufacturer TEXT,
                driver_version TEXT,
                driver_date TEXT,
                updated_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS hotfix_inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hostname TEXT,
                hotfix_id TEXT,
                description TEXT,
                installed_on TEXT,
                updated_at TEXT,
                UNIQUE(hostname, hotfix_id)
            )
        """)
        _seed_knowledge_base_if_empty(conn)


def _seed_knowledge_base_if_empty(conn):
    """Seeds a starter set of known issues so the assistant has something
    to be 'grounded' in from day one. Replace/expand with real Avantis
    product manual entries - these are placeholders."""
    count = conn.execute("SELECT COUNT(*) AS c FROM knowledge_base").fetchone()["c"]
    if count > 0:
        return
    starter_entries = [
        ("battery drain fast draining short life",
         "Battery draining faster than expected",
         "Check Settings > Battery for apps with high background usage. "
         "If battery health is below 60% in your diagnostics, this is "
         "expected wear and a replacement may be warranted."),
        ("slow laptop slow computer lagging freezing",
         "System running slowly",
         "Run a cleanup scan (Home > Run Cleanup) to clear temp files, "
         "and check the Diagnostics tab for high CPU/RAM usage from "
         "background processes."),
        ("wifi disconnect network slow internet drop",
         "Wi-Fi dropping or slow internet",
         "Run a network diagnostic (Troubleshoot > Network) to check "
         "latency and packet loss. Restarting the router and moving "
         "closer to it resolves most cases."),
        ("noisy fan loud fan hot overheating",
         "Fan noise or overheating",
         "Ensure vents aren't blocked and the laptop is on a hard "
         "surface. If drive or CPU temperature alerts are active in "
         "your diagnostics, a hardware inspection may be needed."),
        ("disk full storage space low no space",
         "Running out of storage space",
         "Run a cleanup scan to see how much space can be freed from "
         "temp files and the recycle bin. Consider moving large files "
         "to external/cloud storage."),
    ]
    conn.executemany(
        "INSERT INTO knowledge_base (keywords, issue, solution) VALUES (?, ?, ?)",
        starter_entries,
    )
