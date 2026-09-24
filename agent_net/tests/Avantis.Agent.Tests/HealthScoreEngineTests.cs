using Avantis.Agent.Core.Health;
using Avantis.Contracts.Hardware;

namespace Avantis.Agent.Tests;

public class HealthScoreEngineTests
{
    private readonly HealthScoreEngine _engine = new();
    private readonly Guid _testTenantId = Guid.NewGuid();

    [Fact]
    public void HealthyLaptop_EvaluatesTo_HealthyWithHighScore()
    {
        var snapshot = CreateBaseSnapshot(
            cpuLoad: 25.0,
            cpuTemp: 45.0,
            ramUsedPct: 50,
            storageUsedPct: 40,
            batteryWear: 5,
            isLaptop: true
        );

        var eval = _engine.Evaluate(snapshot, _testTenantId);

        Assert.Equal("HEALTHY", eval.Status);
        Assert.True(eval.OverallScore >= 95);
        Assert.Empty(eval.Alerts);
        Assert.Equal(100, eval.CategoryScores["Storage"]);
    }

    [Fact]
    public void DesktopWorkstation_WithNoBattery_HasZeroBatteryDeductions()
    {
        var snapshot = CreateBaseSnapshot(
            cpuLoad: 30.0,
            cpuTemp: 42.0,
            ramUsedPct: 45,
            storageUsedPct: 50,
            batteryWear: null,
            isLaptop: false
        );

        var eval = _engine.Evaluate(snapshot, _testTenantId);

        Assert.Equal("HEALTHY", eval.Status);
        Assert.Equal(100, eval.OverallScore);
        Assert.Equal(100, eval.CategoryScores["Battery"]);
    }

    [Fact]
    public void SevereCpuThermalThrottling_TriggersCriticalAlert()
    {
        var snapshot = CreateBaseSnapshot(
            cpuLoad: 40.0,
            cpuTemp: 94.0, // Critical
            ramUsedPct: 50,
            storageUsedPct: 40,
            batteryWear: 10,
            isLaptop: true
        );

        var eval = _engine.Evaluate(snapshot, _testTenantId);

        Assert.Equal("CRITICAL", eval.Status);
        Assert.True(eval.OverallScore <= 70);
        Assert.Contains(eval.Alerts, a => a.Component == "cpu" && a.Severity == "CRITICAL");
    }

    [Fact]
    public void SmartPredictiveFailure_ImmediatelyTriggersCriticalAlert()
    {
        var snapshot = CreateBaseSnapshot(
            cpuLoad: 20.0,
            cpuTemp: 40.0,
            ramUsedPct: 30,
            storageUsedPct: 40,
            batteryWear: 0,
            isLaptop: true,
            hasSmartFailure: true
        );

        var eval = _engine.Evaluate(snapshot, _testTenantId);

        Assert.Equal("CRITICAL", eval.Status);
        Assert.True(eval.OverallScore <= 50);
        Assert.Contains(eval.Alerts, a => a.Component == "storage" && a.Severity == "CRITICAL");
    }

    [Fact]
    public void ExhaustedStorageVolume_GeneratesRemediationRecommendation()
    {
        var snapshot = CreateBaseSnapshot(
            cpuLoad: 20.0,
            cpuTemp: 40.0,
            ramUsedPct: 40,
            storageUsedPct: 95, // 95% full
            batteryWear: 5,
            isLaptop: true
        );

        var eval = _engine.Evaluate(snapshot, _testTenantId);

        Assert.Equal("CRITICAL", eval.Status);
        Assert.Contains(eval.Alerts, a => a.Component == "storage");
    }

    private static HardwareSnapshot CreateBaseSnapshot(
        double cpuLoad,
        double cpuTemp,
        int ramUsedPct,
        int storageUsedPct,
        int? batteryWear,
        bool isLaptop,
        bool hasSmartFailure = false)
    {
        var identity = new SystemIdentity(
            "TEST-PC",
            isLaptop ? "Avantis BookPro 14" : "Avantis ProTower 7000",
            "Avantis",
            "AVT-SN-9988",
            isLaptop ? "Laptop" : "Desktop",
            "Windows 11 Enterprise",
            "1.2.0",
            false,
            false
        );

        var cpu = new CpuInfo(
            "Intel Core i7-13700H",
            "Intel",
            14,
            20,
            5.0,
            cpuLoad,
            cpuTemp,
            true,
            "Active"
        );

        var mem = new MemoryInfo(
            16.0,
            16.0 * (1.0 - (ramUsedPct / 100.0)),
            16.0 * (ramUsedPct / 100.0),
            ramUsedPct,
            new List<RamStickInfo>()
        );

        var disks = new List<PhysicalDiskInfo>
        {
            new("0", "Samsung 990 PRO 1TB", 1000.0, "NVMe SSD", "NVME", "OK",
                hasSmartFailure ? "PREDICTIVE_FAILURE" : "PASSED", hasSmartFailure, hasSmartFailure ? 24 : 0)
        };

        var volumes = new List<LogicalVolumeInfo>
        {
            new("C:", "NTFS", 500.0, 500.0 * (1.0 - (storageUsedPct / 100.0)), 500.0 * (storageUsedPct / 100.0), storageUsedPct)
        };

        var battery = new BatteryInfo(
            isLaptop,
            !isLaptop,
            isLaptop ? 85 : null,
            isLaptop ? "Discharging on Battery" : "AC Mains Power",
            isLaptop ? 75000 : null,
            isLaptop ? (int)(75000 * (1.0 - ((batteryWear ?? 0) / 100.0))) : null,
            batteryWear,
            isLaptop ? "GOOD" : "NOT_APPLICABLE"
        );

        var gpus = new List<GpuInfo>
        {
            new("NVIDIA GeForce RTX 4060", 8.0, "535.98", true, "Dedicated GPU")
        };

        var net = new NetworkSummary("Wi-Fi", "192.168.1.100", "00:11:22:33:44:55", "192.168.1.1", 4.0, 15.0, 0.0, true);

        return new HardwareSnapshot(identity, cpu, mem, disks, volumes, battery, gpus, net, DateTime.UtcNow);
    }
}
