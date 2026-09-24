namespace Avantis.Contracts.Remediation;

public enum RiskLevel
{
    Low = 0,
    Medium = 1,
    High = 2,
    Critical = 3
}

public record RemediationRequest(
    string ActionId,
    string DeviceId,
    Guid TenantId,
    string RequestedBy,
    RiskLevel Risk,
    Dictionary<string, string>? Parameters = null,
    bool DryRun = false
);

public record RemediationExecution(
    Guid ExecutionId,
    string ActionId,
    string ActionName,
    string DeviceId,
    Guid TenantId,
    RiskLevel Risk,
    string Status, // "PENDING", "RUNNING", "COMPLETED", "FAILED", "ROLLED_BACK"
    string RequestedBy,
    string? ApprovedBy,
    DateTime StartedAtUtc,
    DateTime? CompletedAtUtc,
    int ExitCode,
    string SummaryMessage,
    List<string> ActionsTaken,
    bool RestorePointCreated,
    bool RebootRequired,
    string? ErrorDetails = null
);
