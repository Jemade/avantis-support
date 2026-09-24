using System.Diagnostics;
using Avantis.Contracts.Diagnostics;

namespace Avantis.Agent.Diagnostics;

public class NetworkDiagnostic : IDiagnostic
{
    public string Id => "diagnostic.network";
    public string Name => "Network Stack & Gateway Connectivity";
    public DiagnosticCategory Category => DiagnosticCategory.Network;

    public Task<DiagnosticResult> ExecuteAsync(DiagnosticContext context, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var net = context.Snapshot.Network;

        var observations = new List<string>();
        var measurements = new Dictionary<string, object>
        {
            ["adapter"] = net.PrimaryAdapterName ?? "Unknown",
            ["ip"] = net.PrimaryIpAddress ?? "None",
            ["mac"] = net.MacAddress ?? "None",
            ["gateway"] = net.DefaultGateway ?? "None",
            ["internet_connected"] = net.InternetConnected
        };
        var evidence = new List<string>();
        var recommendations = new List<string>();

        DiagnosticStatus status = DiagnosticStatus.Passed;
        string severity = "HEALTHY";
        string? recommendedAction = null;

        if (string.IsNullOrWhiteSpace(net.PrimaryIpAddress))
        {
            status = DiagnosticStatus.Failed;
            severity = "CRITICAL";
            evidence.Add("No active IPv4 address bound to primary network interface.");
            recommendations.Add("Verify Ethernet cable or Wi-Fi connection.");
            recommendedAction = "network.optimize";
        }
        else
        {
            observations.Add($"Primary IP: {net.PrimaryIpAddress} via {net.PrimaryAdapterName}.");

            if (net.GatewayLatencyMs.HasValue)
            {
                measurements["gateway_latency_ms"] = net.GatewayLatencyMs.Value;
                observations.Add($"Gateway latency: {net.GatewayLatencyMs.Value:F0} ms.");
                if (net.GatewayLatencyMs.Value > 100)
                {
                    status = DiagnosticStatus.Warning;
                    severity = "WARNING";
                    evidence.Add($"High local gateway latency: {net.GatewayLatencyMs.Value:F0} ms.");
                }
            }

            if (net.DnsLatencyMs.HasValue)
            {
                measurements["dns_external_latency_ms"] = net.DnsLatencyMs.Value;
                observations.Add($"External DNS latency: {net.DnsLatencyMs.Value:F0} ms.");
                if (net.DnsLatencyMs.Value > 250)
                {
                    if (status == DiagnosticStatus.Passed) status = DiagnosticStatus.Warning;
                    if (severity == "HEALTHY") severity = "WARNING";
                    evidence.Add($"Sluggish external DNS response: {net.DnsLatencyMs.Value:F0} ms.");
                    recommendedAction = "network.optimize";
                    recommendations.Add("Flush DNS resolver cache and reset TCP/IP stack.");
                }
            }

            if (!net.InternetConnected)
            {
                status = DiagnosticStatus.Failed;
                severity = "CRITICAL";
                evidence.Add("Failed to reach external DNS test target (8.8.8.8).");
                recommendations.Add("Run network troubleshooter and flush DNS.");
                recommendedAction = "network.optimize";
            }
        }

        sw.Stop();
        string summary = status == DiagnosticStatus.Passed
            ? "Network stack and gateway latency validated successfully."
            : (status == DiagnosticStatus.Warning
                ? "Network is operational but experiencing latency or elevated ping times."
                : "Network interface is disconnected or unable to reach internet gateways.");

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
            recommendedAction != null,
            recommendedAction,
            DateTime.UtcNow,
            sw.ElapsedMilliseconds
        ));
    }
}
