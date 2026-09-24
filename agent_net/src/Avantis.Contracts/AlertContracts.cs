namespace Avantis.Contracts.Alerts;

public record AlertDto(
    Guid AlertId,
    string DeviceId,
    Guid TenantId,
    string Component, // "cpu", "memory", "storage", "battery", "security", "network"
    string Severity,  // "WARNING", "CRITICAL"
    string Title,
    string Message,
    string Metric,
    string Risk,
    List<string> Precautions,
    DateTime DetectedAtUtc,
    DateTime? ResolvedAtUtc,
    string Status, // "ACTIVE", "RESOLVED", "SUPPRESSED"
    string? ActionLabel = null,
    string? ActionComponent = null
);
