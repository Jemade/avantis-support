namespace Avantis.Agent.Core.Configuration;

public class AgentOptions
{
    public const string SectionName = "AvantisAgent";

    public string DeviceId { get; set; } = string.Empty;
    public Guid TenantId { get; set; } = Guid.Parse("11111111-1111-1111-1111-111111111111"); // Default enterprise tenant
    public Guid OrganizationId { get; set; } = Guid.Parse("22222222-2222-2222-2222-222222222222");
    public Guid SiteId { get; set; } = Guid.Parse("33333333-3333-3333-3333-333333333333");
    
    public string BackendUrl { get; set; } = "http://localhost:9141";
    public string DeviceToken { get; set; } = string.Empty;
    public string EnrollmentToken { get; set; } = "AVANTIS-ENT-2026";
    
    public int HeartbeatIntervalSeconds { get; set; } = 60;
    public int TelemetryIntervalSeconds { get; set; } = 30;
    public int HardwareSnapshotIntervalMinutes { get; set; } = 5;
    
    public string LocalDatabasePath { get; set; } = string.Empty;
    public string NamedPipeName { get; set; } = "AvantisAgentIpc";
    public int LocalHttpPort { get; set; } = 9140; // Development / compatibility bridge
}

public class ThresholdOptions
{
    public double CpuLoadWarningPercent { get; set; } = 82.0;
    public double CpuLoadCriticalPercent { get; set; } = 92.0;

    public double CpuTempWarningC { get; set; } = 75.0;
    public double CpuTempCriticalC { get; set; } = 90.0;

    public double RamUsedWarningPercent { get; set; } = 80.0;
    public double RamUsedCriticalPercent { get; set; } = 92.0;

    public double StorageUsedWarningPercent { get; set; } = 85.0;
    public double StorageUsedCriticalPercent { get; set; } = 93.0;

    public int BatteryWearWarningPercent { get; set; } = 35;
    public int BatteryWearCriticalPercent { get; set; } = 50;

    public double NetworkLatencyWarningMs { get; set; } = 150.0;
}
