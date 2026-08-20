# agent.py
import platform
import time
import datetime
import requests
import psutil
import wmi
import winreg
from win11toast import toast

SERVER_URL = "http://127.0.0.1:8000/api/telemetry"
SOFTWARE_URL = "http://127.0.0.1:8000/api/software/inventory"

# Software/driver/hotfix inventory is slow to gather and rarely changes -
# only refresh it every N telemetry cycles instead of every 3s.
INVENTORY_EVERY_N_CYCLES = 20  # ~ every 60s at a 3s telemetry interval

_seen_alerts = set()  # avoid re-popping the same alert every 3s


def notify(severity, message):
    icon_map = {"critical": "🔴", "warning": "🟡", "info": "🔵"}
    prefix = icon_map.get(severity, "")
    toast(f"{prefix} Avantis Assist — {severity.upper()}", message)


def capture_hardware_stats():
    w = wmi.WMI()
    
    # Query Storage Drives
    disks = []
    for disk in w.Win32_DiskDrive():
        disks.append({
            "model": disk.Model,
            "status": disk.Status,
            "size_gb": round(int(disk.Size or 0) / (1024**3), 2)
        })

    # Query Battery
    battery_data = None
    battery = psutil.sensors_battery()
    if battery:
        battery_data = {
            "percent": battery.percent,
            "plugged": battery.power_plugged
        }

    # NEW: Disk usage % of the system drive (very visible, like CPU/RAM)
    disk_usage = psutil.disk_usage("C:\\" if platform.system() == "Windows" else "/")
    disk_usage_data = {
        "percent_used": disk_usage.percent,
        "free_gb": round(disk_usage.free / (1024**3), 2),
        "total_gb": round(disk_usage.total / (1024**3), 2)
    }

    # NEW: System uptime (simple, human-relatable metric)
    boot_timestamp = psutil.boot_time()
    uptime_seconds = time.time() - boot_timestamp
    uptime_data = {
        "seconds": int(uptime_seconds),
        "readable": str(datetime.timedelta(seconds=int(uptime_seconds))),
        "boot_time": datetime.datetime.fromtimestamp(boot_timestamp).strftime("%Y-%m-%d %H:%M:%S")
    }

    # NEW: Antivirus Status
    av_status = "Not Detected / Server OS"
    try:
        w_sec = wmi.WMI(namespace=r"root\SecurityCenter2")
        avs = w_sec.AntivirusProduct()
        if avs:
            av_status = avs[0].displayName
    except Exception:
        pass

    # NEW: Network Interfaces
    network_interfaces = []
    try:
        stats = psutil.net_if_stats()
        for name, stat in stats.items():
            # Filter out Loopback and inactive interfaces
            if stat.isup and "loopback" not in name.lower() and "pseudo" not in name.lower():
                network_interfaces.append({
                    "name": name,
                    "speed_mbps": stat.speed
                })
    except Exception:
        pass

    return {
        "hostname": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "cpu_usage": psutil.cpu_percent(interval=1),
        "ram_usage": psutil.virtual_memory().percent,
        "disks": disks,
        "disk_usage": disk_usage_data,
        "uptime": uptime_data,
        "battery": battery_data,
        "antivirus": av_status,
        "network": network_interfaces
    }


def gather_installed_software():
    """Reads installed programs from the registry Uninstall keys - the
    same list Control Panel > Programs shows. Deliberately NOT using
    WMI's Win32_Product: it's known to silently trigger a repair/
    reconfigure of every installed MSI package, which is slow and can
    cause side effects on a real machine."""
    software = []
    reg_paths = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]
    for hive, path in reg_paths:
        try:
            with winreg.OpenKey(hive, path) as key:
                for i in range(winreg.QueryInfoKey(key)[0]):
                    try:
                        subkey_name = winreg.EnumKey(key, i)
                        with winreg.OpenKey(key, subkey_name) as subkey:
                            name = winreg.QueryValueEx(subkey, "DisplayName")[0]

                            def _try(field):
                                try:
                                    return winreg.QueryValueEx(subkey, field)[0]
                                except FileNotFoundError:
                                    return None

                            software.append({
                                "name": name,
                                "version": _try("DisplayVersion"),
                                "publisher": _try("Publisher"),
                                "install_date": _try("InstallDate"),  # raw YYYYMMDD string
                            })
                    except (FileNotFoundError, OSError):
                        continue
        except FileNotFoundError:
            continue
    return software


def gather_drivers(w):
    """Signed driver inventory via WMI - device, manufacturer, version,
    and driver date (parsed to ISO so the backend can flag stale ones)."""
    drivers = []
    for d in w.Win32_PnPSignedDriver():
        driver_date = None
        if d.DriverDate:
            try:
                driver_date = datetime.datetime.strptime(
                    d.DriverDate.split(".")[0], "%Y%m%d%H%M%S"
                ).date().isoformat()
            except ValueError:
                driver_date = None
        drivers.append({
            "device_name": d.DeviceName,
            "manufacturer": d.Manufacturer,
            "driver_version": d.DriverVersion,
            "driver_date": driver_date,
        })
    return drivers


def gather_hotfixes(w):
    """Installed Windows Updates (KBs) via WMI - this is what feeds the
    'software updates installed' activity summary count on the backend."""
    hotfixes = []
    for h in w.Win32_QuickFixEngineering():
        installed_on = None
        if h.InstalledOn:
            try:
                installed_on = datetime.datetime.strptime(h.InstalledOn, "%m/%d/%Y").date().isoformat()
            except ValueError:
                installed_on = h.InstalledOn  # keep raw string if format is unexpected
        hotfixes.append({
            "hotfix_id": h.HotFixID,
            "description": h.Description,
            "installed_on": installed_on,
        })
    return hotfixes


def post_software_inventory():
    w = wmi.WMI()
    payload = {
        "hostname": platform.node(),
        "software": gather_installed_software(),
        "drivers": gather_drivers(w),
        "hotfixes": gather_hotfixes(w),
    }
    res = requests.post(SOFTWARE_URL, json=payload, timeout=30)
    print(f"[{time.strftime('%X')}] Software/driver inventory posted. Response: {res.status_code}")


def main():
    print("Agent collecting metrics... Press Ctrl+C to stop.")
    cycle = 0
    try:
        while True:
            try:
                payload = capture_hardware_stats()
                res = requests.post(SERVER_URL, json=payload, timeout=5)
                print(f"[{time.strftime('%X')}] Metrics posted. Response: {res.status_code}")

                if res.ok:
                    body = res.json()
                    for alert in body.get("alerts", []):
                        severity = alert.get("severity")
                        message = alert.get("message")
                        key = (severity, message)
                        if severity in ("warning", "critical") and key not in _seen_alerts:
                            notify(severity, message)
                            _seen_alerts.add(key)

                # Software/driver/hotfix inventory is slow to gather (registry
                # + WMI scans) and rarely changes minute to minute, so it only
                # runs once at startup, then every INVENTORY_EVERY_N_CYCLES.
                if cycle == 0 or cycle % INVENTORY_EVERY_N_CYCLES == 0:
                    try:
                        post_software_inventory()
                    except Exception as e:
                        print(f"Failed to post software inventory: {e}")

            except Exception as e:
                print(f"Failed to reach server: {e}")

            cycle += 1
            time.sleep(3)  # Frequency: post metrics every 3 seconds
    except KeyboardInterrupt:
        print("\nAgent shutdown initiated.")
    finally:
        print("Cleaning up resources... Connections closed.")
        print("Agent stopped cleanly.")

if __name__ == "__main__":
    main()