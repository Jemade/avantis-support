using Avantis.Platform.Core.Entities;
using Avantis.Platform.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Avantis.Platform.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class AlertsController : ControllerBase
{
    private readonly AvantisDbContext _db;

    public AlertsController(AvantisDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetAlerts([FromQuery] string? status = "ACTIVE")
    {
        var query = _db.Alerts.Include(a => a.Device).AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(a => a.Status.ToUpper() == status.ToUpper());
        }

        var alerts = await query.OrderByDescending(a => a.DetectedAtUtc).ToListAsync();

        var list = alerts.Select(a => new
        {
            alertId = a.Id,
            deviceId = a.DeviceId,
            deviceModel = a.Device?.Model ?? "Unknown Model",
            hostname = a.Device?.Hostname ?? "Unknown Host",
            component = a.Component,
            severity = a.Severity,
            title = a.Title,
            message = a.Message,
            metric = a.Metric,
            risk = a.Risk,
            status = a.Status,
            detectedAt = a.DetectedAtUtc
        });

        return Ok(new { success = true, count = alerts.Count, alerts = list });
    }

    [HttpPost("{id}/resolve")]
    public async Task<IActionResult> ResolveAlert(Guid id)
    {
        var alert = await _db.Alerts.FindAsync(id);
        if (alert == null) return NotFound(new { success = false, message = "Alert not found" });

        alert.Status = "RESOLVED";
        alert.ResolvedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, message = "Alert marked as resolved" });
    }
}
