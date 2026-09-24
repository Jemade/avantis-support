using System.Diagnostics;
using Avantis.Contracts.Diagnostics;

namespace Avantis.Agent.Diagnostics;

public class MemoryDiagnostic : IDiagnostic
{
    public string Id => "diagnostic.memory";
    public string Name => "RAM Allocation & Topology";
    public DiagnosticCategory Category => DiagnosticCategory.Hardware;

    public Task<DiagnosticResult> ExecuteAsync(DiagnosticContext context, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var mem = context.Snapshot.Memory;

        var observations = new List<string>();
        var measurements = new Dictionary<string, object>
        {
            ["total_physical_gb"] = mem.TotalPhysicalGb,
            ["available_gb"] = mem.AvailableGb,
            ["used_gb"] = mem.UsedGb,
            ["utilization_percent"] = mem.UtilizationPercent,
            ["stick_count"] = mem.Modules.Count
        };
        var evidence = new List<string>();
        var recommendations = new List<string>();

        DiagnosticStatus status = DiagnosticStatus.Passed;
        string severity = "HEALTHY";

        observations.Add($"Memory utilization is at {mem.UtilizationPercent}% ({mem.UsedGb:F1}/{mem.TotalPhysicalGb:F1} GB).");
        observations.Add($"Physical layout: {mem.Modules.Count} installed module(s).");

        if (mem.UtilizationPercent >= 92)
        {
            status = DiagnosticStatus.Failed;
            severity = "CRITICAL";
            evidence.Add($"Extreme memory saturation: {mem.UsedGb:F1} GB committed of {mem.TotalPhysicalGb:F1} GB total.");
            recommendations.Add("Close high-memory applications.");
            recommendations.Add("Check for memory leaks in background processes.");
        }
        else if (mem.UtilizationPercent >= 80)
        {
            status = DiagnosticStatus.Warning;
            severity = "WARNING";
            evidence.Add($"High RAM consumption: {mem.UtilizationPercent}%.");
            recommendations.Add("Review open applications to free up buffer capacity.");
        }

        sw.Stop();
        string summary = status == DiagnosticStatus.Passed
            ? "Memory capacity and paging operating within healthy limits."
            : (status == DiagnosticStatus.Warning
                ? "Memory buffer capacity is running low."
                : "Critical memory exhaustion detected. System responsiveness is degraded.");

        return Task.FromResult(new DiagnosticResult(
            Id,
            Name,
            Category,
            status,
            severity,
            summary,
            observations,
            measurements,
            evidence,
            recommendations,
            false,
            null,
            DateTime.UtcNow,
            sw.ElapsedMilliseconds
        ));
    }
}
