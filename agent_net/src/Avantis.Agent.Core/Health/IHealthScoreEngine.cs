using Avantis.Contracts.Alerts;
using Avantis.Contracts.Hardware;

namespace Avantis.Agent.Core.Health;

public record HealthEvaluation(
    int OverallScore,
    string Status, // "HEALTHY", "WARNING", "CRITICAL"
    List<AlertDto> Alerts,
    Dictionary<string, int> CategoryScores
);

public interface IHealthScoreEngine
{
    HealthEvaluation Evaluate(HardwareSnapshot snapshot, Guid tenantId);
}
