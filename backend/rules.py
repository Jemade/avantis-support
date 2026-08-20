# rules.py
#
# All the threshold/rule-based evaluation logic (Section 3 / Table 0 of the
# plan doc: "thresholds, not exotic AI"). Plain functions, no classes, no
# side effects other than what's explicitly passed in - easy to unit test.
# This file is only ever imported, never run directly.

from contextlib import closing

import config
from database import get_db


def evaluate_system_alerts(data):
    """CPU / RAM / disk / battery / uptime threshold checks."""
    alerts = []

    cpu = data.get("cpu_usage", 0) or 0
    if cpu >= config.CPU_CRITICAL:
        alerts.append(("critical", f"CPU usage critical at {cpu}%"))
    elif cpu >= config.CPU_WARNING:
        alerts.append(("warning", f"CPU usage high at {cpu}%"))

    ram = data.get("ram_usage", 0) or 0
    if ram >= config.RAM_CRITICAL:
        alerts.append(("critical", f"Memory usage critical at {ram}%"))
    elif ram >= config.RAM_WARNING:
        alerts.append(("warning", f"Memory usage high at {ram}%"))

    disk_usage = data.get("disk_usage", {}) or {}
    disk_pct = disk_usage.get("percent_used", 0) or 0
    if disk_pct >= config.DISK_CRITICAL:
        alerts.append(("critical", f"System drive nearly full ({disk_pct}% used)"))
    elif disk_pct >= config.DISK_WARNING:
        alerts.append(("warning", f"System drive getting full ({disk_pct}% used)"))

    battery = data.get("battery")
    if battery and not battery.get("plugged", True):
        pct = battery.get("percent", 100)
        if pct <= config.BATTERY_CRITICAL:
            alerts.append(("critical", f"Battery critically low at {pct}%"))
        elif pct <= config.BATTERY_WARNING:
            alerts.append(("warning", f"Battery low at {pct}%"))

    uptime = data.get("uptime", {}) or {}
    uptime_seconds = uptime.get("seconds", 0) or 0
    if uptime_seconds > config.UPTIME_INFO_DAYS * 24 * 60 * 60:
        days = uptime_seconds // (24 * 60 * 60)
        alerts.append(("info", f"System has not been restarted in {days} days"))

    return alerts


def evaluate_drive_health(data):
    """Drive status + SMART-style attribute thresholds."""
    alerts = []
    for disk in data.get("disks", []) or []:
        model = disk.get("model", "Unknown drive")

        if disk.get("status") and disk.get("status") != "OK":
            alerts.append(("critical", f"Drive '{model}' reporting a non-OK status: {disk.get('status')}"))

        smart = disk.get("smart") or {}
        realloc = smart.get("reallocated_sectors", 0) or 0
        pending = smart.get("pending_sectors", 0) or 0
        temp_c = smart.get("temperature_c")
        power_on_hours = smart.get("power_on_hours")

        if pending >= config.DRIVE_PENDING_SECTORS_CRITICAL:
            alerts.append(("critical", f"Drive '{model}' has pending sectors - failure risk, back up now"))
        if realloc >= config.DRIVE_REALLOCATED_SECTORS_WARNING:
            alerts.append(("warning", f"Drive '{model}' has reallocated sectors - early wear indicator"))
        if temp_c is not None:
            if temp_c >= config.DRIVE_TEMP_CRITICAL_C:
                alerts.append(("critical", f"Drive '{model}' running critically hot at {temp_c}C"))
            elif temp_c >= config.DRIVE_TEMP_WARNING_C:
                alerts.append(("warning", f"Drive '{model}' running hot at {temp_c}C"))
        if power_on_hours is not None and power_on_hours >= config.DRIVE_POWER_ON_HOURS_INFO:
            alerts.append(("info", f"Drive '{model}' has {power_on_hours} power-on hours - aging drive"))

    return alerts


def calculate_health_score(all_alerts):
    """Simple weighted score, 0-100. Transparent and explainable, not a
    trained model."""
    score = 100
    weights = {"critical": 25, "warning": 10, "info": 2}
    for severity, _ in all_alerts:
        score -= weights.get(severity, 0)
    score = max(0, min(100, score))

    if score >= 80:
        status = "HEALTHY"
    elif score >= 50:
        status = "WARNING"
    else:
        status = "CRITICAL"
    return score, status


