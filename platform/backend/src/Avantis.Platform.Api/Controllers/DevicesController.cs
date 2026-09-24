using System.Text.Json;
using Avantis.Contracts.Devices;
using Avantis.Platform.Core.Entities;
using Avantis.Platform.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Avantis.Platform.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class DevicesController : ControllerBase
{
    private readonly AvantisDbContext _db;
    private readonly ILogger<DevicesController> _logger;

    public DevicesController(AvantisDbContext db, ILogger<DevicesController> logger)
    {
        _db = db;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetDevices([FromQuery] string? status = null, [FromQuery] string? search = null)
    {
        var query = _db.Devices.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(d => d.HealthStatus.ToUpper() == status.ToUpper());
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            string s = search.ToLower();
            query = query.Where(d => d.Hostname.ToLower().Contains(s) ||
                                     d.Model.ToLower().Contains(s) ||
                                     d.SerialNumber.ToLower().Contains(s));
        }

        var devices = await query.OrderByDescending(d => d.LastSeenUtc).ToListAsync();

        var summaries = devices.Select(d => new DeviceSummaryDto(
            d.Id,
            d.TenantId,
            d.Hostname,
            d.Model,
            d.Manufacturer,
            d.SerialNumber,
            d.ChassisType,
            d.OsVersion,
            d.AgentVersion,
            d.HealthStatus,
            d.HealthScore,
            d.LastSeenUtc,
            (DateTime.UtcNow - d.LastSeenUtc).TotalMinutes < 5
        )).ToList();

        return Ok(new { success = true, count = summaries.Count, devices = summaries });
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetDeviceById(string id)
    {
        var device = await _db.Devices
            .Include(d => d.Alerts.Where(a => a.Status == "ACTIVE"))
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == id || d.SerialNumber == id);

        if (device == null)
        {
            return NotFound(new { success = false, message = $"Device with ID or Serial Number '{id}' not found." });
        }

        Dictionary<string, object>? specs = null;
        if (!string.IsNullOrWhiteSpace(device.SpecsJson))
        {
            try { specs = JsonSerializer.Deserialize<Dictionary<string, object>>(device.SpecsJson); } catch { }
        }

        var detail = new DeviceDetailDto(
            device.Id,
            device.TenantId,
            device.Hostname,
            device.Model,
            device.Manufacturer,
            device.SerialNumber,
            device.ChassisType,
            device.OsVersion,
            device.AgentVersion,
            device.HealthStatus,
            device.HealthScore,
            device.LastSeenUtc,
            (DateTime.UtcNow - device.LastSeenUtc).TotalMinutes < 5,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            specs
        );

        return Ok(new { success = true, device = detail });
    }

    [HttpPost("register")]
    public async Task<IActionResult> RegisterDevice([FromBody] DeviceRegistrationRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.SerialNumber))
        {
            return BadRequest(new { success = false, message = "SerialNumber is required." });
        }

        var tenantId = req.TenantId ?? Guid.Parse("11111111-1111-1111-1111-111111111111");
        var orgId = req.OrganizationId ?? Guid.Parse("22222222-2222-2222-2222-222222222222");
        var siteId = req.SiteId ?? Guid.Parse("33333333-3333-3333-3333-333333333333");

        var existing = await _db.Devices.FirstOrDefaultAsync(d => d.Id == req.SerialNumber || d.SerialNumber == req.SerialNumber);
        if (existing == null)
        {
            existing = new Device
            {
                Id = req.SerialNumber,
                TenantId = tenantId,
                SiteId = siteId,
                Hostname = req.Hostname,
                Model = req.Model,
                Manufacturer = req.Manufacturer,
                SerialNumber = req.SerialNumber,
                ChassisType = req.ChassisType,
                OsVersion = req.OsVersion,
                AgentVersion = req.AgentVersion,
                HealthStatus = "HEALTHY",
                HealthScore = 100,
                LastSeenUtc = DateTime.UtcNow,
                IsOnline = true
            };
            _db.Devices.Add(existing);
        }
        else
        {
            existing.Hostname = req.Hostname;
            existing.Model = req.Model;
            existing.OsVersion = req.OsVersion;
            existing.AgentVersion = req.AgentVersion;
            existing.LastSeenUtc = DateTime.UtcNow;
            existing.IsOnline = true;
        }

        await _db.SaveChangesAsync();

        string deviceToken = "AVT-TOK-" + Guid.NewGuid().ToString("N");

        var response = new DeviceRegistrationResponse(
            existing.Id,
            tenantId,
            orgId,
            siteId,
            deviceToken,
            30,
            "ENROLLED",
            DateTime.UtcNow
        );

        _logger.LogInformation("Enrolled device {Id} ({Model}) under tenant {Tenant}", existing.Id, existing.Model, tenantId);
        return Ok(response);
    }
}
