using System.Text.Json;
using Avantis.Contracts.Telemetry;
using Avantis.Platform.Core.Entities;
using Avantis.Platform.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Avantis.Platform.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class TelemetryController : ControllerBase
{
    private readonly AvantisDbContext _db;
    private readonly ILogger<TelemetryController> _logger;

    public TelemetryController(AvantisDbContext db, ILogger<TelemetryController> logger)
    {
        _db = db;
        _logger = logger;
    }

    [HttpPost("ingest")]
    public async Task<IActionResult> IngestTelemetry([FromBody] TelemetryBatch batch)
    {
        if (string.IsNullOrWhiteSpace(batch.DeviceId))
        {
            return BadRequest(new { success = false, message = "DeviceId is required in batch" });
        }

        var device = await _db.Devices.FirstOrDefaultAsync(d => d.Id == batch.DeviceId || d.SerialNumber == batch.DeviceId);
        if (device == null)
        {
            // Auto-enroll if missing
            device = new Device
            {
                Id = batch.DeviceId,
                TenantId = batch.TenantId,
                Hostname = batch.LatestSnapshot?.System.Hostname ?? "PC",
                Model = batch.LatestSnapshot?.System.Model ?? "Avantis PC",
                Manufacturer = batch.LatestSnapshot?.System.Manufacturer ?? "Avantis",
                SerialNumber = batch.DeviceId,
                ChassisType = batch.LatestSnapshot?.System.ChassisType ?? "Desktop",
                OsVersion = batch.LatestSnapshot?.System.OsVersion ?? "Windows",
                HealthStatus = "HEALTHY",
                HealthScore = 100,
                LastSeenUtc = DateTime.UtcNow,
                IsOnline = true
            };
            _db.Devices.Add(device);
        }
        else
        {
            device.LastSeenUtc = DateTime.UtcNow;
            device.IsOnline = true;
            if (batch.LatestSnapshot != null)
            {
                device.OsVersion = batch.LatestSnapshot.System.OsVersion;
                device.SpecsJson = JsonSerializer.Serialize(batch.LatestSnapshot);
            }
        }

        foreach (var sample in batch.Samples)
        {
            var snap = new TelemetrySnapshot
            {
                Id = Guid.NewGuid(),
                DeviceId = device.Id,
                TenantId = batch.TenantId,
                TimestampUtc = sample.TimestampUtc,
                CpuLoadPercent = sample.CpuUtilizationPercent,
                CpuTempC = sample.CpuTemperatureC,
                RamUsedPercent = sample.MemoryUtilizationPercent,
                StorageFreeGb = sample.PrimaryDiskFreeGb,
                StorageUsedPercent = sample.PrimaryDiskUsedPercent,
                StorageSmartStatus = sample.DiskSmartStatus,
                BatteryChargePercent = sample.BatteryChargePercent,
                BatteryWearPercent = sample.BatteryWearPercent,
                RawMetricsJson = JsonSerializer.Serialize(sample)
            };
            _db.TelemetrySnapshots.Add(snap);

            // Re-evaluate simple threshold alerts if needed
            if (sample.CpuUtilizationPercent >= 92)
            {
                device.HealthStatus = "CRITICAL";
                device.HealthScore = Math.Min(device.HealthScore ?? 100, 65);
            }
            else if (sample.CpuUtilizationPercent >= 82)
            {
                if (device.HealthStatus == "HEALTHY") device.HealthStatus = "WARNING";
                device.HealthScore = Math.Min(device.HealthScore ?? 100, 85);
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new { success = true, message = "Telemetry batch ingested successfully" });
    }

    [HttpGet("history/{deviceId}")]
    public async Task<IActionResult> GetTelemetryHistory(string deviceId, [FromQuery] int limit = 50)
    {
        var history = await _db.TelemetrySnapshots
            .AsNoTracking()
            .Where(t => t.DeviceId == deviceId)
            .OrderByDescending(t => t.TimestampUtc)
            .Take(limit)
            .ToListAsync();

        return Ok(new { success = true, count = history.Count, samples = history });
    }
}
