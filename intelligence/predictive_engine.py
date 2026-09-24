"""
Avantis Assist - Predictive Health Engine
Deterministic statistical trend detection + Scikit-Learn ML feature engineering.
"""

from typing import List, Dict, Any, Optional
import datetime

class PredictiveEngine:
    def __init__(self):
        pass

    def detect_trends(self, scan_history: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Pure mathematical trend analysis across historical diagnostic scans.
        Zero hallucinations, zero LLM guesswork in statistical math.
        """
        if not scan_history or len(scan_history) < 1:
            return []

        # Sort scans chronologically
        sorted_scans = sorted(
            scan_history,
            key=lambda s: s.get("timestampUtc") or s.get("generatedAt") or "1970-01-01"
        )
        flags = []

        # Helper to extract hardware data
        def get_hw(scan):
            if "snapshot" in scan:
                return scan["snapshot"]
            if "latestSnapshot" in scan:
                return scan["latestSnapshot"]
            modules = scan.get("modules", [])
            for m in modules:
                if m.get("key") == "hardware":
                    return m.get("data", {})
            return scan

        # ==========================================
        # 1. RAPID DISK STORAGE LOSS (>= 15% drop across 3+ scans)
        # ==========================================
        storage_points = []
        for s in sorted_scans:
            hw = get_hw(s)
            vols = hw.get("volumes", [])
            if not vols and "storage" in hw:
                vols = [hw["storage"]]
            c_vol = next((v for v in vols if str(v.get("mountPoint", "")).upper().startswith("C")), None)
            if not c_vol and vols:
                c_vol = vols[0]
            if c_vol and "freeGb" in c_vol and "totalGb" in c_vol:
                storage_points.append(c_vol)
            elif c_vol and "freeGB" in c_vol and "totalGB" in c_vol:
                storage_points.append({"freeGb": c_vol["freeGB"], "totalGb": c_vol["totalGB"]})

        if len(storage_points) >= 3:
            first = storage_points[0]
            latest = storage_points[-1]
            tot = first.get("totalGb") or first.get("totalGB") or 100.0
            first_free = first.get("freeGb") or first.get("freeGB") or 0.0
            latest_free = latest.get("freeGb") or latest.get("freeGB") or 0.0

            if tot > 0 and first_free > latest_free:
                drop_pct = round(((first_free - latest_free) / tot) * 100)
                if drop_pct >= 15:
                    flags.append({
                        "type": "disk_space_declining",
                        "severity": "WARNING",
                        "dropPercent": drop_pct,
                        "initialFreeGb": round(first_free, 1),
                        "currentFreeGb": round(latest_free, 1),
                        "totalGb": round(tot, 1),
                        "samplesCount": len(storage_points),
                        "message": f"Storage space on drive C: dropped by {drop_pct}% across recent scans ({first_free:.1f} GB -> {latest_free:.1f} GB).",
                        "recommended_action": "cleanup.disk_sweep",
                        "urgency": "medium"
                    })

        # ==========================================
        # 2. THERMAL ENVELOPE DEGRADATION (>= 10°C rise)
        # ==========================================
        thermal_points = []
        for s in sorted_scans:
            hw = get_hw(s)
            cpu = hw.get("cpu", {})
            temp = cpu.get("temperatureCelsius") or cpu.get("temperatureC")
            if temp is not None and isinstance(temp, (int, float)) and temp > 0:
                thermal_points.append(temp)

        if len(thermal_points) >= 3:
            baseline = sum(thermal_points[:2]) / 2.0
            recent = thermal_points[-1]
            diff = recent - baseline
            if diff >= 10.0:
                flags.append({
                    "type": "thermal_envelope_degradation",
                    "severity": "WARNING",
                    "temperatureClimbC": round(diff, 1),
                    "baselineTempC": round(baseline, 1),
                    "currentTempC": round(recent, 1),
                    "samplesCount": len(thermal_points),
                    "message": f"Processor operating temperature climbed by {diff:.1f}°C across recent scans.",
                    "recommended_action": "inspect_thermals",
                    "urgency": "medium"
                })

        # ==========================================
        # 3. BATTERY WEAR DECAY (>= 5% increase in wear)
        # ==========================================
        wear_points = []
        for s in sorted_scans:
            hw = get_hw(s)
            bat = hw.get("battery", {})
            wear = bat.get("wearPercent")
            if wear is not None and isinstance(wear, (int, float)):
                wear_points.append(wear)

        if len(wear_points) >= 3:
            first_wear = wear_points[0]
            latest_wear = wear_points[-1]
            diff_wear = latest_wear - first_wear
            if diff_wear >= 5:
                flags.append({
                    "type": "battery_wear_rapid",
                    "severity": "WARNING",
                    "wearIncreasePercent": diff_wear,
                    "initialWear": first_wear,
                    "currentWear": latest_wear,
                    "message": f"Battery capacity degraded by {diff_wear}% over recent scan intervals.",
                    "recommended_action": "calibrate_battery",
                    "urgency": "medium"
                })

        # ==========================================
        # 4. SMART HARDWARE ANOMALIES
        # ==========================================
        for s in sorted_scans:
            hw = get_hw(s)
            disks = hw.get("disks", [])
            for d in disks:
                status = str(d.get("smartStatus", "")).upper()
                predict_fail = d.get("predictFailure", False)
                if predict_fail or "PREDICTIVE_FAILURE" in status or "BAD" in status:
                    flags.append({
                        "type": "smart_anomaly",
                        "severity": "CRITICAL",
                        "smartStatus": "PREDICTIVE_FAILURE",
                        "driveModel": d.get("model", "Primary Storage Drive"),
                        "message": f"Drive {d.get('model')} has reported predictive hardware failure via SMART.",
                        "recommended_action": "backup_and_replace",
                        "urgency": "high"
                    })
                    break

        return flags

    def extract_features(self, telemetry_series: List[Dict[str, Any]]) -> Dict[str, float]:
        """Extract statistical features from telemetry series for ML inference."""
        if not telemetry_series:
            return {}

        cpu_loads = [t.get("cpuLoadPercent", 0.0) for t in telemetry_series if t.get("cpuLoadPercent") is not None]
        temps = [t.get("cpuTempC", 0.0) for t in telemetry_series if t.get("cpuTempC") is not None]
        rams = [t.get("ramUsedPercent", 0.0) for t in telemetry_series if t.get("ramUsedPercent") is not None]

        return {
            "avg_cpu_load": sum(cpu_loads) / len(cpu_loads) if cpu_loads else 0.0,
            "max_cpu_load": max(cpu_loads) if cpu_loads else 0.0,
            "avg_cpu_temp": sum(temps) / len(temps) if temps else 0.0,
            "max_cpu_temp": max(temps) if temps else 0.0,
            "avg_ram_used": sum(rams) / len(rams) if rams else 0.0,
            "samples_count": float(len(telemetry_series))
        }
