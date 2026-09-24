using Avantis.Contracts.Diagnostics;
using Microsoft.Extensions.Logging;

namespace Avantis.Agent.Diagnostics;

public class DiagnosticExecutor : IDiagnosticExecutor
{
    private readonly IEnumerable<IDiagnostic> _diagnostics;
    private readonly ILogger<DiagnosticExecutor>? _logger;

    public DiagnosticExecutor(IEnumerable<IDiagnostic> diagnostics, ILogger<DiagnosticExecutor>? logger = null)
    {
        _diagnostics = diagnostics;
        _logger = logger;
    }

    public async Task<DiagnosticProfileExecutionResult> RunProfileAsync(string profileName, DiagnosticContext context, CancellationToken ct = default)
    {
        var startTime = DateTime.UtcNow;
        var runId = Guid.NewGuid();
        var selected = SelectDiagnostics(profileName).ToList();

        _logger?.LogInformation("Starting diagnostic profile {Profile} ({Count} modules)", profileName, selected.Count);

        var results = new List<DiagnosticResult>();
        int healthScore = 100;
        string overallStatus = "PASSED";

        // Outcome summary metrics
        var outcomeMetrics = new Dictionary<string, object>
        {
            ["updatesInstalled"] = 0,
            ["spaceRecoveredGb"] = 0.0,
            ["filesOptimized"] = 0,
            ["threatsRemoved"] = 0
        };

        foreach (var diag in selected)
        {
            try
            {
                var res = await diag.ExecuteAsync(context, ct);
                results.Add(res);

                if (res.Status == DiagnosticStatus.Failed)
                {
                    healthScore -= 25;
                    overallStatus = "FAILED";
                }
                else if (res.Status == DiagnosticStatus.Warning)
                {
                    healthScore -= 10;
                    if (overallStatus == "PASSED") overallStatus = "WARNING";
                }
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "Error running diagnostic {Id}", diag.Id);
                results.Add(new DiagnosticResult(
                    diag.Id,
                    diag.Name,
                    diag.Category,
                    DiagnosticStatus.Error,
                    "CRITICAL",
                    $"Diagnostic execution error: {ex.Message}",
                    new List<string> { ex.Message },
                    new Dictionary<string, object> { ["error"] = ex.ToString() },
                    new List<string> { ex.Message },
                    new List<string> { "Retry diagnostic or inspect agent log." },
                    false,
                    null,
                    DateTime.UtcNow,
                    0
                ));
                healthScore -= 20;
                overallStatus = "FAILED";
            }
        }

        healthScore = Math.Clamp(healthScore, 0, 100);

        return new DiagnosticProfileExecutionResult(
            runId,
            profileName,
            context.DeviceId,
            startTime,
            DateTime.UtcNow,
            overallStatus,
            healthScore,
            results,
            outcomeMetrics
        );
    }

    private IEnumerable<IDiagnostic> SelectDiagnostics(string profileName)
    {
        return profileName.ToUpperInvariant() switch
        {
            "QUICK" or "QUICKSCAN" => _diagnostics.Where(d => d.Id is "diagnostic.cpu" or "diagnostic.storage" or "diagnostic.security"),
            "HARDWARE" or "HARDWARESCAN" => _diagnostics.Where(d => d.Category == DiagnosticCategory.Hardware || d.Category == DiagnosticCategory.Storage || d.Category == DiagnosticCategory.Battery),
            "SECURITY" or "SECURITYSCAN" => _diagnostics.Where(d => d.Category == DiagnosticCategory.Security),
            "NETWORK" or "NETWORKSCAN" => _diagnostics.Where(d => d.Category == DiagnosticCategory.Network),
            _ => _diagnostics // FullHealthScan runs everything
        };
    }
}
