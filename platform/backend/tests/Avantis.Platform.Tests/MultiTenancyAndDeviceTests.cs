using Avantis.Platform.Core.Entities;
using Avantis.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Avantis.Platform.Tests;

public class TestTenantProvider : ITenantProvider
{
    public Guid? CurrentTenantId { get; set; }
}

public class MultiTenancyAndDeviceTests
{
    [Fact]
    public async Task TenantIsolation_EnforcesStrictQueryFilter()
    {
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();

        var tenantProvider = new TestTenantProvider { CurrentTenantId = tenantA };

        var options = new DbContextOptionsBuilder<AvantisDbContext>()
            .UseInMemoryDatabase(databaseName: "MultiTenancyTestDb_" + Guid.NewGuid())
            .Options;

        // Seed data for both tenants
        using (var db = new AvantisDbContext(options, new TestTenantProvider { CurrentTenantId = null }))
        {
            db.Devices.Add(new Device
            {
                Id = "DEV-TENANT-A",
                TenantId = tenantA,
                Hostname = "PC-ALPHA",
                Model = "Avantis BookPro 14",
                SerialNumber = "SN-A-1",
                HealthStatus = "HEALTHY"
            });

            db.Devices.Add(new Device
            {
                Id = "DEV-TENANT-B",
                TenantId = tenantB,
                Hostname = "PC-BETA",
                Model = "Avantis ProTower 7000",
                SerialNumber = "SN-B-1",
                HealthStatus = "WARNING"
            });

            await db.SaveChangesAsync();
        }

        // Query with Tenant A context
        using (var dbA = new AvantisDbContext(options, tenantProvider))
        {
            var devicesA = await dbA.Devices.ToListAsync();

            Assert.Single(devicesA);
            Assert.Equal("DEV-TENANT-A", devicesA[0].Id);
            Assert.DoesNotContain(devicesA, d => d.TenantId == tenantB);
        }

        // Query with Tenant B context
        tenantProvider.CurrentTenantId = tenantB;
        using (var dbB = new AvantisDbContext(options, tenantProvider))
        {
            var devicesB = await dbB.Devices.ToListAsync();

            Assert.Single(devicesB);
            Assert.Equal("DEV-TENANT-B", devicesB[0].Id);
            Assert.DoesNotContain(devicesB, d => d.TenantId == tenantA);
        }
    }

    [Fact]
    public async Task DeviceEnrollment_PersistsAndAllowsTelemetryAssociation()
    {
        var tenantId = Guid.NewGuid();
        var tenantProvider = new TestTenantProvider { CurrentTenantId = tenantId };

        var options = new DbContextOptionsBuilder<AvantisDbContext>()
            .UseInMemoryDatabase(databaseName: "EnrollmentTestDb_" + Guid.NewGuid())
            .Options;

        using var db = new AvantisDbContext(options, tenantProvider);

        var device = new Device
        {
            Id = "AVT-SN-TEST-01",
            TenantId = tenantId,
            Hostname = "WORKSTATION-01",
            Model = "Avantis ProTower 7000",
            SerialNumber = "AVT-SN-TEST-01",
            ChassisType = "Desktop",
            OsVersion = "Windows 11 Pro",
            HealthStatus = "HEALTHY",
            HealthScore = 100
        };

        db.Devices.Add(device);
        await db.SaveChangesAsync();

        var snap = new TelemetrySnapshot
        {
            Id = Guid.NewGuid(),
            DeviceId = device.Id,
            TenantId = tenantId,
            CpuLoadPercent = 14.5,
            CpuTempC = 41.0,
            RamUsedPercent = 38.0,
            StorageFreeGb = 420.0,
            StorageUsedPercent = 35.0,
            StorageSmartStatus = "PASSED",
            TimestampUtc = DateTime.UtcNow
        };

        db.TelemetrySnapshots.Add(snap);
        await db.SaveChangesAsync();

        var loaded = await db.Devices.Include(d => d.TelemetrySnapshots).FirstOrDefaultAsync(d => d.Id == "AVT-SN-TEST-01");
        Assert.NotNull(loaded);
        Assert.Single(loaded.TelemetrySnapshots);
        Assert.Equal(14.5, loaded.TelemetrySnapshots[0].CpuLoadPercent);
    }
}
