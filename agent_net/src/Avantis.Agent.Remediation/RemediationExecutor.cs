using Avantis.Contracts.Remediation;
using Microsoft.Extensions.Logging;

namespace Avantis.Agent.Remediation;

public class RemediationExecutor : IRemediationExecutor
{
    private readonly IEnumerable<IRemediation> _remediations;
    private readonly ILogger<RemediationExecutor>? _logger;

    public RemediationExecutor(IEnumerable<IRemediation> remediations, ILogger<RemediationExecutor>? logger = null)
    {
        _remediations = remediations;
        _logger = logger;
    }

    public async Task<RemediationExecution> ExecuteActionAsync(RemediationRequest request, CancellationToken ct = default)
    {
        var target = _remediations.FirstOrDefault(r => r.ActionId.Equals(request.ActionId, StringComparison.OrdinalIgnoreCase));
        if (target == null)
        {
            return new RemediationExecution(
                Guid.NewGuid(),
                request.ActionId,
                "Unknown Action",
                request.DeviceId,
                request.TenantId,
                request.Risk,
                "FAILED",
                request.RequestedBy,
                null,
                DateTime.UtcNow,
                DateTime.UtcNow,
                -1,
                $"Remediation action '{request.ActionId}' is not registered or supported by this agent.",
                new List<string>(),
                false,
                false,
                "ActionNotFound"
            );
        }

        var ctx = new RemediationContext(request.DeviceId, request.TenantId, request.RequestedBy, request.Parameters, request.DryRun);

        _logger?.LogInformation("Validating prerequisites for remediation {Action} (Risk: {Risk})", target.ActionName, target.Risk);
        bool canRun = await target.ValidatePrerequisitesAsync(ctx, ct);
        if (!canRun)
        {
            return new RemediationExecution(
                Guid.NewGuid(),
                target.ActionId,
                target.ActionName,
                request.DeviceId,
                request.TenantId,
                target.Risk,
                "FAILED",
                request.RequestedBy,
                null,
                DateTime.UtcNow,
                DateTime.UtcNow,
                -2,
                "Prerequisites validation failed for this action.",
                new List<string>(),
                false,
                false,
                "PrerequisitesFailed"
            );
        }

        _logger?.LogInformation("Executing remediation {Action}", target.ActionName);
        var result = await target.ExecuteAsync(ctx, ct);

        if (result.ExitCode == 0)
        {
            bool verified = await target.VerifyOutcomeAsync(ctx, ct);
            _logger?.LogInformation("Verification for {Action}: {Verified}", target.ActionName, verified);
        }

        return result;
    }
}
