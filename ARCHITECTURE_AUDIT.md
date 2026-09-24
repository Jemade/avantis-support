# Avantis Assist — Comprehensive Repository & Architecture Audit

**Document Version:** 1.0.0  
**Audit Date:** 2026-09-24  
**Author:** Principal Enterprise Systems & Security Architect  
**Repository:** `project_support/`  
**Classification:** Internal Technical Architecture & Engineering Review  

---

## Executive Summary

The **Avantis Support System (Avantis Assist)** is currently structured as an advanced multi-tier prototype designed to provide hardware diagnostics, basic telemetry ingestion, predictive trend evaluation, and customer/support interfaces for Avantis computers. 

While the prototype contains substantial working logic—notably genuine Windows WMI queries, real hardware detection across different form factors, and sequential scan orchestration—it suffers from structural architectural fragmentation, security vulnerabilities, competing backend implementations (Node.js vs. FastAPI), unauthenticated local endpoints, lack of privilege separation, and absence of enterprise-grade standards (.NET Windows Service, multi-tenancy, RBAC, offline persistence, and strong typing).

This audit delivers an exhaustive assessment of the codebase and outlines the concrete migration path to transform Avantis Assist into an enterprise-grade endpoint intelligence and fleet management platform.

---

## 1. Existing Architecture

The current repository implements a distributed prototype across four primary network tiers:

```
[ Windows Endpoint Hardware & OS ]
               │
               ▼
[ Local Agent (Node.js / Express @ 9140) ]
        │                       │
        ▼                       ▼
[ Client UI (Port 9142) ]   [ Central Backend (Express @ 9141) ]
                                │                    │
                                ▼                    ▼
                       [ PostgreSQL / Memory ]  [ Fleet Console (Port 9143) ]
```

In parallel, there is an unintegrated second backend:
`backend/main.py` (FastAPI @ 8000) using SQLite (`avantis_assist.db`), and an alternative Python agent `backend/agent.py`.

### Communication Flow
1. **Agent Telemetry Gathering**: The Node.js agent periodically spawns child PowerShell processes to query WMI/CIM, computes a composite health score, and caches system specs.
2. **Local Client IPC**: The client desktop UI connects directly to `http://localhost:9140` via unauthenticated HTTP REST calls and CORS.
3. **Cloud Telemetry Ingestion**: The agent pushes periodic telemetry snapshots to `http://localhost:9141/api/v1/telemetry/ingest`.
4. **Fleet Management**: The support dashboard polls the central backend for registered devices, active alerts, and support tickets.

---

## 2. Existing Components

| Component | Path | Runtime / Framework | Primary Responsibilities |
| :--- | :--- | :--- | :--- |
| **Local Agent** | `agent/` | Node.js 18+, Express | WMI hardware polling, 5-stage sequential orchestrator, Gemini chat, local predictive trend math, Windows toast dispatch. |
| **Cloud Backend (Node)** | `backend/src/` | Node.js 18+, Express, `pg` | Telemetry ingestion, device inventory, alerts, support tickets, Postgres persistence with in-memory fallback. |
| **Cloud Backend (Python)** | `backend/` | Python 3.11+, FastAPI, SQLite | Telemetry ingestion, driver/software inventory, Windows event error mapping, rule thresholds. |
| **Customer Desktop UI** | `client-ui/` | Node.js Express static server | Vanilla JS / CSS interface for end users, hardware tiles, manual scans, Gemini chat drawer. |
| **Support Console** | `support-dashboard/` | Node.js Express static server | Vanilla JS admin portal for inspecting fleet devices, alerts, and tickets. |
| **Verification Suites** | `scripts/` | Node.js, PowerShell | Hardware test, cross-device mock test, Gemini acceptance test, predictive trend simulator. |
| **Audit Reports** | `reports/` | JSON files | Historical scan records used for trend math and auditing. |

---

## 3. Existing Technologies

* **Runtimes & Frameworks**:
  * Node.js v24, Express v4.21
  * Python 3.11, FastAPI, Uvicorn
  * PowerShell 5.1 / 7 (invoked via `execSync`)
* **Databases & Stores**:
  * PostgreSQL 15 (defined in `docker-compose.yml`)
  * SQLite (`avantis_assist.db`)
  * Local JSON filesystem store (`reports/`)
  * In-memory JavaScript `Map` collections (fallback in `db.js`)
* **AI & Language Models**:
  * Google Generative AI (Gemini Flash & Gemini Pro via direct REST endpoint)
  * Local deterministic template fallback generator
* **Operating System Interfaces**:
  * WMI / CIM (`Win32_Processor`, `Win32_DiskDrive`, `Win32_Battery`, `Win32_VideoController`, `Win32_PnPEntity`)
  * Windows Defender (`Get-MpComputerStatus`, `root/SecurityCenter2`)
  * Network (`netsh`, `ipconfig`, `Test-Connection`)
  * Storage (`Optimize-Volume -Defrag -ReTrim`)
  * WinRT Toast notifications via PowerShell reflection

---

## 4. Working Functionality

