namespace Avantis.Contracts.Diagnostics;

public enum DiagnosticStatus
{
    Passed = 0,
    Warning = 1,
    Failed = 2,
    Inconclusive = 3,
    Error = 4
}

public enum DiagnosticCategory
{
    Hardware = 0,
    OperatingSystem = 1,
    Storage = 2,
    Battery = 3,
    Network = 4,
    Security = 5,
    Performance = 6,
    ApplicationReliability = 7
}

public record DiagnosticResult(
    string DiagnosticId,
    string Name,
    DiagnosticCategory Category,
    DiagnosticStatus Status,
    string Severity, // "HEALTHY", "WARNING", "CRITICAL"
    string Summary,
    List<string> Observations,
    Dictionary<string, object> Measurements,
    List<string> Evidence,
    List<string> Recommendations,
    bool RemediationAvailable,
    string? RecommendedActionId,
    DateTime ExecutedAtUtc,
    long DurationMs
);

public record DiagnosticProfileExecutionResult(
    Guid ExecutionId,
    string ProfileName, // "QuickScan", "FullHealthScan", "HardwareScan", "SecurityScan"
    string DeviceId,
    DateTime StartedAtUtc,
    DateTime CompletedAtUtc,
    string OverallStatus, // "PASSED", "WARNING", "FAILED"
    int HealthScore,
    List<DiagnosticResult> Results,
    Dictionary<string, object> OutcomeMetrics // e.g. updatesInstalled, spaceRecoveredGb, filesOptimized, threatsRemoved
);
