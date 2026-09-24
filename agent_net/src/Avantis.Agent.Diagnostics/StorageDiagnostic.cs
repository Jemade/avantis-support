using System.Diagnostics;
using Avantis.Contracts.Diagnostics;

namespace Avantis.Agent.Diagnostics;

public class StorageDiagnostic : IDiagnostic
{
    public string Id => "diagnostic.storage";
    public string Name => "Storage Health & SMART Diagnostics";
    public DiagnosticCategory Category => DiagnosticCategory.Storage;

    public Task<DiagnosticResult> ExecuteAsync(DiagnosticContext context, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var snapshot = context.Snapshot;

        var observations = new List<string>();
        var measurements = new Dictionary<string, object>
        {
            ["physical_disks_count"] = snapshot.Disks.Count,
            ["logical_volumes_count"] = snapshot.Volumes.Count
        };
        var evidence = new List<string>();
        var recommendations = new List<string>();

        DiagnosticStatus status = DiagnosticStatus.Passed;
        string severity = "HEALTHY";
        string? recommendedAction = null;

        // Check SMART and disk health
        foreach (var disk in snapshot.Disks)
        {
            measurements[$"disk_{disk.Model}_smart"] = disk.SmartStatus;
            measurements[$"disk_{disk.Model}_type"] = disk.DriveType;

            if (disk.PredictFailure)
            {
                status = DiagnosticStatus.Failed;
                severity = "CRITICAL";
                evidence.Add($"Drive {disk.Model} flagged predictive hardware failure!");
                recommendations.Add("Immediately backup all critical data.");
                recommendations.Add("Contact IT support to dispatch a replacement SSD/HDD.");
            }
            else if (disk.ReallocatedSectors > 0)
            {
                if (status == DiagnosticStatus.Passed) status = DiagnosticStatus.Warning;
                if (severity == "HEALTHY") severity = "WARNING";
                evidence.Add($"Drive {disk.Model} has {disk.ReallocatedSectors} reallocated sectors.");
            }
            else
            {
                observations.Add($"Drive {disk.Model} ({disk.DriveType}): SMART status {disk.SmartStatus}.");
            }
        }

        // Check volume free space
        var primaryVol = snapshot.Volumes.FirstOrDefault(v => v.MountPoint.StartsWith("C", StringComparison.OrdinalIgnoreCase))
                         ?? snapshot.Volumes.FirstOrDefault();
        if (primaryVol != null)
        {
            measurements["primary_drive_free_gb"] = primaryVol.FreeGb;
            measurements["primary_drive_used_percent"] = primaryVol.UsedPercent;
            observations.Add($"System volume {primaryVol.MountPoint} is at {primaryVol.UsedPercent}% capacity ({primaryVol.FreeGb:F1} GB free).");

            if (primaryVol.UsedPercent >= 93)
            {
                status = DiagnosticStatus.Failed;
                severity = "CRITICAL";
                recommendedAction = "cleanup.disk_sweep";
                evidence.Add($"Primary volume {primaryVol.MountPoint} has only {primaryVol.FreeGb:F1} GB free ({primaryVol.UsedPercent}% full).");
                recommendations.Add("Run automated safe disk cleanup to recover temporary space.");
            }
            else if (primaryVol.UsedPercent >= 85)
            {
                if (status == DiagnosticStatus.Passed) status = DiagnosticStatus.Warning;
                if (severity == "HEALTHY") severity = "WARNING";
                recommendedAction = "cleanup.disk_sweep";
                evidence.Add($"Primary volume {primaryVol.MountPoint} is {primaryVol.UsedPercent}% full.");
                recommendations.Add("Clean temporary build files, download caches, and update staging.");
            }
        }

        sw.Stop();
        string summary = status == DiagnosticStatus.Passed
            ? "Storage hardware integrity and available capacity are healthy."
            : (status == DiagnosticStatus.Warning
                ? "Storage capacity is low or developing warning indicators."
                : "Critical storage issue: drive failure imminent or disk capacity exhausted.");

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