The following systems are genuinely functional and verified:
1. **Dynamic Hardware Detection**:
   * Accurate SMBIOS chassis type mapping (Laptop, Desktop, All-In-One).
   * Accurate CPU model, core counts, and threads without vendor assumptions.
   * Real-time CPU utilization calculation via OS CPU tick deltas.
   * Direct ACPI thermal sensor query (`MSAcpi_ThermalZoneTemperature`) with graceful degradation when sensors are absent.
   * Multi-GPU detection prioritizing dedicated GPUs (NVIDIA/AMD) with VRAM over integrated graphics.
   * Multi-stick physical RAM detection with speed and slot locations.
   * NVMe vs. SATA SSD detection, physical disk mapping, and SMART predict failure flag parsing.
   * Accurate battery wear level calculation (`DesignCapacity` vs `FullChargeCapacity`) and zero-deduction handling for AC-powered desktops.
2. **Deterministic Predictive Monitoring**:
   * Detection of rapid storage loss ($\ge 15\%$ drop over 3+ scans).
   * Detection of thermal envelope degradation ($\ge 10^\circ\text{C}$ climb).
   * Detection of battery wear escalation ($\ge 5\%$ drop).
   * Immediate SMART anomaly escalation.
3. **Sequential Maintenance Orchestration**:
   * Step-by-step pipeline execution preventing I/O thrashing: Hardware Scan $\rightarrow$ Defender Scan $\rightarrow$ Driver Catalog Check $\rightarrow$ Safe Cache Cleanup $\rightarrow$ Network Optimization.
4. **Desktop Notifications**:
   * Native WinRT Toast notifications with state machine preventing notification spam.
5. **Grounded AI Guardrails**:
   * Refusal to hallucinate non-existent hardware or fabricate temperatures.
   * Graceful fallback when the `GEMINI_API_KEY` is missing or throttled.

---

## 5. Mocked Functionality

1. **Driver Remediation**:
   * `driver_manager.js` matches against a static `drivers_catalog.json` with only 3 sample packages. The installation command simply invokes `pnputil /scan-devices` or simulates a delay, rather than downloading and verifying cryptographically signed vendor CAB/INF packages.
2. **PostgreSQL Fallback**:
   * In `backend/src/database/db.js`, if PostgreSQL is not running on port 5432, it falls back to an in-memory `Map` store. All fleet data is lost when the Node process restarts.
3. **Cross-Device Test Harness**:
   * `scripts/test_cross_device.js` injects synthetic WMI JSON objects to verify logic branches. While good for unit testing, it must not be confused with hardware test coverage.
4. **Network Optimizer Stubs**:
   * On non-Windows platforms, returns fixed synthetic latency figures (2ms gateway, 14ms DNS).

---

## 6. Hardcoded Data

1. **Driver Catalog (`drivers_catalog.json`)**: Contains static hardcoded entries for Realtek Audio, Intel Wi-Fi 6E, and Intel Iris Xe Graphics.
2. **Local Ports**: Ports `9140`, `9141`, `9142`, and `9143` are hardcoded across multiple script files without centralized configuration injection.
3. **Default Support Contact**: Hardcoded email `support@avantispc.com` and customer name `Valued Customer` when tickets are escalated without full metadata.
4. **Hardware Manufacturer Fallback**: Defaults to `Avantis Technologies` if WMI manufacturer contains generic OEM strings.

---

## 7. Technical Debt

1. **Competing Backend Implementations**:
   * The repository contains an active Node.js Express backend (`backend/src/server.js`) AND an active Python FastAPI backend (`backend/main.py`), both maintaining separate database schemas and endpoints.
2. **Subprocess Spawning Overhead**:
   * The Node.js agent spawns PowerShell processes every 5 seconds for telemetry. This induces unnecessary CPU context switching, memory consumption, and disk I/O.
3. **Lack of Strongly Typed Contracts**:
   * Telemetry, events, and diagnostics are passed as arbitrary untyped JSON objects without schema validation or protobuf/OpenAPI contracts.
4. **Unstructured File Persistence**:
   * Scan reports are stored directly in `reports/*.json` on disk. There is no indexing, compression, or cleanup policy.
5. **Missing Automated CI/CD**:
   * No GitHub Actions or automated build/test pipelines exist in the repository.

---

## 8. Security Risks

1. **Unauthenticated Agent HTTP Port (Critical)**:
   * The Node.js agent exposes an HTTP server on `http://localhost:9140` without authentication. Any process running under any user account on the machine (or malicious web page via DNS rebinding / localhost CORS requests) can call `POST /api/cleanup/run`, `POST /api/network/optimize`, or `POST /api/orchestrator/start`.
2. **Lack of Privilege Separation (Critical)**:
   * If the agent is run as an administrator or Windows Service, all exposed endpoints execute privileged operations without verifying user identity.
3. **PowerShell String Interpolation (High)**:
   * Commands in `hardware_collector.js`, `threat_scanner.js`, and `cleanup_engine.js` construct PowerShell strings with basic quotation replacement instead of parameterized script blocks, risking command injection if device strings contain malicious characters.
4. **Unencrypted Plaintext Telemetry (Medium)**:
   * Telemetry is transmitted over plain HTTP (`http://localhost:9141`) without TLS or device authentication certificates/tokens.
