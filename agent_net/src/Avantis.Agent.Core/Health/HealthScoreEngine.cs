using Avantis.Agent.Core.Configuration;
using Avantis.Contracts.Alerts;
using Avantis.Contracts.Hardware;
using Microsoft.Extensions.Options;

namespace Avantis.Agent.Core.Health;

public class HealthScoreEngine : IHealthScoreEngine
{
    private readonly ThresholdOptions _thresholds;

    public HealthScoreEngine(IOptions<ThresholdOptions>? options = null)
    {
        _thresholds = options?.Value ?? new ThresholdOptions();
    }

    public HealthEvaluation Evaluate(HardwareSnapshot snapshot, Guid tenantId)
    {
        var alerts = new List<AlertDto>();
        int overallScore = 100;
        string overallStatus = "HEALTHY";

        int hardwareScore = 100;
        int performanceScore = 100;
        int storageScore = 100;
        int batteryScore = 100;
        int networkScore = 100;

        string deviceId = snapshot.System.SerialNumber;
        if (string.IsNullOrWhiteSpace(deviceId))
        {
            deviceId = snapshot.System.Hostname;
        }

        // ============================================
        // 1. CPU LOAD / PERFORMANCE
        // ============================================
        if (snapshot.Cpu.CurrentUtilizationPercent.HasValue)
        {
            double cpuLoad = snapshot.Cpu.CurrentUtilizationPercent.Value;
            if (cpuLoad >= _thresholds.CpuLoadCriticalPercent)
            {
                overallScore -= 25;
                performanceScore -= 35;
                overallStatus = "CRITICAL";
                alerts.Add(new AlertDto(
                    Guid.NewGuid(),
                    deviceId,
                    tenantId,
                    "cpu",
                    "CRITICAL",
                    $"Critical CPU Load ({cpuLoad:F0}%)",
                    $"Processor load is sustained at {cpuLoad:F0}% across {snapshot.Cpu.PhysicalCores} cores.",
                    $"{cpuLoad:F0}% CPU Utilization",
                    "Sustained peak compute demand causes system latency, thermal throttling, and battery drain.",
                    new List<string>
                    {
                        "Inspect active background processes in Task Manager.",
                        "Verify laptop vents are unobstructed."
                    },
                    DateTime.UtcNow,
                    null,
                    "ACTIVE",
                    "Troubleshoot CPU",
                    "cpu"
                ));
            }
            else if (cpuLoad >= _thresholds.CpuLoadWarningPercent)
            {
                overallScore -= 10;
                performanceScore -= 15;
                if (overallStatus == "HEALTHY") overallStatus = "WARNING";
                alerts.Add(new AlertDto(
                    Guid.NewGuid(),
                    deviceId,
                    tenantId,
                    "cpu",
                    "WARNING",
                    $"Elevated CPU Utilization ({cpuLoad:F0}%)",
                    $"Processor load is elevated at {cpuLoad:F0}%.",
                    $"{cpuLoad:F0}% CPU Utilization",
                    "Elevated processing causes cooling fans to run at high speed and reduces battery life.",
                    new List<string> { "Review background applications." },
                    DateTime.UtcNow,
                    null,
                    "ACTIVE",
                    "Troubleshoot CPU",
                    "cpu"
                ));
            }
        }

        // ============================================
        // 2. CPU TEMPERATURE / THERMAL RUNAWAY
        // ============================================
        if (snapshot.Cpu.TemperatureCelsius.HasValue && snapshot.Cpu.IsDirectHardwareSensor)
        {
            double tempC = snapshot.Cpu.TemperatureCelsius.Value;
            if (tempC >= _thresholds.CpuTempCriticalC)
            {
                overallScore -= 30;
                hardwareScore -= 40;
                overallStatus = "CRITICAL";
                alerts.Add(new AlertDto(
                    Guid.NewGuid(),
                    deviceId,
                    tenantId,
                    "cpu",
                    "CRITICAL",
                    $"Critical CPU Temperature ({tempC:F0}°C)",
                    $"Processor core temperature reached {tempC:F0}°C. Thermal safety throttling may occur.",
                    $"{tempC:F0}°C Operating Temperature",
                    "Excessive thermals cause processor throttling and risk hardware damage or emergency shutdown.",
                    new List<string> { "Elevate machine base to restore airflow.", "Check cooling fan function." },
                    DateTime.UtcNow,
                    null,
                    "ACTIVE",
                    "Inspect Thermals",
                    "cpu"
                ));
            }
            else if (tempC >= _thresholds.CpuTempWarningC)
            {
                overallScore -= 12;
                hardwareScore -= 20;
                if (overallStatus == "HEALTHY") overallStatus = "WARNING";
                alerts.Add(new AlertDto(
                    Guid.NewGuid(),
                    deviceId,
                    tenantId,
                    "cpu",
                    "WARNING",
                    $"High CPU Temperature ({tempC:F0}°C)",
                    $"Processor temperature is running high at {tempC:F0}°C.",
                    $"{tempC:F0}°C Operating Temperature",
                    "Continued high temperatures degrade performance and accelerate component wear.",
                    new List<string> { "Ensure vents are clean and unobstructed." },
                    DateTime.UtcNow,
                    null,
                    "ACTIVE",
                    "Inspect Thermals",
                    "cpu"
                ));
            }
        }

        // ============================================
        // 3. MEMORY (RAM) UTILIZATION
        // ============================================
        if (snapshot.Memory.UtilizationPercent >= _thresholds.RamUsedCriticalPercent)
        {
            overallScore -= 20;
            performanceScore -= 30;
            overallStatus = "CRITICAL";
            alerts.Add(new AlertDto(
                Guid.NewGuid(),
                deviceId,
                tenantId,
                "memory",
                "CRITICAL",
                $"Critical Memory Utilization ({snapshot.Memory.UtilizationPercent}%)",
                $"System memory is almost exhausted ({snapshot.Memory.UsedGb:F1}/{snapshot.Memory.TotalPhysicalGb:F1} GB committed).",
                $"{snapshot.Memory.UtilizationPercent}% RAM Committed",
                "Severe paging and disk thrashing occurs when physical RAM is fully saturated.",
                new List<string> { "Close memory-heavy applications or browser tabs.", "Consider expanding RAM capacity." },
                DateTime.UtcNow,
                null,
                "ACTIVE",
                "Manage Memory",
                "memory"
            ));
        }
        else if (snapshot.Memory.UtilizationPercent >= _thresholds.RamUsedWarningPercent)
        {
            overallScore -= 10;
            performanceScore -= 15;
            if (overallStatus == "HEALTHY") overallStatus = "WARNING";
            alerts.Add(new AlertDto(
                Guid.NewGuid(),
                deviceId,
                tenantId,
                "memory",
                "WARNING",
                $"Elevated Memory Utilization ({snapshot.Memory.UtilizationPercent}%)",
                $"RAM usage is high at {snapshot.Memory.UsedGb:F1} GB of {snapshot.Memory.TotalPhysicalGb:F1} GB.",
                $"{snapshot.Memory.UtilizationPercent}% RAM Committed",
                "Applications may slow down as available buffer memory is reduced.",
                new List<string> { "Review high memory applications." },
                DateTime.UtcNow,
                null,
                "ACTIVE",
                "Manage Memory",
                "memory"
            ));
        }

        // ============================================
        // 4. STORAGE UTILIZATION & SMART HEALTH
        // ============================================
        foreach (var disk in snapshot.Disks)
        {
            if (disk.PredictFailure)
            {
                overallScore -= 50;
                storageScore -= 60;
                overallStatus = "CRITICAL";
                alerts.Add(new AlertDto(
                    Guid.NewGuid(),
                    deviceId,
                    tenantId,
                    "storage",
                    "CRITICAL",
                    $"SMART Hardware Anomaly ({disk.Model})",
                    $"Physical drive {disk.Model} has flagged an imminent hardware failure via SMART.",
                    $"SMART Status: {disk.SmartStatus}",
                    "Hardware failure is predicted. Immediate data backup and drive replacement required.",
                    new List<string> { "Backup critical files immediately.", "Contact IT support to arrange replacement." },
                    DateTime.UtcNow,
                    null,
                    "ACTIVE",
                    "Backup Data",
                    "storage"
                ));
            }
            else if (disk.ReallocatedSectors.HasValue && disk.ReallocatedSectors.Value > 0)
            {
                overallScore -= 20;
                storageScore -= 25;
                if (overallStatus == "HEALTHY") overallStatus = "WARNING";
                alerts.Add(new AlertDto(
                    Guid.NewGuid(),
                    deviceId,
                    tenantId,
                    "storage",
                    "WARNING",
                    $"SMART Reallocated Sectors ({disk.Model})",
                    $"Primary drive has {disk.ReallocatedSectors.Value} reallocated sectors.",
                    $"{disk.ReallocatedSectors.Value} Reallocated Sectors",
                    "Developing bad sectors indicate storage surface degradation.",
                    new List<string> { "Monitor SMART trends and maintain current backups." },
                    DateTime.UtcNow,
                    null,
                    "ACTIVE",
                    "Check Drive",
                    "storage"
                ));
            }
        }

        var primaryVol = snapshot.Volumes.FirstOrDefault(v => v.MountPoint.StartsWith("C", StringComparison.OrdinalIgnoreCase))
                         ?? snapshot.Volumes.FirstOrDefault();
        if (primaryVol != null)
        {
            if (primaryVol.UsedPercent >= _thresholds.StorageUsedCriticalPercent)
            {
                overallScore -= 25;
                storageScore -= 30;
                overallStatus = "CRITICAL";
                alerts.Add(new AlertDto(
                    Guid.NewGuid(),
                    deviceId,
                    tenantId,
                    "storage",
                    "CRITICAL",
                    $"Critical Storage Capacity ({primaryVol.UsedPercent}% used)",
                    $"System drive {primaryVol.MountPoint} has only {primaryVol.FreeGb:F1} GB free.",
                    $"{primaryVol.FreeGb:F1} GB Free of {primaryVol.TotalGb:F1} GB",
                    "System updates cannot install and virtual memory paging may fail when drive space is depleted.",
                    new List<string> { "Run disk cleanup to remove temporary and staging files." },
                    DateTime.UtcNow,
                    null,
                    "ACTIVE",
                    "Run Disk Cleanup",
                    "storage"
                ));
            }
            else if (primaryVol.UsedPercent >= _thresholds.StorageUsedWarningPercent)
            {
                overallScore -= 10;
                storageScore -= 15;
                if (overallStatus == "HEALTHY") overallStatus = "WARNING";
                alerts.Add(new AlertDto(
                    Guid.NewGuid(),
                    deviceId,
                    tenantId,
                    "storage",
                    "WARNING",
                    $"Low Storage Capacity ({primaryVol.UsedPercent}% used)",
                    $"Drive {primaryVol.MountPoint} has {primaryVol.FreeGb:F1} GB remaining.",
                    $"{primaryVol.FreeGb:F1} GB Free",
                    "Available storage is running low.",
                    new List<string> { "Clean cache and temporary files." },
                    DateTime.UtcNow,
                    null,
                    "ACTIVE",
                    "Run Disk Cleanup",
                    "storage"
                ));
            }
        }

        // ============================================
        // 5. BATTERY HEALTH (Laptops only)
        // ============================================
        if (snapshot.Battery.IsPresent && snapshot.Battery.WearPercent.HasValue)
        {
            int wear = snapshot.Battery.WearPercent.Value;
            if (wear >= _thresholds.BatteryWearCriticalPercent)
            {
                overallScore -= 25;
                batteryScore -= 40;
                overallStatus = "CRITICAL";
                alerts.Add(new AlertDto(
                    Guid.NewGuid(),
                    deviceId,
                    tenantId,
                    "battery",
                    "CRITICAL",
                    $"Degraded Battery Health ({100 - wear}% retention)",
                    $"Battery has degraded to {100 - wear}% of design capacity ({wear}% wear level).",
                    $"{wear}% Wear Level",
                    "Substantially reduced operating runtime on battery power.",
                    new List<string> { "Consider battery replacement if portable runtime is insufficient." },
                    DateTime.UtcNow,
                    null,
                    "ACTIVE",
                    "Inspect Battery",
                    "battery"
                ));
            }
            else if (wear >= _thresholds.BatteryWearWarningPercent)
            {
                overallScore -= 10;
                batteryScore -= 20;
                if (overallStatus == "HEALTHY") overallStatus = "WARNING";
                alerts.Add(new AlertDto(
                    Guid.NewGuid(),
                    deviceId,
                    tenantId,
                    "battery",
                    "WARNING",
                    $"Moderate Battery Wear ({100 - wear}% retention)",
                    $"Battery retention capacity has degraded by {wear}%.",
                    $"{wear}% Wear Level",
                    "Battery runtimes will be moderately shorter than original factory specifications.",
                    new List<string> { "Calibrate battery gauge by full discharge and recharge." },
                    DateTime.UtcNow,
                    null,
                    "ACTIVE",
                    "Inspect Battery",
                    "battery"
                ));
            }
        }
        else
        {
            // Desktop or AC mains only - zero battery deductions
            batteryScore = 100;
        }

        // Clamp scores to 0-100
        overallScore = Math.Clamp(overallScore, 0, 100);
        hardwareScore = Math.Clamp(hardwareScore, 0, 100);
        performanceScore = Math.Clamp(performanceScore, 0, 100);
        storageScore = Math.Clamp(storageScore, 0, 100);
        batteryScore = Math.Clamp(batteryScore, 0, 100);
        networkScore = Math.Clamp(networkScore, 0, 100);

        var categoryScores = new Dictionary<string, int>
        {
            ["Hardware"] = hardwareScore,
            ["Performance"] = performanceScore,
            ["Storage"] = storageScore,
            ["Battery"] = batteryScore,
            ["Network"] = networkScore
        };

        return new HealthEvaluation(overallScore, overallStatus, alerts, categoryScores);
    }
}
