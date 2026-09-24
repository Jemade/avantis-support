# ADR 006: Remediation Safety & Risk Classification

## Status
Accepted

## Context
Automated endpoint remediation (e.g., driver updates, registry modifications, disk cleaning, network resets) can cause user disruption or system instability if executed without controls. The prototype allowed one-click unverified driver updates and immediate network resets that severed current user connections.

## Decision
We implement a **Strict Risk-Tiered Remediation Framework**:
1. **Risk Tiers**:
   * **LOW**: Non-disruptive actions (Flush DNS, restart non-critical service, purge safe temp caches). Permitted to run automatically under approved tenant policy or with local user consent.
   * **MEDIUM**: Minor user impact (Reset network adapter, restart Windows Update service, run DISM / SFC integrity check). Requires interactive confirmation or scheduling during maintenance windows.
   * **HIGH**: System modification (Driver package installation, registry repair, rollback). Requires explicit IT Administrator authorization and mandatory creation of a Windows System Restore Point (`Checkpoint-Computer`).
   * **CRITICAL**: Destructive actions (Firmware updates, storage re-partitioning). Requires dual-authorization (two-person rule) and out-of-band confirmation.
2. **Remediation Lifecycle Contract**:
   Every action must implement the `IRemediation` lifecycle:
   * `ValidatePrerequisitesAsync()` (checks battery $> 50\%$, AC connected if required, disk space available).
   * `CreateRestorePointAsync()` (mandatory for Tier HIGH/CRITICAL).
   * `ExecuteAsync()` (runs parameterized, isolated action).
   * `VerifyOutcomeAsync()` (tests post-remediation system state to ensure the issue was resolved).
   * `RollbackAsync()` (executes automated rollback if verification fails).
3. **Immutable Audit Trail**:
   * Every remediation execution is recorded with `ActionId`, `DeviceId`, `RequestedBy`, `ApprovedBy`, `PreState`, `PostState`, `Duration`, `Logs`, and `ExitCode`.

## Consequences
### Positive
* Prevents bricking machines, unintended network disconnects, or data loss.
* Comprehensive audit compliance for enterprise change management.
* High customer trust through transparent validation and rollback safeguards.

### Negative
* Additional complexity in implementing restore points and verification routines for each remediation plugin.
