using Avantis.Contracts.Remediation;
using Microsoft.Extensions.Logging;

namespace Avantis.Agent.Remediation;

public class DiskSweepRemediation : IRemediation
{
    private readonly ILogger<DiskSweepRemediation>? _logger;

    public string ActionId => "cleanup.disk_sweep";
    public string ActionName => "Safe System & Temporary File Sweep";
    public RiskLevel Risk => RiskLevel.Low;

    public DiskSweepRemediation(ILogger<DiskSweepRemediation>? logger = null)
    {
        _logger = logger;
    }

    public Task<bool> ValidatePrerequisitesAsync(RemediationContext ctx, CancellationToken ct = default)
    {
        return Task.FromResult(true);
    }

    public Task<RemediationExecution> ExecuteAsync(RemediationContext ctx, CancellationToken ct = default)
    {
        var execId = Guid.NewGuid();
        var startTime = DateTime.UtcNow;
        var actionsTaken = new List<string>();
        long bytesFreed = 0;
        int filesDeleted = 0;

        var targetDirs = new List<string>();
        string temp = Path.GetTempPath();
        if (Directory.Exists(temp)) targetDirs.Add(temp);

        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string crashDumps = Path.Combine(localAppData, "CrashDumps");
        if (Directory.Exists(crashDumps)) targetDirs.Add(crashDumps);

        string winDir = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        string winTemp = Path.Combine(winDir, "Temp");
        if (Directory.Exists(winTemp)) targetDirs.Add(winTemp);

        foreach (var dir in targetDirs)
        {
            try
            {
                var dirInfo = new DirectoryInfo(dir);
                foreach (var file in dirInfo.GetFiles("*", SearchOption.TopDirectoryOnly))
                {
                    try
                    {
                        if (DateTime.UtcNow - file.LastWriteTimeUtc > TimeSpan.FromHours(24))
                        {
                            long sz = file.Length;
                            file.Delete();
                            bytesFreed += sz;
                            filesDeleted++;
                        }
                    }
                    catch { }
                }
                actionsTaken.Add($"Swept temporary files from {dir}");
            }
            catch (Exception ex)
            {
                _logger?.LogWarning("Could not sweep {Dir}: {Msg}", dir, ex.Message);
            }
        }

        double mbFreed = Math.Round((double)bytesFreed / (1024.0 * 1024.0), 2);
        actionsTaken.Add($"Cleaned {filesDeleted} stale temporary files ({mbFreed} MB recovered).");

        return Task.FromResult(new RemediationExecution(
            execId,
            ActionId,
            ActionName,
            ctx.DeviceId,
            ctx.TenantId,
            Risk,
            "COMPLETED",
            ctx.RequestedBy,
            "AutomatedPolicy",
            startTime,
            DateTime.UtcNow,
            0,
            $"Disk sweep freed {mbFreed} MB across {filesDeleted} files.",
            actionsTaken,
            false,
            false
        ));
    }

    public Task<bool> VerifyOutcomeAsync(RemediationContext ctx, CancellationToken ct = default)
    {
        return Task.FromResult(true);
    }
}
