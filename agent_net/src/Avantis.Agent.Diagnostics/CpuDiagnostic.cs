using System.Diagnostics;
using Avantis.Contracts.Diagnostics;

namespace Avantis.Agent.Diagnostics;

public class CpuDiagnostic : IDiagnostic
{
    public string Id => "diagnostic.cpu";
    public string Name => "CPU Utilization & Thermal Envelope";
    public DiagnosticCategory Category => DiagnosticCategory.Hardware;

    public Task<DiagnosticResult> ExecuteAsync(DiagnosticContext context, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var cpu = context.Snapshot.Cpu;

        var observations = new List<string>();
        var measurements = new Dictionary<string, object>
        {
            ["cores"] = cpu.PhysicalCores,
            ["threads"] = cpu.LogicalProcessors,
            ["model"] = cpu.Model,
            ["manufacturer"] = cpu.Manufacturer
        };
        var evidence = new List<string>();
        var recommendations = new List<string>();

        DiagnosticStatus status = DiagnosticStatus.Passed;
        string severity = "HEALTHY";
        string? remediationAction = null;

        if (cpu.CurrentUtilizationPercent.HasValue)
        {
            double load = cpu.CurrentUtilizationPercent.Value;
            measurements["current_utilization_percent"] = load;
            observations.Add($"Processor load is at {load:F0}%.");

            if (load >= 92.0)
            {
                status = DiagnosticStatus.Failed;
                severity = "CRITICAL";
                evidence.Add($"Sustained compute load: {load:F0}% across {cpu.PhysicalCores} cores.");
                recommendations.Add("Inspect top CPU processes in Task Manager.");
                recommendations.Add("Ensure intake vents are unobstructed.");
            }
            else if (load >= 82.0)
            {
                status = DiagnosticStatus.Warning;
                severity = "WARNING";
                evidence.Add($"Elevated processor demand: {load:F0}%.");
                recommendations.Add("Close unused background applications.");
            }
        }

        if (cpu.TemperatureCelsius.HasValue && cpu.IsDirectHardwareSensor)
        {
            double tempC = cpu.TemperatureCelsius.Value;
            measurements["temperature_celsius"] = tempC;
            observations.Add($"Core thermal zone is at {tempC:F0}°C.");

            if (tempC >= 90.0)
            {
                status = DiagnosticStatus.Failed;
                severity = "CRITICAL";
                evidence.Add($"Thermal safety limit approached: {tempC:F0}°C.");
                recommendations.Add("Elevate laptop base or move to a cooler environment.");
            }
            else if (tempC >= 75.0)
            {
                if (status == DiagnosticStatus.Passed) status = DiagnosticStatus.Warning;
                if (severity == "HEALTHY") severity = "WARNING";
                evidence.Add($"Operating temperature elevated: {tempC:F0}°C.");
            }
        }
        else
        {
            measurements["thermal_sensor"] = "Unavailable or not exposed by ACPI";
        }

        sw.Stop();
        string summary = status == DiagnosticStatus.Passed
            ? "CPU compute and thermal envelope operating within normal parameters."
            : (status == DiagnosticStatus.Warning
                ? "CPU exhibits elevated compute load or temperatures."
                : "CPU is operating at critical utilization or thermal limits.");

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
            remediationAction != null,
            remediationAction,
            DateTime.UtcNow,
            sw.ElapsedMilliseconds
        ));
    }
}
