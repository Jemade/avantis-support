using Avantis.Contracts.Diagnostics;
using Avantis.Contracts.Hardware;

namespace Avantis.Agent.Diagnostics;

public record DiagnosticContext(
    HardwareSnapshot Snapshot,
    Guid TenantId,
    string DeviceId,
    bool ForceLive = false
);

public interface IDiagnostic
{
    string Id { get; }
    string Name { get; }
    DiagnosticCategory Category { get; }
    Task<DiagnosticResult> ExecuteAsync(DiagnosticContext context, CancellationToken ct = default);
}

public interface IDiagnosticExecutor
{
    Task<DiagnosticProfileExecutionResult> RunProfileAsync(string profileName, DiagnosticContext context, CancellationToken ct = default);
}
