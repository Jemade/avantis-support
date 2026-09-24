namespace Avantis.Contracts.Hardware;

public record HardwareSnapshot(
    SystemIdentity System,
    CpuInfo Cpu,
    MemoryInfo Memory,
    List<PhysicalDiskInfo> Disks,
    List<LogicalVolumeInfo> Volumes,
    BatteryInfo Battery,
    List<GpuInfo> Gpus,
    NetworkSummary Network,
    DateTime TimestampUtc
);

public record SystemIdentity(
    string Hostname,
    string Model,
    string Manufacturer,
    string SerialNumber,
    string ChassisType,
    string OsVersion,
    string BiosVersion,
    bool HasTouchScreen,
    bool HasPenDigitizer
);

public record CpuInfo(
    string Model,
    string Manufacturer,
    int PhysicalCores,
    int LogicalProcessors,
    double? MaxClockSpeedGhz,
    double? CurrentUtilizationPercent,
    double? TemperatureCelsius,
    bool IsDirectHardwareSensor,
    string SensorStatus
);

public record MemoryInfo(
    double TotalPhysicalGb,
    double AvailableGb,
    double UsedGb,
    int UtilizationPercent,
    List<RamStickInfo> Modules
);

public record RamStickInfo(
    string DeviceLocator,
    double CapacityGb,
    int? SpeedMhz,
    string? Manufacturer
);

public record PhysicalDiskInfo(
    string DeviceId,
    string Model,
    double? SizeGb,
    string DriveType, // "NVMe SSD", "SATA SSD", "HDD"
    string BusType,
    string OperationalStatus,
    string SmartStatus,
    bool PredictFailure,
    int? ReallocatedSectors
);

public record LogicalVolumeInfo(
    string MountPoint, // "C:"
    string FileSystem, // "NTFS"
    double TotalGb,
    double FreeGb,
    double UsedGb,
    int UsedPercent
);

public record BatteryInfo(
    bool IsPresent,
    bool IsAcConnected,
    int? ChargePercent,
    string ChargingState,
    int? DesignCapacityMwh,
    int? FullChargeCapacityMwh,
    int? WearPercent,
    string HealthClassification // "EXCELLENT", "GOOD", "DEGRADED", "CRITICAL", "NOT_APPLICABLE"
);

public record GpuInfo(
    string Name,
    double? VramGb,
    string? DriverVersion,
    bool IsDedicated,
    string GpuType // "Dedicated GPU", "Integrated GPU"
);

public record NetworkSummary(
    string? PrimaryAdapterName,
    string? PrimaryIpAddress,
    string? MacAddress,
    string? DefaultGateway,
    double? GatewayLatencyMs,
    double? DnsLatencyMs,
    double? PacketLossPercent,
    bool InternetConnected
);
