# ADR 008: Multi-Tenancy & Role-Based Access Control (RBAC)

## Status
Accepted

## Context
The prototype stored all devices, alerts, and tickets in a single flat database without tenant boundaries. An enterprise endpoint management system must support managed service providers (MSPs), large enterprise corporations, and discrete business units with strict administrative boundaries and tenant isolation.

## Decision
We implement a **Hierarchical Multi-Tenant Model with Granular RBAC**:
1. **Organizational Hierarchy**:
   ```
   Tenant (Enterprise Account / MSP Client)
     └── Organization (Subsidiary / Regional Business Unit)
          └── Site (Office Campus / Data Center / Branch)
               └── Device (Endpoint Machine)
   ```
2. **Tenant Isolation Guarantee**:
   * Every tenant-scoped entity in PostgreSQL (`Device`, `TelemetrySnapshot`, `Event`, `DiagnosticRun`, `RemediationAction`, `Ticket`, `KnowledgeDoc`) contains a non-nullable `tenant_id` foreign key.
   * EF Core Global Query Filters automatically inject `WHERE tenant_id = @currentTenantId` on all database operations, preventing accidental cross-tenant data exposure.
3. **Role-Based Access Control (RBAC)**:
   * **PlatformAdmin**: Global management across tenants, system health, platform updates.
   * **TenantAdmin**: Full configuration of tenant policies, users, device groups, and integrations.
   * **ITAdministrator**: Device management, policy assignment, approval of High/Critical remediations.
   * **SupportEngineer**: Diagnostic inspection, ticket triage, low/medium remediation execution, AI investigation.
   * **Technician**: Field hardware inspection, running on-demand diagnostics.
   * **ReadOnly**: Observability and executive compliance reporting.
4. **Authentication**:
   * JWT bearer tokens issued via ASP.NET Core Identity or OpenID Connect (OIDC) with claims: `sub`, `tenant_id`, `org_id`, `role`, and `permissions`.

## Consequences
### Positive
* Strict isolation compliance required for SOC2, HIPAA, and ISO 27001.
* Flexible delegation of responsibilities across IT tiers.

### Negative
* Additional complexity in query design and integration testing.
