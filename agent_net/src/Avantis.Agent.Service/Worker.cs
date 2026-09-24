using Avantis.Agent.Core.Configuration;
using Avantis.Agent.Core.Health;
using Avantis.Agent.Core.Interfaces;
using Avantis.Agent.Storage;
using Avantis.Contracts.Telemetry;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Avantis.Agent.Service;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly IHardwareCollector _hardwareCollector;
    private readonly IHealthScoreEngine _healthScoreEngine;
    private readonly IAgentStorage _storage;
    private readonly AgentTransmitter _transmitter;
    private readonly LocalIpcServer _ipcServer;
    private readonly AgentOptions _options;

    public Worker(
        ILogger<Worker> logger,
        IHardwareCollector hardwareCollector,
        IHealthScoreEngine healthScoreEngine,
        IAgentStorage storage,
        AgentTransmitter transmitter,
        LocalIpcServer ipcServer,
        IOptions<AgentOptions> options)
    {
        _logger = logger;
        _hardwareCollector = hardwareCollector;
        _healthScoreEngine = healthScoreEngine;
        _storage = storage;
        _transmitter = transmitter;
        _ipcServer = ipcServer;
        _options = options.Value;
    }

    public override async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("=================================================");
        _logger.LogInformation("   AVANTIS ASSIST ENTERPRISE AGENT (C# .NET 8)   ");
        _logger.LogInformation("=================================================");

        await _storage.InitializeAsync(cancellationToken);
        _ipcServer.Start();

        await base.StartAsync(cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // 1. Initial Identity and Registration
        var identity = await _hardwareCollector.GetSystemIdentityAsync(stoppingToken);
        _logger.LogInformation("Host identified: {Model} (Chassis: {Chassis}, SN: {Serial})", identity.Model, identity.ChassisType, identity.SerialNumber);

        await _transmitter.EnsureEnrolledAsync(identity, stoppingToken);

        int sampleIntervalSec = _options.TelemetryIntervalSeconds > 0 ? _options.TelemetryIntervalSeconds : 30;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Collect fresh telemetry
                var snapshot = await _hardwareCollector.CollectHardwareSnapshotAsync(false, stoppingToken);
                var eval = _healthScoreEngine.Evaluate(snapshot, _options.TenantId);

                _logger.LogInformation("Health Status: {Status} (Score: {Score}/100, CPU: {Cpu:F0}%, RAM: {Ram}%, Alerts: {Alerts})",
                    eval.Status, eval.OverallScore, snapshot.Cpu.CurrentUtilizationPercent ?? 0, snapshot.Memory.UtilizationPercent, eval.Alerts.Count);

                var primaryVol = snapshot.Volumes.FirstOrDefault(v => v.MountPoint.StartsWith("C", StringComparison.OrdinalIgnoreCase)) ?? snapshot.Volumes.FirstOrDefault();

                var perfSample = new PerformanceSample(
                    DateTime.UtcNow,
                    snapshot.Cpu.CurrentUtilizationPercent ?? 0.0,
                    snapshot.Cpu.TemperatureCelsius,
                    snapshot.Memory.UtilizationPercent,
                    snapshot.Memory.UsedGb,
                    primaryVol?.UsedPercent ?? 0.0,
                    primaryVol?.FreeGb ?? 0.0,
                    snapshot.Disks.FirstOrDefault()?.SmartStatus,
                    snapshot.Battery.ChargePercent,
                    snapshot.Battery.WearPercent,
                    snapshot.Network.GatewayLatencyMs,
                    null,
                    null
                );

                var batch = new TelemetryBatch(
                    Guid.NewGuid(),
                    identity.SerialNumber,
                    _options.TenantId,
                    DateTime.UtcNow,
                    new List<PerformanceSample> { perfSample },
                    snapshot
                );

                // Commit to local SQLite queue
                await _storage.EnqueueTelemetryAsync(batch, stoppingToken);

                // Transmit pending queue to cloud
                await _transmitter.TransmitQueuedTelemetryAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Telemetry loop exception");
            }

            await Task.Delay(TimeSpan.FromSeconds(sampleIntervalSec), stoppingToken);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Stopping Avantis Agent Service...");
        _ipcServer.Stop();
        await base.StopAsync(cancellationToken);
    }
}