5. **Multi-Tenant Data Leakage (High)**:
   * Neither backend supports multi-tenancy. Devices, alerts, and tickets are stored in a single flat space without tenant or organization isolation.

---

## 9. Architectural Problems

1. **Agent Technology Choice**:
   * Node.js is not suitable for a production Windows enterprise endpoint agent. It requires shipping a heavy Node.js runtime, lacks native integration with Windows Service control manager (SCM), Windows Event Log, ETW, Performance Counters, and secure Named Pipes, and suffers from single-threaded event loop blocking.
2. **Absence of Offline Resilient Queue**:
   * If the central backend is unreachable, the agent drops telemetry snapshots. There is no persistent local SQLite store with retry, exponential backoff, and delivery acknowledgement.
3. **Rigid 5-Stage Scanner**:
   * Diagnostics are locked into a single rigid sequential pipeline. There is no composable `IDiagnostic` framework supporting profile-based scans (Quick, Security, Storage, Network, Hardware).
4. **Lack of Structured Event Bus & Causation**:
   * System events (crashes, reboots, threshold breaches) are treated as ad-hoc log strings rather than immutable, correlated events with causal tracking.

---

## 10. Proposed Replacement Architecture

To meet enterprise standards, the system will be transformed into a modular polyglot architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AVANTIS ASSIST ENTERPRISE PLATFORM                   │
└────────────────────────────────────────────────────────────────────────┘

     ┌──────────────────────────────────────────────────────────────┐
     │           WINDOWS ENDPOINT LAYER (C# / .NET 8 LTS)           │
     │  - AvantisAgentService (Windows Service / Worker)            │
     │  - Real Hardware & Performance Counters (System.Management)  │
     │  - Composable IDiagnostic & IRemediation Engine              │
     │  - Offline Resilient SQLite Queue                            │
     │  - Secure Authenticated Named Pipe IPC                       │
     └──────────────────────────────┬───────────────────────────────┘
                                    │ mTLS / REST / gRPC
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │          CENTRAL CLOUD BACKEND (C# / ASP.NET CORE 8)         │
     │  - Clean Architecture / Modular Monolith                     │
     │  - Multi-Tenancy & Fine-Grained RBAC                         │
     │  - Telemetry Ingestion Gateway & Structured Event Sinks      │
     │  - PostgreSQL + EF Core Migrations                           │
     │  - Redis Distributed Cache & Lock Manager                    │
     │  - OpenAPI / Swagger Versioned Contracts (/api/v1)           │
     └──────────────┬───────────────────────────────┬───────────────┘
                    │                               │
                    ▼                               ▼
     ┌────────────────────────────┐  ┌──────────────────────────────┐
     │  INTELLIGENCE & PREDICTIVE │  │      OPERATOR CONSOLES       │
     │       (Python 3.11)        │  │  - IT Fleet Console (React)  │
     │  - Statistical Trends & ML │  │  - Endpoint Companion UI     │
     │  - Grounded AI Tool Engine │  │  - WCAG Accessible           │
     │  - Isolated Knowledge RAG  │  │  - Zero Hardcoded Metrics    │
     └────────────────────────────┘  └──────────────────────────────┘
```

---

## 11. Migration Plan

* **Phase 1: Foundation & Audit** (Completed): Repository audit, architecture baseline, and architectural decision records (ADRs).
* **Phase 2: Core Contracts & Common Library**: Define shared C# contracts (`Avantis.Contracts`) for Devices, Telemetry, Events, Diagnostics, and Remediations.
* **Phase 3: C# Windows Agent**: Implement .NET 8 Worker Service, WMI/CIM hardware collector, offline SQLite queue, and Named Pipe IPC server.
* **Phase 4: ASP.NET Core Enterprise Backend**: Replace legacy Node/FastAPI backends with a unified ASP.NET Core API with PostgreSQL, EF Core, multi-tenancy, and RBAC.
* **Phase 5: Intelligence & Predictive Engine**: Refactor predictive mathematical trends and grounded AI tools into an isolated service.
* **Phase 6: Enterprise Frontend & Companion UI**: Implement typed React/TypeScript dashboard and responsive companion UI.
* **Phase 7: Comprehensive Verification & Acceptance**: Unit tests, integration tests, native Windows hardware validation, and E2E verification.

---

## 12. Implementation Priorities

1. **Priority 1 (Security & Core Agent)**: C# .NET 8 Windows Service with real WMI telemetry and secure local IPC (eliminating unauthenticated HTTP 9140).
2. **Priority 2 (Backend Consolidation)**: Unified ASP.NET Core API with PostgreSQL relational schema and multi-tenancy.
3. **Priority 3 (Offline Telemetry & Events)**: Local SQLite persistent queue with cloud sync and structured event contracts.
4. **Priority 4 (Diagnostic & Remediation Framework)**: Composable `IDiagnostic` execution profiles and safety-tiered `IRemediation` engine.
5. **Priority 5 (Enterprise UI & AI Guardrails)**: Typed web console with real API-driven dashboards and strictly grounded AI assistant.
