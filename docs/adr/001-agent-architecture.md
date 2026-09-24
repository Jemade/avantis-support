# ADR 001: Windows Endpoint Agent Architecture

## Status
Accepted

## Context
The endpoint agent runs on Windows client machines across various form factors (laptops, workstations, All-in-Ones). The previous prototype utilized Node.js with spawned PowerShell sub-processes for hardware telemetry and exposed an unauthenticated local HTTP server on port 9140.

This approach presents critical weaknesses:
1. Significant CPU and memory overhead caused by repeated child process creation (`powershell.exe -Command ...`).
2. Heavy deployment footprint (requiring a bundled Node.js runtime and hundreds of `node_modules`).
3. Critical security risk from exposing an unauthenticated local HTTP port accessible to any browser or local process.
4. Inability to integrate natively with Windows Service Control Manager (SCM), Windows Event Log, Event Tracing for Windows (ETW), and native Win32 security APIs.

## Decision
We adopt **C# on .NET 8 LTS** as the sole language and framework for the Avantis Windows Endpoint Agent:
1. **Packaging**: Built as a .NET Worker Service running natively as a Windows Service (`Microsoft.Extensions.Hosting.WindowsServices`), starting automatically at boot and executing independently of user login sessions.
2. **Hardware & Sensor Interrogation**: Direct integration via `System.Management` (WMI/CIM), `System.Diagnostics.PerformanceCounter`, and native Win32/PInvoke APIs, avoiding continuous PowerShell process spawning.
3. **Local IPC**: Communication between user-mode UI and the privileged Windows Service will occur via **Authenticated Windows Named Pipes** (`System.IO.Pipes`), enforcing Windows Access Control Lists (ACLs) and caller identity validation instead of an unauthenticated HTTP port.
4. **Offline Resilience**: Local telemetry, diagnostic runs, and security events will be spooled to an embedded SQLite database using a persistent store-and-forward queue with exponential backoff and deduplication.

## Consequences
### Positive
* High performance, minimal footprint (< 40MB memory, < 0.5% idle CPU).
* Seamless Windows Service lifecycle management (auto-start, crash recovery, graceful shutdown).
* Elevated privilege separation: service runs as `NT AUTHORITY\SYSTEM` while client UI runs unprivileged under the user's interactive session.
* Strong typing, dependency injection, and comprehensive unit testability.

### Negative
* Requires compiling .NET 8 binaries and managing native Windows platform targets (`win-x64`).
* Unit tests for native WMI/PInvoke require mocked hardware providers when running in non-elevated or CI environments.
