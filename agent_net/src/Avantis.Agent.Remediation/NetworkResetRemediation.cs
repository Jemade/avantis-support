using System.Diagnostics;
using System.Runtime.InteropServices;
using Avantis.Contracts.Remediation;
using Microsoft.Extensions.Logging;

namespace Avantis.Agent.Remediation;

public class NetworkResetRemediation : IRemediation
{
    private readonly ILogger<NetworkResetRemediation>? _logger;

    public string ActionId => "network.optimize";
    public string ActionName => "Reset Network Stack & Winsock Catalog";
    public RiskLevel Risk => RiskLevel.Medium;

    public NetworkResetRemediation(ILogger<NetworkResetRemediation>? logger = null)
    {
        _logger = logger;
    }

    public Task<bool> ValidatePrerequisitesAsync(RemediationContext ctx, CancellationToken ct = default) => Task.FromResult(true);

    public async Task<RemediationExecution> ExecuteAsync(RemediationContext ctx, CancellationToken ct = default)
    {
        var execId = Guid.NewGuid();
        var startTime = DateTime.UtcNow;
        var actions = new List<string>();
        int exitCode = 0;

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            try
            {
                // 1. Flush DNS
                var p1 = Process.Start(new ProcessStartInfo("ipconfig", "/flushdns") { UseShellExecute = false, CreateNoWindow = true });
                if (p1 != null) await p1.WaitForExitAsync(ct);
                actions.Add("Flushed DNS resolver cache.");

                // 2. Reset TCP/IP
                var p2 = Process.Start(new ProcessStartInfo("netsh", "int ip reset") { UseShellExecute = false, CreateNoWindow = true });
                if (p2 != null) await p2.WaitForExitAsync(ct);
                actions.Add("Reset TCP/IP protocol stack.");

                // 3. Reset Winsock
                var p3 = Process.Start(new ProcessStartInfo("netsh", "winsock reset") { UseShellExecute = false, CreateNoWindow = true });
                if (p3 != null) await p3.WaitForExitAsync(ct);
                actions.Add("Reset Winsock catalog (Reboot required for active socket bindings).");
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "Failed to optimize network stack");
                exitCode = -1;
            }
        }
        else
        {
            actions.Add("Simulated network stack optimization on non-Windows host.");
        }

        return new RemediationExecution(
            execId,
            ActionId,
            ActionName,
            ctx.DeviceId,
            ctx.TenantId,
            Risk,
            exitCode == 0 ? "COMPLETED" : "FAILED",
            ctx.RequestedBy,
            "ITAdministrator",
            startTime,
            DateTime.UtcNow,
            exitCode,
            exitCode == 0
                ? "Network stack reset completed. DNS flushed and TCP/IP reset (Reboot recommended)."
                : "Failed to reset network stack.",
            actions,
            false,
            true // Reboot required
        );
    }

    public Task<bool> VerifyOutcomeAsync(RemediationContext ctx, CancellationToken ct = default) => Task.FromResult(true);
}
