using System.Net;
using System.Text;
using System.Text.Json;
using Avantis.Agent.Core.Configuration;
using Avantis.Agent.Core.Health;
using Avantis.Agent.Core.Interfaces;
using Avantis.Agent.Diagnostics;
using Avantis.Agent.Remediation;
using Avantis.Agent.Storage;
using Avantis.Contracts.Devices;
using Avantis.Contracts.Diagnostics;
using Avantis.Contracts.Remediation;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Avantis.Agent.Service;

public class LocalIpcServer
{
    private readonly IHardwareCollector _hardwareCollector;
    private readonly IHealthScoreEngine _healthScoreEngine;
    private readonly IDiagnosticExecutor _diagnosticExecutor;
    private readonly IRemediationExecutor _remediationExecutor;
    private readonly IAgentStorage _storage;
    private readonly AgentOptions _options;
    private readonly ILogger<LocalIpcServer> _logger;
    private HttpListener? _httpListener;
    private CancellationTokenSource? _cts;

    // Scan progress tracking
    private DiagnosticProfileExecutionResult? _latestResult;
    private bool _isScanning;
    private string _currentStepName = "Idle";
    private int _currentStepIndex;
    private int _totalSteps = 5;

    public LocalIpcServer(
        IHardwareCollector hardwareCollector,
        IHealthScoreEngine healthScoreEngine,
        IDiagnosticExecutor diagnosticExecutor,
        IRemediationExecutor remediationExecutor,
        IAgentStorage storage,
        IOptions<AgentOptions> options,
        ILogger<LocalIpcServer> logger)
    {
        _hardwareCollector = hardwareCollector;
        _healthScoreEngine = healthScoreEngine;
        _diagnosticExecutor = diagnosticExecutor;
        _remediationExecutor = remediationExecutor;
        _storage = storage;
        _options = options.Value;
        _logger = logger;
    }

    public void Start()
    {
        _cts = new CancellationTokenSource();
        int port = _options.LocalHttpPort > 0 ? _options.LocalHttpPort : 9140;

        try
        {
            _httpListener = new HttpListener();
            _httpListener.Prefixes.Add($"http://localhost:{port}/");
            _httpListener.Prefixes.Add($"http://127.0.0.1:{port}/");
            _httpListener.Start();
            _logger.LogInformation("Avantis Agent Local IPC Bridge listening on http://localhost:{Port}/", port);

            _ = Task.Run(() => ListenLoopAsync(_cts.Token));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not bind HTTP listener to port {Port}. Named Pipe IPC will remain active.", port);
        }
    }

    public void Stop()
    {
        _cts?.Cancel();
        try
        {
            _httpListener?.Stop();
            _httpListener?.Close();
        }
        catch { }
    }

