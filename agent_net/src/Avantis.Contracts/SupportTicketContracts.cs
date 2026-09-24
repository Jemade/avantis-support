namespace Avantis.Contracts.Support;

public record SupportTicketDto(
    string TicketId,
    string DeviceId,
    Guid TenantId,
    string Title,
    string Description,
    string Severity, // "LOW", "MEDIUM", "HIGH", "CRITICAL"
    string Status,   // "NEW", "ACKNOWLEDGED", "INVESTIGATING", "WAITING_USER", "RESOLVED", "CLOSED"
    string CustomerName,
    string CustomerEmail,
    string? AssignedTechnician,
    Dictionary<string, object>? DiagnosticSnapshot,
    List<string> RecommendedActions,
    DateTime CreatedAtUtc,
    DateTime? ResolvedAtUtc
);

public record CreateTicketRequest(
    string DeviceId,
    string CustomerName,
    string CustomerEmail,
    string IssueDescription,
    string Priority,
    Dictionary<string, object>? DiagnosticSnapshot = null
);
