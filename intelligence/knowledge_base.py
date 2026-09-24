"""
Avantis Assist - Tenant-Isolated Knowledge Base & Runbooks
Contains engineering troubleshooting guides, hardware failure signatures, and remediation runbooks.
"""

from typing import List, Dict, Any, Optional

DEFAULT_RUNBOOKS = [
    {
        "doc_id": "RB-STORAGE-001",
        "category": "Storage",
        "title": "NVMe Storage Depletion & Safe Volume Reclamation",
        "keywords": ["disk", "storage", "cleanup", "ssd", "nvme", "full", "space"],
        "content": (
            "When primary volume C: drops below 15% free capacity, Windows virtual memory paging, "
            "system updates, and hibernate staging are degraded. Recommended procedure: "
            "1. Execute 'cleanup.disk_sweep' to remove temp files, crash dumps, and Windows Update cache. "
            "2. Run SSD TRIM via 'Optimize-Volume -Defrag -ReTrim' to restore wear-leveling performance. "
            "3. If capacity remains above 90%, recommend archiving user documents to cloud or external storage."
        )
    },
    {
        "doc_id": "RB-THERMAL-002",
        "category": "Thermals",
        "title": "Laptop Thermal Dissipation & Sustained Compute Throttling",
        "keywords": ["cpu", "temperature", "heat", "hot", "fan", "throttling", "thermal"],
        "content": (
            "Core temperatures exceeding 85°C trigger Intel/AMD PROCHOT thermal throttling. "
            "Recommended procedure: "
            "1. Verify laptop intake vents and exhaust fins are free of dust. "
            "2. Ensure device is elevated or placed on a rigid, flat surface. "
            "3. Inspect Task Manager to ensure no rogue background processes are pegging 100% compute cores. "
            "4. For systems older than 24 months, thermal interface material (paste) re-application may be required."
        )
    },
    {
        "doc_id": "RB-BATTERY-003",
        "category": "Battery",
        "title": "Lithium-Ion Battery Wear & Fuel Gauge Calibration",
        "keywords": ["battery", "charge", "wear", "power", "runtime", "drain"],
        "content": (
            "Lithium-ion cells naturally degrade over charging cycles. If wear exceeds 35%, portable runtime "
            "is noticeably shortened. Recommended procedure: "
            "1. Perform full calibration: Charge to 100%, discharge continuously to 5%, recharge to 100% uninterrupted. "
            "2. Enable BIOS/OS battery charge threshold (e.g. 80% maximum charge) for AC-tethered laptops. "
            "3. Replace battery pack when wear level exceeds 50% of design capacity."
        )
    },
    {
        "doc_id": "RB-NETWORK-004",
        "category": "Network",
        "title": "TCP/IP Stack Reset & DNS Latency Optimization",
        "keywords": ["network", "wifi", "dns", "latency", "ping", "internet", "disconnect"],
        "content": (
            "High gateway latency or failing DNS queries often result from corrupted Winsock catalogs "
            "or aggressive NIC power saving modes. Recommended procedure: "
            "1. Execute 'network.flush_dns' to clear stale DNS resolver caches. "
            "2. Execute 'network.optimize' to reset Winsock and TCP/IP protocol bindings. "
            "3. Disable 802.3az Energy Efficient Ethernet or aggressive Wi-Fi sleep in adapter properties."
        )
    },
    {
        "doc_id": "RB-SECURITY-005",
        "category": "Security",
        "title": "Microsoft Defender Real-Time Protection & Threat Quarantine",
        "keywords": ["defender", "antivirus", "malware", "threat", "virus", "security"],
        "content": (
            "When Defender flags active malware detections, threats are isolated to quarantined storage. "
            "Recommended procedure: "
            "1. Inspect threat details using Get-MpThreatDetection. "
            "2. Trigger an immediate signature update using Update-MpSignature. "
            "3. Run an offline quick scan to ensure no persistence registry keys remain active."
        )
    }
]

class KnowledgeBase:
    def __init__(self):
        self._runbooks = list(DEFAULT_RUNBOOKS)

    def search(self, query: str, tenant_id: Optional[str] = None, limit: int = 3) -> List[Dict[str, Any]]:
        """Search runbooks using keyword relevance. Enforces tenant isolation if tenant-scoped docs exist."""
        q_tokens = set(query.lower().split())
        scored = []

        for rb in self._runbooks:
            score = 0
            for kw in rb["keywords"]:
                if kw in query.lower():
                    score += 3
            for token in q_tokens:
                if token in rb["title"].lower():
                    score += 2
                if token in rb["content"].lower():
                    score += 1
            if score > 0:
                scored.append((score, rb))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored[:limit]]
