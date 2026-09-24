# Avantis Assist — Enterprise Architecture Specification

**System Architecture & Engineering Blueprint**  
**Version:** 2.0.0 (Production Architecture)  
**Status:** Approved for Implementation  

---

## 1. Executive Platform Vision

**Avantis Assist** is an enterprise-grade endpoint intelligence, proactive diagnostic, automated remediation, and fleet telemetry platform engineered for commercial and enterprise PC deployments. 

Unlike consumer diagnostic utilities, Avantis Assist provides unified fleet-wide visibility, deterministic hardware and operating system telemetry, composable diagnostic execution, evidence-grounded AI assistance, and safe, policy-controlled automated remediation across thousands of endpoints.

```
                    ┌─────────────────────────────────────────┐
                    │        AVANTIS ENTERPRISE CLOUD         │
                    │        (ASP.NET Core 8 Web API)         │
                    └────────────────────┬────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
                 ▼                                               ▼
   ┌───────────────────────────┐                   ┌───────────────────────────┐
   │     OPERATOR CONSOLES     │                   │     INTELLIGENCE SUITE    │
   │  - IT Fleet Console       │                   │  - Predictive ML Models   │
   │  - Endpoint Companion UI  │                   │  - Grounded AI Assistant  │
   │  - Role-Based Access      │                   │  - Isolated Runbook RAG   │
   └─────────────┬─────────────┘                   └─────────────┬─────────────┘
                 │                                               │
                 └───────────────────────┬───────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │      AVANTIS AGENT (C# / .NET 8)        │
                    │  Windows Service (NT AUTHORITY\SYSTEM)  │
                    │  - Real WMI/CIM & Performance Counters  │
                    │  - Composable IDiagnostics Engine       │
                    │  - Risk-Tiered IRemediation Engine      │
                    │  - Local Offline SQLite Spooling        │
                    │  - Secure Authenticated Named Pipe IPC  │
                    └─────────────────────────────────────────┘
```

---

## 2. Polyglot Technology Stack & Boundaries

| Tier | Language / Runtime | Framework / Core Libraries | Responsibilities |
| :--- | :--- | :--- | :--- |
| **Windows Endpoint Agent** | **C# / .NET 8 LTS** | `Microsoft.Extensions.Hosting.WindowsServices`, `System.Management`, `Microsoft.Data.Sqlite`, `System.IO.Pipes` | Native Windows Service, hardware polling, event interception, offline telemetry queue, authenticated IPC, diagnostic execution, safe remediation. |
| **Enterprise Cloud Backend** | **C# / ASP.NET Core 8** | ASP.NET Core Web API, Entity Framework Core, Npgsql, StackExchange.Redis, OpenTelemetry | Unified REST API gateway (`/api/v1`), device enrollment, telemetry ingestion, multi-tenancy, RBAC, alert rules engine, support ticketing, audit logging. |
| **Predictive & AI Service** | **Python 3.11** | FastAPI (internal), Scikit-Learn, Pandas, NumPy, Google GenAI / OpenAI SDKs | Statistical trend detection, predictive hardware failure models, grounded LLM function calling, vector-indexed runbook search. |
| **IT Support Console** | **TypeScript / React** | React 18, Vite, Lucide Icons, Chart.js / Recharts | High-density IT administrator console, fleet overview, deep device investigation, live telemetry graphs, ticket management, command dispatch. |
| **Client Companion UI** | **TypeScript / React / Vanilla HTML5** | Modern Web Components / Local Client Shell | Unprivileged user-mode companion application communicating with the Windows Service over authenticated Named Pipes. |

---

## 3. Communication Protocols & Port Topology

```
+---------------------------------------------------------------------------------------+
| Port / Socket                 | Protocol       | Source         | Target              |
+-------------------------------+----------------+----------------+---------------------+
| \\.\pipe\AvantisAgentIpc      | Named Pipes    | Client UI      | Windows Agent       |
| 9140 (Legacy IPC)             | REST (Loopback)| Dev Simulators | Windows Agent       |
| 9141                          | HTTPS / REST   | Agent          | Central Cloud API   |
| 9142                          | HTTPS / HTTP   | End User       | Client Companion UI |
| 9143                          | HTTPS / HTTP   | IT Staff       | IT Fleet Console    |
| 5432                          | TCP (Postgres) | Cloud Backend  | PostgreSQL Database |
| 6379                          | TCP (RESP)     | Cloud Backend  | Redis Cache         |
+-------------------------------+----------------+----------------+---------------------+
```

---

## 4. Subsystem Deep-Dive