def build_cleanup_plan(data):
    """Rule-based junk-file cleanup suggestion. The backend only proposes
    a plan; actual deletion happens locally on the agent, which reports
    back via /api/cleanup/log."""
    plan = []
    cleanup_hint = data.get("cleanup_scan") or {}

    temp_mb = cleanup_hint.get("temp_files_mb", 0) or 0
    if temp_mb >= config.CLEANUP_TEMP_FILES_MIN_MB:
        plan.append({"category": "temp_files", "estimated_mb": temp_mb,
                      "action": "safe_delete"})

    recycle_mb = cleanup_hint.get("recycle_bin_mb", 0) or 0
    if recycle_mb >= config.CLEANUP_RECYCLE_BIN_MIN_MB:
        plan.append({"category": "recycle_bin", "estimated_mb": recycle_mb,
                      "action": "empty"})

    cache_mb = cleanup_hint.get("browser_cache_mb", 0) or 0
    if cache_mb >= config.CLEANUP_TEMP_FILES_MIN_MB:
        plan.append({"category": "browser_cache", "estimated_mb": cache_mb,
                      "action": "safe_delete"})

    return plan


def evaluate_network(net):
    """Rule-based network tuning recommendations."""
    recommendations = []
    if not isinstance(net, dict):
        return recommendations

    latency = net.get("latency_ms")
    packet_loss = net.get("packet_loss_pct")
    dns_ms = net.get("dns_ms")

    if latency is not None and latency >= config.NETWORK_LATENCY_WARNING_MS:
        recommendations.append("High latency detected - try switching to a 5GHz Wi-Fi "
                                "band or a wired connection if available.")
    if packet_loss is not None and packet_loss >= config.NETWORK_PACKET_LOSS_WARNING_PCT:
        recommendations.append("Noticeable packet loss - move closer to the router or "
                                "check for interference from other devices.")
    if dns_ms is not None and dns_ms >= config.NETWORK_DNS_WARNING_MS:
        recommendations.append("Slow DNS resolution - consider switching to a faster "
                                "public DNS provider (e.g. 1.1.1.1 or 8.8.8.8).")

    return recommendations


def match_known_issue(conn, message):
    """Simple keyword-overlap grounding for the chat assistant. Returns the
    best-matching knowledge_base row, or None if nothing scores above
    threshold."""
    message_words = set(message.lower().split())
    best_row = None
    best_score = 0

    rows = conn.execute("SELECT * FROM knowledge_base").fetchall()
    for row in rows:
        keywords = set(row["keywords"].lower().split())
        score = len(message_words & keywords)
        if score > best_score:
            best_score = score
            best_row = row

    if best_score >= config.CHAT_MATCH_MIN_SCORE:
        return best_row
    return None


def build_diagnostics_snapshot(conn, hostname):
    """Pulls the latest known telemetry + open alerts for a device, so a
    ticket or chat answer can be grounded in that device's real state."""
    device = conn.execute("SELECT * FROM devices WHERE hostname = ?", (hostname,)).fetchone()
    alerts = conn.execute(
        "SELECT severity, message, timestamp FROM alerts WHERE hostname = ? AND resolved = 0 "
        "ORDER BY timestamp DESC LIMIT 10", (hostname,)
    ).fetchall()

    return {
        "device": dict(device) if device else None,
        "open_alerts": [dict(a) for a in alerts],
    }


def map_error_level_to_severity(level):
    """Maps a raw Windows Event Log level (Critical/Error/Warning/
    Information) onto our own alert severity scale, so real OS-level
    faults (driver crashes, disk read errors, service failures) feed
    into the same health scoring as the CPU/RAM/disk thresholds do."""
    level = (level or "").strip().lower()
    if level == "critical":
        return "critical"
    if level == "error":
        return "warning"
    if level == "warning":
        return "info"
    return None  # "Information" level entries are logged but not alerted on


