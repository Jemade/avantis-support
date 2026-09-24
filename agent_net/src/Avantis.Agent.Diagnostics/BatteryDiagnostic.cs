using System.Diagnostics;
using Avantis.Contracts.Diagnostics;

namespace Avantis.Agent.Diagnostics;

public class BatteryDiagnostic : IDiagnostic
{
    public string Id => "diagnostic.battery";
    public string Name => "Battery Wear & Power Delivery";
    public DiagnosticCategory Category => DiagnosticCategory.Battery;

    public Task<DiagnosticResult> ExecuteAsync(DiagnosticContext context, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var bat = context.Snapshot.Battery;

        var observations = new List<string>();
        var measurements = new Dictionary<string, object>
        {
            ["battery_present"] = bat.IsPresent,
            ["power_mode"] = bat.IsAcConnected ? "AC Mains / Charging" : "Battery Power"
        };
        var evidence = new List<string>();
        var recommendations = new List<string>();

        DiagnosticStatus status = DiagnosticStatus.Passed;
        string severity = "HEALTHY";

        if (!bat.IsPresent)
        {
            observations.Add("Device operates on direct AC Mains Power (Desktop / Workstation). Zero battery degradation applies.");
            measurements["chassis_power"] = "AC PSU";
        }
        else
        {
            measurements["charge_percent"] = bat.ChargePercent ?? 0;
            measurements["wear_percent"] = bat.WearPercent ?? 0;
            measurements["health_classification"] = bat.HealthClassification;

            observations.Add($"Battery charge: {bat.ChargePercent}% ({bat.ChargingState}).");
            if (bat.WearPercent.HasValue)
            {
                int wear = bat.WearPercent.Value;
                observations.Add($"Cell wear degradation: {wear}% (retention: {100 - wear}%).");

                if (wear >= 50)
                {
                    status = DiagnosticStatus.Failed;
                    severity = "CRITICAL";
                    evidence.Add($"Severe cell degradation: {wear}% wear level ({100 - wear}% retention).");
                    recommendations.Add("Consider battery replacement to restore mobile battery runtime.");
                }
                else if (wear >= 35)
                {
                    status = DiagnosticStatus.Warning;
                    severity = "WARNING";
                    evidence.Add($"Moderate cell wear: {wear}% wear level.");
                    recommendations.Add("Perform full discharge-recharge calibration to re-index the fuel gauge.");
                }
            }
        }

        sw.Stop();
        string summary = !bat.IsPresent
            ? "AC mains power delivery validated."
            : (status == DiagnosticStatus.Passed
                ? "Battery cell health and charging circuitry are in good condition."
                : (status == DiagnosticStatus.Warning
                    ? "Battery shows moderate wear."
                    : "Battery is critically degraded. Replacement recommended."));

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
