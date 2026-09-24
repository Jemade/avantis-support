# ADR 003: Telemetry Collection & Offline Spooling

## Status
Accepted

## Context
Endpoints operate in diverse network conditions, including field laptops with intermittent Wi-Fi, airplane mode, or roaming connections. The legacy implementation dropped telemetry whenever the cloud backend was unreachable. Furthermore, frequent polling (every 5 seconds) across the entire hardware tree generates excessive power and disk overhead.

## Decision
We implement a tiered, policy-driven telemetry architecture with persistent local spooling:
1. **Tiered Sampling Cadence**:
   * Heartbeat / Liveness: 60 seconds
   * Dynamic Performance Sample (CPU, RAM, Disk Queue): 30 seconds
   * Hardware Sensor Snapshot: 5 minutes
   * Deep Inventory (Software, Drivers, Hotfixes): 6 hours or on system change
   * Cadences are centrally configurable via tenant policies.
2. **Local Spooling & Reliable Store-and-Forward**:
   * Telemetry batches are immediately committed to an embedded local SQLite database (`telemetry_queue`).
   * An asynchronous background transmitter reads queued items in FIFO order, posts them to the ingestion gateway, and deletes/acknowledges entries only upon receiving an HTTP 200 OK.
   * Employs exponential backoff with jitter on network failures.
   * Enforces a configurable storage cap (e.g. 100 MB max queue size) with drop-oldest retention to safeguard endpoint disk capacity.
3. **Data Compression & Batching**:
   * Telemetry points are batched (up to 50 samples per payload) and optionally GZip/Brotli compressed before transmission.

## Consequences
### Positive
* Zero telemetry loss during network disconnects or backend maintenance windows.
* Preserves laptop battery life through sensible sensor sampling intervals.
* Predictable, bounded endpoint storage utilization.

### Negative
* Requires local SQLite queue management and transaction handling on the endpoint.
