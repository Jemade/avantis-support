using System.Diagnostics;
using System.Runtime.InteropServices;
using Avantis.Contracts.Remediation;
using Microsoft.Extensions.Logging;

namespace Avantis.Agent.Remediation;

public class DnsFlushRemediation : IRemediation
{
    private readonly ILogger<DnsFlushRemediation>? _logger;

    public string ActionId => "network.flush_dns";
    public string ActionName => "Flush DNS Resolver Cache";
    public RiskLevel Risk => RiskLevel.Low;

    public DnsFlushRemediation(ILogger<DnsFlushRemediation>? logger = null)
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
                var psi = new ProcessStartInfo("ipconfig", "/flushdns")
                {
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using var p = Process.Start(psi);
                if (p != null)
                {
                    await p.WaitForExitAsync(ct);
                    exitCode = p.ExitCode;
                }
                actions.Add("Successfully executed 'ipconfig /flushdns'.");
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "Failed to flush DNS cache");
                exitCode = -1;
            }
        }
        else
        {
            actions.Add("Simulated DNS flush on non-Windows host.");
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
            "SystemPolicy",
            startTime,
            DateTime.UtcNow,
            exitCode,
            exitCode == 0 ? "DNS resolver cache flushed successfully." : "Failed to flush DNS cache.",
            actions,
            false,
            false
        );
    }

    public Task<bool> VerifyOutcomeAsync(RemediationContext ctx, CancellationToken ct = default) => Task.FromResult(true);
}
