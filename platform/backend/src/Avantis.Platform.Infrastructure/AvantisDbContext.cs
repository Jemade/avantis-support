using Avantis.Platform.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Avantis.Platform.Infrastructure;

public interface ITenantProvider
{
    Guid? CurrentTenantId { get; }
}

public class DefaultTenantProvider : ITenantProvider
{
    public Guid? CurrentTenantId { get; set; } = Guid.Parse("11111111-1111-1111-1111-111111111111");
}

public class AvantisDbContext : DbContext
{
    private readonly ITenantProvider? _tenantProvider;

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<Site> Sites => Set<Site>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<TelemetrySnapshot> TelemetrySnapshots => Set<TelemetrySnapshot>();
    public DbSet<PlatformEvent> PlatformEvents => Set<PlatformEvent>();
    public DbSet<Alert> Alerts => Set<Alert>();
    public DbSet<SupportTicket> SupportTickets => Set<SupportTicket>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    public AvantisDbContext(DbContextOptions<AvantisDbContext> options, ITenantProvider? tenantProvider = null)
        : base(options)
    {
        _tenantProvider = tenantProvider;
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Multi-tenant Query Filters
        modelBuilder.Entity<Device>().HasQueryFilter(d => !_tenantProvider!.CurrentTenantId.HasValue || d.TenantId == _tenantProvider.CurrentTenantId.Value);
        modelBuilder.Entity<TelemetrySnapshot>().HasQueryFilter(t => !_tenantProvider!.CurrentTenantId.HasValue || t.TenantId == _tenantProvider.CurrentTenantId.Value);
        modelBuilder.Entity<Alert>().HasQueryFilter(a => !_tenantProvider!.CurrentTenantId.HasValue || a.TenantId == _tenantProvider.CurrentTenantId.Value);
        modelBuilder.Entity<SupportTicket>().HasQueryFilter(s => !_tenantProvider!.CurrentTenantId.HasValue || s.TenantId == _tenantProvider.CurrentTenantId.Value);
        modelBuilder.Entity<PlatformEvent>().HasQueryFilter(e => !_tenantProvider!.CurrentTenantId.HasValue || e.TenantId == _tenantProvider.CurrentTenantId.Value);

        // Indexes for performance
        modelBuilder.Entity<Device>().HasIndex(d => d.SerialNumber);
        modelBuilder.Entity<Device>().HasIndex(d => d.HealthStatus);
        modelBuilder.Entity<TelemetrySnapshot>().HasIndex(t => new { t.DeviceId, t.TimestampUtc });
        modelBuilder.Entity<Alert>().HasIndex(a => new { a.DeviceId, a.Status });
        modelBuilder.Entity<PlatformEvent>().HasIndex(e => new { e.DeviceId, e.TimestampUtc });
    }

