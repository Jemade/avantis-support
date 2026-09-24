using Avantis.Platform.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Avantis.Platform.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class AnalyticsController : ControllerBase
{
    private readonly AvantisDbContext _db;

    public AnalyticsController(AvantisDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetAnalytics()
    {
        var devices = await _db.Devices.AsNoTracking().ToListAsync();
        var activeAlertsCount = await _db.Alerts.CountAsync(a => a.Status == "ACTIVE");
        var openTicketsCount = await _db.SupportTickets.CountAsync(t => t.Status != "RESOLVED" && t.Status != "CLOSED");

        int total = devices.Count;
        int healthy = devices.Count(d => d.HealthStatus == "HEALTHY");
        int warning = devices.Count(d => d.HealthStatus == "WARNING");
        int critical = devices.Count(d => d.HealthStatus == "CRITICAL");
        int online = devices.Count(d => (DateTime.UtcNow - d.LastSeenUtc).TotalMinutes < 5);

        double avgScore = devices.Count > 0 ? Math.Round(devices.Average(d => d.HealthScore ?? 100), 1) : 100.0;

        var chassisDist = devices
            .GroupBy(d => d.ChassisType)
            .ToDictionary(g => g.Key, g => g.Count());

        var modelDist = devices
            .GroupBy(d => d.Model)
            .ToDictionary(g => g.Key, g => g.Count());

        var summary = new
        {
            success = true,
            totalDevices = total,
            onlineDevices = online,
            offlineDevices = total - online,
            healthyDevices = healthy,
            warningDevices = warning,
            criticalDevices = critical,
            averageHealthScore = avgScore,
            activeAlerts = activeAlertsCount,
            openTickets = openTicketsCount,
            chassisDistribution = chassisDist,
            modelDistribution = modelDist,
            generatedAt = DateTime.UtcNow
        };

        return Ok(summary);
    }
}
