# ADR 005: Security, Privilege Separation & Device Identity

## Status
Accepted

## Context
The prototype suffered from severe security deficiencies:
1. The agent ran an unauthenticated HTTP server on `http://localhost:9140` capable of executing privileged cleanup and network actions.
2. PowerShell commands were executed via string concatenation.
3. Endpoints communicated with the backend via a shared unverified HTTP URL without device authentication.
4. Tenant isolation was non-existent.

## Decision
We enforce an enterprise security architecture based on **Zero Trust Device Identity & Privilege Separation**:
1. **Privilege Separation (Windows Service vs. User UI)**:
   * The privileged core agent runs as a Windows Service under `NT AUTHORITY\SYSTEM`.
   * The user-facing companion UI runs as an unprivileged process under the interactive user session.
   * Communication occurs exclusively over Windows Named Pipes (`\\.\pipe\AvantisAgentIpc`) secured with custom Windows Security Descriptors (enforcing `GENERIC_READ | GENERIC_WRITE` for authenticated local users, and rejecting remote network connections).
2. **Device Identity & Registration Handshake**:
   * During initial provisioning, the agent presents a cryptographic enrollment token.
   * The backend validates the token, generates a unique `DeviceId`, registers the device within the specified Tenant/Organization, and issues a cryptographic Device Secret / Certificate.
   * All subsequent API calls require an `X-Device-Id` and `X-Device-Signature` (HMAC-SHA256) header or mTLS.
3. **No Dynamic Shell Interpolation**:
   * All execution of Windows diagnostic or remediation routines is performed via structured .NET APIs (`System.Management`, `System.Diagnostics.ProcessStartInfo` with strict argument arrays) or parameterized PowerShell Runspaces. Arbitrary string interpolation is prohibited.
4. **Command Signing & Expiration**:
   * Commands initiated from the cloud backend must include an expiration timestamp (TTL) and nonces to prevent replay attacks.

## Consequences
### Positive
* Protects against local privilege escalation and DNS rebinding attacks.
* Guarantees non-repudiation of device telemetry.
* Prevents rogue device injection into the enterprise fleet.

### Negative
* Requires secure enrollment workflows and cryptographic key storage on endpoints (using Windows DPAPI).
