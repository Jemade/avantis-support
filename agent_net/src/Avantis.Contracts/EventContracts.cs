namespace Avantis.Contracts.Events;

public enum EventSeverity
{
    Informational = 0,
    Warning = 1,
    Error = 2,
    Critical = 3
}

public record AvantisEvent(
    Guid EventId,
    string EventType,
    string DeviceId,
    Guid TenantId,
    DateTime TimestampUtc,
    EventSeverity Severity,
    string Source,
    Guid? CorrelationId,
    Guid? CausationId,
    string Summary,
    Dictionary<string, object>? Payload = null,
    string? AgentVersion = null
);
