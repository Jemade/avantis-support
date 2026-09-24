namespace Avantis.Platform.Core.Entities;

public class Tenant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Tier { get; set; } = "Enterprise";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<Organization> Organizations { get; set; } = new();
    public List<Device> Devices { get; set; } = new();
}

public class Organization
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public Tenant? Tenant { get; set; }
    public List<Site> Sites { get; set; } = new();
}

public class Site
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrganizationId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;

    public Organization? Organization { get; set; }
    public List<Device> Devices { get; set; } = new();
}

public class Device
{
    public string Id { get; set; } = string.Empty; // DeviceId (Serial Number or UUID)
    public Guid TenantId { get; set; }
    public Guid? SiteId { get; set; }

    public string Hostname { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public string Manufacturer { get; set; } = "Avantis";
    public string SerialNumber { get; set; } = string.Empty;
    public string ChassisType { get; set; } = "Desktop"; // "Laptop", "Desktop", "All-in-One"
    public string OsVersion { get; set; } = string.Empty;
    public string AgentVersion { get; set; } = "2.0.0-net8";

    public string HealthStatus { get; set; } = "HEALTHY"; // "HEALTHY", "WARNING", "CRITICAL"
    public int? HealthScore { get; set; } = 100;
    public DateTime LastSeenUtc { get; set; } = DateTime.UtcNow;
    public bool IsOnline { get; set; } = true;

    public string? SpecsJson { get; set; } // Detailed hardware specs JSON

    public Tenant? Tenant { get; set; }
    public Site? Site { get; set; }
    public List<TelemetrySnapshot> TelemetrySnapshots { get; set; } = new();
    public List<Alert> Alerts { get; set; } = new();
    public List<SupportTicket> SupportTickets { get; set; } = new();
}

public class TelemetrySnapshot
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string DeviceId { get; set; } = string.Empty;
    public Guid TenantId { get; set; }
    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;

    public double? CpuLoadPercent { get; set; }
    public double? CpuTempC { get; set; }
    public double? RamUsedPercent { get; set; }
    public double? StorageFreeGb { get; set; }
    public double? StorageUsedPercent { get; set; }
    public string? StorageSmartStatus { get; set; }
    public int? BatteryChargePercent { get; set; }
    public int? BatteryWearPercent { get; set; }

    public string? RawMetricsJson { get; set; }

    public Device? Device { get; set; }
}

public class PlatformEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string DeviceId { get; set; } = string.Empty;
    public Guid TenantId { get; set; }
    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
    public string EventType { get; set; } = string.Empty;
    public string Severity { get; set; } = "Informational";
    public string Source { get; set; } = "AgentService";
    public Guid? CorrelationId { get; set; }
    public Guid? CausationId { get; set; }
    public string Summary { get; set; } = string.Empty;
    public string? PayloadJson { get; set; }
}

public class Alert
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string DeviceId { get; set; } = string.Empty;
    public Guid TenantId { get; set; }
    public string Component { get; set; } = string.Empty; // "cpu", "memory", "storage", "battery", "security"
    public string Severity { get; set; } = "WARNING";     // "WARNING", "CRITICAL"
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Metric { get; set; } = string.Empty;
    public string Risk { get; set; } = string.Empty;
    public string Status { get; set; } = "ACTIVE";        // "ACTIVE", "RESOLVED", "SUPPRESSED"
    public DateTime DetectedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAtUtc { get; set; }

    public Device? Device { get; set; }
}

public class SupportTicket
{
    public string Id { get; set; } = string.Empty; // e.g. "AVT-TCK-123456"
    public string DeviceId { get; set; } = string.Empty;
    public Guid TenantId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Severity { get; set; } = "MEDIUM"; // "LOW", "MEDIUM", "HIGH", "CRITICAL"
    public string Status { get; set; } = "NEW";      // "NEW", "INVESTIGATING", "RESOLVED", "CLOSED"

    public string CustomerName { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public string? AssignedTechnician { get; set; }
    public string? DiagnosticSnapshotJson { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAtUtc { get; set; }

    public Device? Device { get; set; }
}

public class AuditLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
    public string? DetailsJson { get; set; }
}
