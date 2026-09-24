# ADR 002: Backend Architecture & Technology Consolidation

## Status
Accepted

## Context
The existing repository has two competing backend implementations:
1. Node.js Express server (`backend/src/server.js`) with ad-hoc in-memory fallbacks and minimal schema.
2. Python FastAPI server (`backend/main.py`) with SQLite tables and rules in `rules.py`.

This duplication creates confusion, conflicting API contracts, duplicated business rules, and fragmented maintenance. The enterprise requirement demands an authoritative, scalable cloud gateway capable of multi-tenancy, strict role-based access control (RBAC), high-throughput telemetry ingestion, and integration with enterprise databases.

## Decision
We consolidate the primary enterprise cloud backend onto **ASP.NET Core 8 Web API**:
1. **Architecture**: Clean Architecture / Modular Monolith comprising clear domain boundaries (Identity, Devices, Telemetry, Diagnostics, Remediation, Support, Policies, Alerts, Audit).
2. **Database**: PostgreSQL 15+ as the primary relational database, managed via Entity Framework Core (EF Core) with structured migrations.
3. **Caching & Concurrency**: Redis for distributed caching, distributed locking, and API rate limiting.
4. **API Standards**: RESTful JSON APIs versioned under `/api/v1`, fully documented via OpenAPI (Swagger) with strongly typed DTOs and validation filters.
5. **Role of Python**: Python is strictly isolated to the **Intelligence & ML Subsystem** (model training, offline feature extraction, specialized data science routines). Python will NOT serve as the primary fleet management API.

## Consequences
### Positive
* Single authoritative enterprise backend eliminating logic duplication.
* High ingestion throughput, asynchronous I/O, and thread pool efficiency of ASP.NET Core.
* Robust enterprise ORM (EF Core) with strong typing, migrations, and LINQ query optimization.
* Seamless integration with C# contracts shared with the agent.

### Negative
* Requires migration of existing Python/Node endpoints and rules into C# services.
