# config.py
#
# All threshold/rule constants live here, in one place, so tuning what
# counts as "warning" vs "critical" never means hunting through logic code.
# This file is only ever imported, never run directly.

# CPU / RAM thresholds
CPU_WARNING = 80
CPU_CRITICAL = 95

RAM_WARNING = 85
RAM_CRITICAL = 95

# Disk usage thresholds (% of system drive used)
DISK_WARNING = 85
DISK_CRITICAL = 95

# Battery thresholds (% remaining, only checked when not plugged in)
BATTERY_WARNING = 20
BATTERY_CRITICAL = 10

# Uptime nudge
UPTIME_INFO_DAYS = 7

# Drive SMART-style thresholds (Table 0: "industry-standard drive health
# indicators compared against known warning thresholds")
DRIVE_REALLOCATED_SECTORS_WARNING = 1
DRIVE_PENDING_SECTORS_CRITICAL = 1
DRIVE_TEMP_WARNING_C = 55
DRIVE_TEMP_CRITICAL_C = 65
DRIVE_POWER_ON_HOURS_INFO = 20000

# Network tuning thresholds
NETWORK_LATENCY_WARNING_MS = 150
NETWORK_PACKET_LOSS_WARNING_PCT = 2
NETWORK_DNS_WARNING_MS = 200

# Cleanup rule thresholds (minimum size worth suggesting cleanup for)
CLEANUP_TEMP_FILES_MIN_MB = 200
CLEANUP_RECYCLE_BIN_MIN_MB = 500

# Chat assistant grounding threshold - minimum keyword overlap score
CHAT_MATCH_MIN_SCORE = 1

# A driver is flagged "stale" in /api/drivers if its date is older than this
DRIVER_STALE_DAYS = 730  # ~2 years

# Database file
DB_PATH = "avantis_assist.db"
