# ADR 004: Event Model & Causation Tracking

## Status
Accepted

## Context
In the previous implementation, system anomalies (such as Windows Defender threat detections, temperature spikes, and driver errors) were formatted as ad-hoc strings and mixed into general log tables or alert rows. IT administrators and automated diagnostics could not establish clear causal relationships between events (e.g. did a driver update trigger a subsequent BSOD or application crash?).

## Decision
We establish a formalized, immutable **Event Sourcing & Correlation Model**:
1. **Standard Event Contract**: Every event must conform to the `AvantisEvent` schema:
   * `EventId` (UUIDv7 - time-sortable)
   * `EventType` (e.g. `DeviceBooted`, `ApplicationCrashed`, `DefenderThreatDetected`, `ThermalThresholdExceeded`, `RemediationExecuted`)
   * `DeviceId` & `TenantId`
   * `Timestamp` (UTC ISO-8601)
   * `Severity` (`Informational`, `Warning`, `Error`, `Critical`)
   * `CorrelationId` (groups logically related operational chains)
   * `CausationId` (the direct parent event or command that triggered this event)
   * `Source` (e.g. `Kernel`, `Defender`, `DiskSubsystem`, `AgentService`)
   * `Payload` (strongly typed JSONB metadata)
2. **Windows Event Log Ingestion**:
   * The agent selectively filters high-value event channels:
     * `System` (Kernel-Power, WHEA-Logger, Disk errors)
     * `Application` (Application Error, Application Hang, Windows Error Reporting)
     * `Microsoft-Windows-WindowsUpdateClient/Operational`
     * `Microsoft-Windows-Windows Defender/Operational`
   * Raw log flooding is prevented by pre-filtering for specific Event IDs and error levels.
3. **Storage & Timeline**:
   * Events are persisted into an append-only PostgreSQL table partitioned by month, indexed by `(DeviceId, Timestamp DESC)` and `(CorrelationId)`.

## Consequences
### Positive
* Enables precise root-cause analysis (e.g., chronological timeline view showing what happened prior to a crash).
* Eliminates event ambiguity across microservices.
* Provides deterministic event feeds for ML anomaly detection.

### Negative
* Higher write volume; requires partitioned event tables and lifecycle retention policies.