### 4.1. C# Windows Endpoint Agent (`agent/`)
* **Execution Model**: Runs as a Windows Service (`AvantisAgentService`) under `NT AUTHORITY\SYSTEM` with automatic recovery on failure.
* **Hardware Interrogation**: Queries hardware directly using native Win32 APIs and `System.Management`:
  * CPU: Processor name, architecture, physical/logical core counts, clock speeds, and real-time utilization via `PerformanceCounter`.
  * Thermals: Direct ACPI queries (`MSAcpi_ThermalZoneTemperature`) with graceful degradation when sensors are absent.
  * Memory: Physical RAM modules, speeds, capacities, and instantaneous free/committed memory.
  * Storage: Physical drives, media type (NVMe SSD vs SATA), bus type, partitioned volumes, and raw SMART failure prediction status.
  * Battery: Design capacity, full charge capacity, charge percentage, AC mains status, and wear degradation. AC-only desktops automatically disable battery scoring deductions.
* **Offline Spooling Queue**: Spools all telemetry batches, audit events, and diagnostic reports to an embedded local SQLite database (`avantis_agent.db`). The transmitter uses exponential backoff and automatically replays queued records upon network reconnection.
* **Local IPC**: Authenticated Named Pipe (`\\.\pipe\AvantisAgentIpc`) securing local communications against unauthorized processes and DNS rebinding attacks.

### 4.2. Composable Diagnostic Framework (`Avantis.Agent.Diagnostics`)
Replaces the static 5-stage scanner with an extensible, modular architecture:
```csharp
public interface IDiagnostic
{
    string Id { get; }
    string Name { get; }
    DiagnosticCategory Category { get; }
    Task<DiagnosticResult> ExecuteAsync(DiagnosticContext context, CancellationToken ct);
}
```
* **Execution Profiles**:
  * `QuickScanProfile`: Fast sanity check (CPU, Memory, OS Integrity, Primary Drive).
  * `HardwareScanProfile`: Deep hardware interrogation (Thermals, SMART, Battery, Memory modules).
  * `SecurityScanProfile`: Windows Defender state, firewall rules, signature age, pending security patches.
  * `NetworkScanProfile`: Default gateway ping, DNS resolution latency, external latency, adapter packet loss.
  * `FullHealthScanProfile`: Sequential execution of all diagnostic modules.

### 4.3. Risk-Tiered Remediation Engine (`Avantis.Agent.Remediation`)
Every automated or interactive remediation implements the standard lifecycle:
```csharp
public interface IRemediation
{
    string ActionId { get; }
    RiskLevel Risk { get; }
    Task<bool> ValidatePrerequisitesAsync(RemediationContext ctx);
    Task<RemediationResult> ExecuteAsync(RemediationContext ctx);
    Task<bool> VerifyAsync(RemediationContext ctx);
    Task<bool> RollbackAsync(RemediationContext ctx);
}
```
* **Risk Classification**:
  * **LOW**: Flush DNS, clear temporary staging folders, restart non-critical services.
  * **MEDIUM**: Reset network adapters, trigger Windows Defender signature updates, reset Windows Update service.
  * **HIGH**: PnP driver updates, registry repairs. Mandatory creation of a Windows System Restore Point (`Checkpoint-Computer`).
  * **CRITICAL**: Firmware updates, destructive disk operations. Requires explicit dual-administrator approval.

### 4.4. Central Cloud Platform (`backend/`)
* **Multi-Tenancy**: Hierarchical data model (`Tenant` $\rightarrow$ `Organization` $\rightarrow$ `Site` $\rightarrow$ `Device`) with EF Core Global Query Filters enforcing tenant isolation across all endpoints.
* **Role-Based Access Control (RBAC)**: Fine-grained permissions for PlatformAdmin, TenantAdmin, ITAdministrator, SupportEngineer, Technician, and ReadOnly.
* **Rules & Alert Engine**: Evaluates incoming telemetry against configurable tenant thresholds:
  * Sustained CPU utilization $\ge 90\%$ for $> 5$ minutes
  * Core thermal temperature $\ge 85^\circ\text{C}$
  * Primary storage free capacity $< 10\%$
  * SMART hardware failure predicted
  * Battery retention capacity $< 60\%$
  * Repeated application crashes within 1 hour
* **Support Ticketing Workflow**: Automatic escalation of unresolved hardware alerts into IT support tickets, packaged with full diagnostic telemetry snapshots, chronological event timelines, and suggested runbook actions.