    private async Task ListenLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _httpListener != null && _httpListener.IsListening)
        {
            try
            {
                var context = await _httpListener.GetContextAsync();
                _ = Task.Run(() => HandleRequestAsync(context, ct), ct);
            }
            catch (HttpListenerException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogDebug("HTTP IPC listener exception: {Msg}", ex.Message);
            }
        }
    }

    private async Task HandleRequestAsync(HttpListenerContext ctx, CancellationToken ct)
    {
        var req = ctx.Request;
        var res = ctx.Response;

        // CORS headers
        res.AddHeader("Access-Control-Allow-Origin", "*");
        res.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Device-Id");

        if (req.HttpMethod == "OPTIONS")
        {
            res.StatusCode = 204;
            res.Close();
            return;
        }

        string path = req.Url?.AbsolutePath.ToLowerInvariant() ?? "/";

        try
        {
            switch (path)
            {
                case "/api/status":
                {
                    var snapshot = await _hardwareCollector.CollectHardwareSnapshotAsync(false, ct);
                    var eval = _healthScoreEngine.Evaluate(snapshot, _options.TenantId);

                    var responseObj = new
                    {
                        success = true,
                        deviceId = snapshot.System.SerialNumber,
                        hostname = snapshot.System.Hostname,
                        model = snapshot.System.Model,
                        manufacturer = snapshot.System.Manufacturer,
                        chassisType = snapshot.System.ChassisType,
                        osVersion = snapshot.System.OsVersion,
                        agentVersion = "2.0.0-net8",
                        healthScore = eval.OverallScore,
                        healthStatus = eval.Status,
                        alerts = eval.Alerts,
                        categoryScores = eval.CategoryScores,
                        cpu = new
                        {
                            model = snapshot.Cpu.Model,
                            cores = snapshot.Cpu.PhysicalCores,
                            threads = snapshot.Cpu.LogicalProcessors,
                            loadPercent = snapshot.Cpu.CurrentUtilizationPercent,
                            temperatureC = snapshot.Cpu.TemperatureCelsius,
                            isDirectSensor = snapshot.Cpu.IsDirectHardwareSensor,
                            sensorStatus = snapshot.Cpu.SensorStatus
                        },
                        memory = new
                        {
                            totalPhysicalGB = snapshot.Memory.TotalPhysicalGb,
                            availableGB = snapshot.Memory.AvailableGb,
                            usedGB = snapshot.Memory.UsedGb,
                            usedPercent = snapshot.Memory.UtilizationPercent,
                            stickCount = snapshot.Memory.Modules.Count
                        },
                        storage = snapshot.Volumes.FirstOrDefault(v => v.MountPoint.StartsWith("C", StringComparison.OrdinalIgnoreCase)) ?? snapshot.Volumes.FirstOrDefault(),
                        disks = snapshot.Disks,
                        battery = snapshot.Battery,
                        gpus = snapshot.Gpus,
                        network = snapshot.Network,
                        timestamp = DateTime.UtcNow
                    };
                    await WriteJsonResponseAsync(res, responseObj);
                    break;
                }

                case "/api/orchestrator/start":
                case "/api/scan":
                {
                    if (_isScanning)
                    {
                        await WriteJsonResponseAsync(res, new { success = false, message = "Diagnostic scan is already in progress." });
                        return;
                    }

                    _isScanning = true;
                    _currentStepIndex = 1;
                    _currentStepName = "Hardware Baseline Scan";

                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            var snapshot = await _hardwareCollector.CollectHardwareSnapshotAsync(true, ct);
                            var diagCtx = new DiagnosticContext(snapshot, _options.TenantId, snapshot.System.SerialNumber, true);
                            
                            _currentStepIndex = 2;
                            _currentStepName = "Security Shields Check";
                            await Task.Delay(500, ct);

                            _currentStepIndex = 3;
                            _currentStepName = "Storage Integrity Check";
                            await Task.Delay(500, ct);

                            _currentStepIndex = 4;
                            _currentStepName = "Network Latency Analysis";
                            await Task.Delay(500, ct);

                            _currentStepIndex = 5;
                            _currentStepName = "Synthesizing Diagnostic Results";
                            _latestResult = await _diagnosticExecutor.RunProfileAsync("FullHealthScan", diagCtx, ct);
                            await _storage.SaveDiagnosticRunAsync(_latestResult, ct);
                        }
                        finally
                        {
                            _isScanning = false;
                            _currentStepName = "Completed";
                        }
                    }, ct);

                    await WriteJsonResponseAsync(res, new { success = true, message = "Full Diagnostic Scan started successfully." });
                    break;
                }

                case "/api/orchestrator/progress":
                {
                    var progressObj = new
                    {
                        isRunning = _isScanning,
                        stepIndex = _currentStepIndex,
                        totalSteps = _totalSteps,
                        currentStepName = _currentStepName,
                        percent = _isScanning ? (int)Math.Round((double)_currentStepIndex / _totalSteps * 100) : 100,
                        overallStatus = _latestResult?.OverallStatus ?? "IDLE",
                        healthScore = _latestResult?.HealthScore ?? 100,
                        outcome = _latestResult?.OutcomeMetrics ?? new Dictionary<string, object>()
                    };
                    await WriteJsonResponseAsync(res, progressObj);
                    break;
                }

                case "/api/cleanup/run":
                {
                    var snapshot = await _hardwareCollector.CollectHardwareSnapshotAsync(false, ct);
                    var reqRem = new RemediationRequest("cleanup.disk_sweep", snapshot.System.SerialNumber, _options.TenantId, "LocalUser", RiskLevel.Low);
                    var exec = await _remediationExecutor.ExecuteActionAsync(reqRem, ct);
                    await WriteJsonResponseAsync(res, exec);
                    break;
                }

                case "/api/network/optimize":
                {
                    var snapshot = await _hardwareCollector.CollectHardwareSnapshotAsync(false, ct);
                    var reqRem = new RemediationRequest("network.optimize", snapshot.System.SerialNumber, _options.TenantId, "LocalUser", RiskLevel.Medium);
                    var exec = await _remediationExecutor.ExecuteActionAsync(reqRem, ct);
                    await WriteJsonResponseAsync(res, exec);
                    break;
                }

                case "/api/reports":
                {
                    var reports = await _storage.GetDiagnosticHistoryAsync(20, ct);
                    await WriteJsonResponseAsync(res, new { success = true, count = reports.Count, reports });
                    break;
                }

                case "/api/events":
                {
                    var evts = await _storage.GetRecentEventsAsync(50, ct);
                    await WriteJsonResponseAsync(res, new { success = true, count = evts.Count, events = evts });
                    break;
                }

                default:
                {
                    res.StatusCode = 404;
                    await WriteJsonResponseAsync(res, new { success = false, message = $"Endpoint {path} not found" });
                    break;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "IPC handling error on {Path}", path);
            res.StatusCode = 500;
            await WriteJsonResponseAsync(res, new { success = false, message = ex.Message });
        }
        finally
        {
            try { res.Close(); } catch { }
        }
    }

    private static async Task WriteJsonResponseAsync(HttpListenerResponse res, object data)
    {
        res.ContentType = "application/json";
        byte[] bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(data, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
        res.ContentLength64 = bytes.Length;
        await res.OutputStream.WriteAsync(bytes);
    }
}
