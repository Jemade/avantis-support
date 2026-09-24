using Avantis.Contracts.Remediation;

namespace Avantis.Agent.Remediation;

public record RemediationContext(
    string DeviceId,
    Guid TenantId,
    string RequestedBy,
    Dictionary<string, string>? Parameters = null,
    bool DryRun = false
);

public interface IRemediation
{
    string ActionId { get; }
    string ActionName { get; }
    RiskLevel Risk { get; }
    Task<bool> ValidatePrerequisitesAsync(RemediationContext ctx, CancellationToken ct = default);
    Task<RemediationExecution> ExecuteAsync(RemediationContext ctx, CancellationToken ct = default);
    Task<bool> VerifyOutcomeAsync(RemediationContext ctx, CancellationToken ct = default);
}

public interface IRemediationExecutor
{
    Task<RemediationExecution> ExecuteActionAsync(RemediationRequest request, CancellationToken ct = default);
}