### 4.5. Grounded Intelligence & Predictive AI (`intelligence/`)
* **Deterministic Statistical Trend Detection**:
  * Rapid Storage Depletion: Flags when primary drive space decreases by $\ge 15\%$ across 3+ scans.
  * Thermal Envelope Degradation: Flags when operating temperatures climb by $\ge 10^\circ\text{C}$ across identical workloads.
  * Battery Retention Degradation: Flags capacity decay exceeding $\ge 5\%$ across 5+ scans.
* **Strictly Grounded AI Tool Calling**:
  * The AI assistant possesses NO direct shell execution capabilities.
  * Operates strictly through authorized read-only tool contracts (`get_device_inventory`, `get_current_health`, `get_recent_events`, `search_knowledge_base`).
  * Cites exact telemetry evidence and knowledge base runbook sources in all responses.

---

## 5. Enterprise Relational Database Schema

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│             tenants             │       │          organizations          │
├─────────────────────────────────┤       ├─────────────────────────────────┤
│ id (UUID, PK)                   │◄──────┤ id (UUID, PK)                   │
│ name (VARCHAR)                  │       │ tenant_id (UUID, FK)            │
│ tier (VARCHAR)                  │       │ name (VARCHAR)                  │
│ created_at (TIMESTAMPTZ)        │       │ created_at (TIMESTAMPTZ)        │
└─────────────────────────────────┘       └────────────────┬────────────────┘
                                                           │
                                                           ▼
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│             devices             │       │              sites              │
├─────────────────────────────────┤       ├─────────────────────────────────┤
│ id (VARCHAR, PK)                │◄──────┤ id (UUID, PK)                   │
│ tenant_id (UUID, FK)            │       │ organization_id (UUID, FK)      │
│ site_id (UUID, FK)              │       │ name (VARCHAR)                  │
│ hostname (VARCHAR)              │       │ location (VARCHAR)              │
│ model (VARCHAR)                 │       └─────────────────────────────────┘
│ serial_number (VARCHAR)         │
│ chassis_type (VARCHAR)          │
│ os_version (VARCHAR)            │
│ agent_version (VARCHAR)         │
│ health_status (VARCHAR)         │
│ health_score (INT)              │
│ last_seen (TIMESTAMPTZ)         │
└────────────────┬────────────────┘
                 │
                 ├────────────────────────────────┬───────────────────────────────┐
                 ▼                                ▼                               ▼
┌─────────────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────────┐
│       telemetry_snapshots       │ │          events           │ │        support_tickets        │
├─────────────────────────────────┤ ├───────────────────────────┤ ├───────────────────────────────┤
│ id (UUID, PK)                   │ │ id (UUID, PK)             │ │ id (VARCHAR, PK)              │
│ device_id (VARCHAR, FK)         │ │ device_id (VARCHAR, FK)   │ │ device_id (VARCHAR, FK)       │
│ tenant_id (UUID, FK)            │ │ tenant_id (UUID, FK)      │ │ tenant_id (UUID, FK)          │
│ timestamp (TIMESTAMPTZ)         │ │ timestamp (TIMESTAMPTZ)   │ │ title (VARCHAR)               │
│ cpu_load_percent (REAL)         │ │ event_type (VARCHAR)      │ │ severity (VARCHAR)            │
│ cpu_temp_c (REAL)               │ │ severity (VARCHAR)        │ │ status (VARCHAR)              │
│ ram_used_percent (REAL)         │ │ correlation_id (UUID)     │ │ assigned_to (UUID, FK)        │
│ storage_free_gb (REAL)          │ │ causation_id (UUID)       │ │ diagnostic_snapshot (JSONB)   │
│ storage_smart_status (VARCHAR)  │ │ source (VARCHAR)          │ │ created_at (TIMESTAMPTZ)      │
│ battery_wear_percent (REAL)     │ │ payload (JSONB)           │ │ resolved_at (TIMESTAMPTZ)     │
│ raw_metrics (JSONB)             │ └───────────────────────────┘ └───────────────────────────────┘
└─────────────────────────────────┘
```

---

## 6. Verification & Quality Gates

Every component is governed by strict test gates:
1. **Unit Testing**: 100% deterministic coverage for health scoring, threshold evaluation, trend math, and DTO validation.
2. **Integration Testing**: Ingestion pipeline validation (Agent $\rightarrow$ Backend $\rightarrow$ Postgres $\rightarrow$ Alerts).
3. **Hardware Test Gate**: Real WMI/ACPI validation on physical host machines without hardcoded mock fallbacks in production paths.
4. **Security Audits**: Static analysis for command injection, unauthorized IPC access, and cross-tenant query leaks.
