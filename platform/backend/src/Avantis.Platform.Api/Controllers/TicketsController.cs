using System.Text.Json;
using Avantis.Contracts.Support;
using Avantis.Platform.Core.Entities;
using Avantis.Platform.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Avantis.Platform.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class TicketsController : ControllerBase
{
    private readonly AvantisDbContext _db;

    public TicketsController(AvantisDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetTickets([FromQuery] string? status = null)
    {
        var query = _db.SupportTickets.Include(t => t.Device).AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(t => t.Status.ToUpper() == status.ToUpper());
        }

        var tickets = await query.OrderByDescending(t => t.CreatedAtUtc).ToListAsync();

        return Ok(new { success = true, count = tickets.Count, tickets });
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetTicketById(string id)
    {
        var ticket = await _db.SupportTickets
            .Include(t => t.Device)
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == id);

        if (ticket == null) return NotFound(new { success = false, message = "Ticket not found" });

        return Ok(new { success = true, ticket });
    }

    [HttpPost]
    public async Task<IActionResult> CreateTicket([FromBody] CreateTicketRequest req)
    {
        string ticketId = "AVT-TCK-" + Random.Shared.Next(100000, 999999);
        var tenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        var ticket = new SupportTicket
        {
            Id = ticketId,
            DeviceId = req.DeviceId,
            TenantId = tenantId,
            Title = req.IssueDescription.Length > 60 ? req.IssueDescription[..60] + "..." : req.IssueDescription,
            Description = req.IssueDescription,
            Severity = req.Priority,
            Status = "NEW",
            CustomerName = req.CustomerName,
            CustomerEmail = req.CustomerEmail,
            DiagnosticSnapshotJson = req.DiagnosticSnapshot != null ? JsonSerializer.Serialize(req.DiagnosticSnapshot) : null,
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.SupportTickets.Add(ticket);
        await _db.SaveChangesAsync();

        return Ok(new { success = true, ticketId = ticket.Id, message = "Ticket created successfully" });
    }

    [HttpPatch("{id}/status")]
    public async Task<IActionResult> UpdateTicketStatus(string id, [FromBody] UpdateTicketStatusRequest req)
    {
        var ticket = await _db.SupportTickets.FindAsync(id);
        if (ticket == null) return NotFound(new { success = false, message = "Ticket not found" });

        ticket.Status = req.Status.ToUpper();
        if (ticket.Status is "RESOLVED" or "CLOSED")
        {
            ticket.ResolvedAtUtc = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync();

        return Ok(new { success = true, message = "Ticket status updated", ticket });
    }
}

public record UpdateTicketStatusRequest(string Status);
