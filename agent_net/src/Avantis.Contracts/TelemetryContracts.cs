namespace Avantis.Contracts.Telemetry;

public record TelemetryBatch(
    Guid BatchId,
    string DeviceId,
    Guid TenantId,
    DateTime SentAtUtc,
    List<PerformanceSample> Samples,
    Hardware.HardwareSnapshot? LatestSnapshot = null
);

public record PerformanceSample(
    DateTime TimestampUtc,
    double CpuUtilizationPercent,
    double? CpuTemperatureC,
    double MemoryUtilizationPercent,
    double MemoryUsedGb,
    double PrimaryDiskUsedPercent,
    double PrimaryDiskFreeGb,
    string? DiskSmartStatus,
    int? BatteryChargePercent,
    int? BatteryWearPercent,
    double? NetworkLatencyMs,
    double? DiskQueueLength,
    int? ActiveProcessCount
);
