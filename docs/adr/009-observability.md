# ADR 009: Observability, Metrics & Telemetry Pipelines

## Status
Accepted

## Context
Operating a fleet of thousands of endpoints and high-volume telemetry ingestion requires real-time observability into system health, API response latencies, database queue depth, agent dropouts, and diagnostic execution failure rates. The prototype had only console `console.log` statements without structured logging or metrics instrumentation.

## Decision
We adopt **OpenTelemetry (OTel)** across all components of the platform:
1. **Unified Structured Logging**:
   * All logs in C# and Python are emitted as structured JSON (Serilog in .NET) containing standard metadata: `timestamp`, `service`, `environment`, `level`, `correlation_id`, `device_id`, `tenant_id`, `operation`, and `duration_ms`.
   * Strict masking of PII, secrets, authorization headers, and Windows user passwords.
2. **Distributed Tracing**:
   * OpenTelemetry Tracing propagates `W3C TraceContext` headers across Agent $\rightarrow$ Cloud Backend $\rightarrow$ Database / Cache $\rightarrow$ AI Tools.
   * Enables pinpointing slow WMI queries, latency spikes in database queries, or throttled AI provider requests.
3. **Core Platform Metrics**:
   * `avantis_agent_heartbeat_count`
   * `avantis_telemetry_ingest_rate_seconds`
   * `avantis_diagnostic_execution_duration_seconds`
   * `avantis_remediation_success_ratio`
   * `avantis_ai_request_latency_seconds`
   * `avantis_ai_token_usage_total`
   * Exposed via Prometheus `/metrics` scraping endpoints in the ASP.NET Core backend.

## Consequences
### Positive
* Comprehensive production monitoring out-of-the-box with Prometheus, Grafana, and Datadog.
* Rapid incident response and SLA tracking.

### Negative
* Requires metric definitions and telemetry configuration across services.