    public async Task EnsureSeededAsync()
    {
        if (await Tenants.AnyAsync()) return;

        var defaultTenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var defaultOrgId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var defaultSiteId = Guid.Parse("33333333-3333-3333-3333-333333333333");

        var tenant = new Tenant
        {
            Id = defaultTenantId,
            Name = "Avantis Global Enterprise",
            Tier = "Enterprise",
            CreatedAtUtc = DateTime.UtcNow
        };

        var org = new Organization
        {
            Id = defaultOrgId,
            TenantId = defaultTenantId,
            Name = "Headquarters IT Operations",
            CreatedAtUtc = DateTime.UtcNow
        };

        var site = new Site
        {
            Id = defaultSiteId,
            OrganizationId = defaultOrgId,
            Name = "Primary Data & Corporate Campus",
            Location = "Harare, ZW"
        };

        Tenants.Add(tenant);
        Organizations.Add(org);
        Sites.Add(site);

        // Clearly identified demonstration machines for IT testing
        var demoLaptop = new Device
        {
            Id = "AVT-DEMO-BOOKPRO",
            TenantId = defaultTenantId,
            SiteId = defaultSiteId,
            Hostname = "AVANTIS-FIELD-01",
            Model = "Avantis BookPro 14",
            Manufacturer = "Avantis Technologies",
            SerialNumber = "AVT-DEMO-BOOKPRO",
            ChassisType = "Laptop",
            OsVersion = "Windows 11 Enterprise (23H2)",
            AgentVersion = "2.0.0-net8",
            HealthStatus = "HEALTHY",
            HealthScore = 98,
            LastSeenUtc = DateTime.UtcNow,
            IsOnline = true,
            SpecsJson = "{\"cpu\": \"Intel Core Ultra 7 155H\", \"ramGB\": 32, \"storageGB\": 1000, \"gpu\": \"Intel Arc Graphics\"}"
        };

        var demoWorkstation = new Device
        {
            Id = "AVT-DEMO-PROTOWER",
            TenantId = defaultTenantId,
            SiteId = defaultSiteId,
            Hostname = "AVANTIS-CAD-04",
            Model = "Avantis ProTower 7000",
            Manufacturer = "Avantis Technologies",
            SerialNumber = "AVT-DEMO-PROTOWER",
            ChassisType = "Desktop",
            OsVersion = "Windows 11 Pro for Workstations",
            AgentVersion = "2.0.0-net8",
            HealthStatus = "HEALTHY",
            HealthScore = 100,
            LastSeenUtc = DateTime.UtcNow,
            IsOnline = true,
            SpecsJson = "{\"cpu\": \"AMD Ryzen 9 7950X\", \"ramGB\": 64, \"storageGB\": 4000, \"gpu\": \"NVIDIA GeForce RTX 4080\"}"
        };

        var demoAio = new Device
        {
            Id = "AVT-DEMO-TOUCHAIO",
            TenantId = defaultTenantId,
            SiteId = defaultSiteId,
            Hostname = "AVANTIS-RECEPT-02",
            Model = "Avantis Touch AIO 24",
            Manufacturer = "Avantis Technologies",
            SerialNumber = "AVT-DEMO-TOUCHAIO",
            ChassisType = "All-in-One",
            OsVersion = "Windows 11 Enterprise",
            AgentVersion = "2.0.0-net8",
            HealthStatus = "WARNING",
            HealthScore = 78,
            LastSeenUtc = DateTime.UtcNow.AddMinutes(-5),
            IsOnline = true,
            SpecsJson = "{\"cpu\": \"Intel Core i7-13700T\", \"ramGB\": 16, \"storageGB\": 512, \"touch\": true}"
        };

        Devices.AddRange(demoLaptop, demoWorkstation, demoAio);

        // Sample alert for degraded machine
        Alerts.Add(new Alert
        {
            Id = Guid.NewGuid(),
            DeviceId = demoAio.Id,
            TenantId = defaultTenantId,
            Component = "storage",
            Severity = "WARNING",
            Title = "Low Storage Capacity (87% used)",
            Message = "Drive C: has 65.4 GB remaining.",
            Metric = "65.4 GB Free",
            Risk = "Storage buffer capacity is running low.",
            Status = "ACTIVE",
            DetectedAtUtc = DateTime.UtcNow.AddHours(-2)
        });

        // Sample support ticket
        SupportTickets.Add(new SupportTicket
        {
            Id = "AVT-TCK-104928",
            DeviceId = demoAio.Id,
            TenantId = defaultTenantId,
            Title = "Automated Storage Maintenance Alert",
            Description = "Storage capacity on Reception AIO reached warning threshold (87%). Scheduled clean requested.",
            Severity = "MEDIUM",
            Status = "NEW",
            CustomerName = "Corporate Reception",
            CustomerEmail = "reception@avantispc.com",
            CreatedAtUtc = DateTime.UtcNow.AddHours(-1)
        });

        await SaveChangesAsync();
    }
}
