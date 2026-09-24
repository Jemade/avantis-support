namespace Avantis.Contracts.Devices;

public record DeviceRegistrationRequest(
    string Hostname,
    string ChassisType,
    string Model,
    string Manufacturer,
    string SerialNumber,
    string OsVersion,
    string AgentVersion,
    string? EnrollmentToken = null,
    Guid? TenantId = null,
    Guid? OrganizationId = null,
    Guid? SiteId = null
);

public record DeviceRegistrationResponse(
    string DeviceId,
    Guid TenantId,
    Guid OrganizationId,
    Guid SiteId,
    string DeviceToken,
    int TelemetryIntervalSeconds,
    string Status,
    DateTime RegisteredAtUtc
);

public record DeviceSummaryDto(
    string DeviceId,
    Guid TenantId,
    string Hostname,
    string Model,
    string Manufacturer,
    string SerialNumber,
    string ChassisType,
    string OsVersion,
    string AgentVersion,
    string HealthStatus,
    int? HealthScore,
    DateTime LastSeenUtc,
    bool IsOnline
);

public record DeviceDetailDto(
    string DeviceId,
    Guid TenantId,
    string Hostname,
    string Model,
    string Manufacturer,
    string SerialNumber,
    string ChassisType,
    string OsVersion,
    string AgentVersion,
    string HealthStatus,
    int? HealthScore,
    DateTime LastSeenUtc,
    bool IsOnline,
    string? PrimaryIp,
    string? MacAddress,
    string? CpuModel,
    int? CpuCores,
    double? TotalPhysicalRamGb,
    double? PrimaryStorageCapacityGb,
    double? PrimaryStorageFreeGb,
    string? BatteryHealthStatus,
    int? BatteryWearPercent,
    Dictionary<string, object>? HardwareSpecs = null
);