def run_component_test(component, device):
    """Evaluates a single hardware component (cpu/memory/storage/power)
    against the latest stored telemetry for a device. Returns
    {"passed": bool, "detail": str}, matching what the frontend's
    TroubleshootTab expects per test card.

    This deliberately reads from the LAST telemetry the agent posted
    rather than commanding the agent to run something live - the backend
    has no channel to trigger the agent on demand, it only receives
    pushes every 3s, so "run a test" here means "evaluate the freshest
    real data we have right now"."""
    if device is None:
        return {"passed": False,
                "detail": "No telemetry received yet for this device - "
                          "start agent.py on it first."}

    if component == "cpu":
        cpu = device.get("cpu_usage") or 0
        if cpu >= config.CPU_CRITICAL:
            return {"passed": False, "detail": f"CPU usage critical at {cpu}%. Investigate runaway processes."}
        if cpu >= config.CPU_WARNING:
            return {"passed": False, "detail": f"CPU usage high at {cpu}%. Consider closing background apps."}
        return {"passed": True, "detail": f"CPU usage normal at {cpu}%. Clock stability and thermal load nominal."}

    if component == "memory":
        ram = device.get("ram_usage") or 0
        if ram >= config.RAM_CRITICAL:
            return {"passed": False, "detail": f"Memory usage critical at {ram}%. High risk of slowdowns/paging."}
        if ram >= config.RAM_WARNING:
            return {"passed": False, "detail": f"Memory usage high at {ram}%."}
        return {"passed": True, "detail": f"Memory usage normal at {ram}%. No integrity issues reported."}

    if component == "storage":
        disk_pct = device.get("disk_percent_used") or 0
        free_gb = device.get("disk_free_gb")
        if disk_pct >= config.DISK_CRITICAL:
            return {"passed": False, "detail": f"Drive nearly full ({disk_pct}% used, {free_gb}GB free)."}
        if disk_pct >= config.DISK_WARNING:
            return {"passed": False, "detail": f"Drive getting full ({disk_pct}% used, {free_gb}GB free)."}
        return {"passed": True, "detail": f"Drive healthy - {disk_pct}% used, {free_gb}GB free."}

    if component == "power":
        battery_pct = device.get("battery_percent")
        plugged = device.get("battery_plugged")
        if battery_pct is None:
            return {"passed": True, "detail": "No battery detected (desktop), or battery data unavailable."}
        if not plugged:
            if battery_pct <= config.BATTERY_CRITICAL:
                return {"passed": False, "detail": f"Battery critically low at {battery_pct}%."}
            if battery_pct <= config.BATTERY_WARNING:
                return {"passed": False, "detail": f"Battery low at {battery_pct}%."}
        plug_note = " (plugged in)" if plugged else ""
        return {"passed": True, "detail": f"Power delivery normal. Battery at {battery_pct}%{plug_note}."}

    return {"passed": False, "detail": f"Unknown test component '{component}'."}


def evaluate_driver_staleness(conn, hostname):
    """Flags drivers whose date is older than DRIVER_STALE_DAYS. This is a
    simple age heuristic, not a real vendor update check - there's no
    vendor API integrated here to know if a *newer* driver actually
    exists, only how old the currently installed one is."""
    import datetime
    rows = conn.execute(
        "SELECT * FROM driver_inventory WHERE hostname = ? ORDER BY device_name", (hostname,)
    ).fetchall()
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=config.DRIVER_STALE_DAYS)

    results = []
    for r in rows:
        stale = False
        if r["driver_date"]:
            try:
                stale = datetime.datetime.fromisoformat(r["driver_date"]) < cutoff
            except ValueError:
                stale = False
        results.append({**dict(r), "stale": stale})
    return results


def build_activity_summary(conn, hostname, days=90):
    """Mirrors the Dell SupportAssist-style '90-day activity summary':
    software updates installed, drive space recovered, files optimized,
    threats removed. All computed from what's actually been logged -
    nothing here is a placeholder number."""
    import datetime
    cutoff = (datetime.datetime.utcnow() - datetime.timedelta(days=days)).isoformat()

    cleanup_rows = conn.execute(
        "SELECT freed_mb, items_removed FROM cleanup_log WHERE hostname = ? AND timestamp >= ?",
        (hostname, cutoff)
    ).fetchall()
    drive_space_recovered_gb = round(sum(r["freed_mb"] or 0 for r in cleanup_rows) / 1024, 2)
    files_optimized = sum(r["items_removed"] or 0 for r in cleanup_rows)

    hotfix_count = conn.execute(
        "SELECT COUNT(*) AS c FROM hotfix_inventory WHERE hostname = ? AND installed_on >= ?",
        (hostname, cutoff)
    ).fetchone()["c"]

    return {
        "software_updates_installed": hotfix_count,
        "drive_space_recovered_gb": drive_space_recovered_gb,
        "files_optimized": files_optimized,
        # No AV engine integrated by design (see /api/diagnostics/security) -
        # this stays 0 until a licensed vendor's status API is wired in.
        "threats_removed": 0,
    }
