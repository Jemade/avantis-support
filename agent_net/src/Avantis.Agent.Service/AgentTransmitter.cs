using System.Net.Http.Json;
using Avantis.Agent.Core.Configuration;
using Avantis.Agent.Core.Interfaces;
using Avantis.Agent.Storage;
using Avantis.Contracts.Devices;
using Avantis.Contracts.Hardware;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Avantis.Agent.Service;

public class AgentTransmitter
{
    private readonly HttpClient _httpClient;
    private readonly IAgentStorage _storage;
    private readonly AgentOptions _options;
    private readonly ILogger<AgentTransmitter> _logger;
    private bool _isEnrolled;
    private string _deviceId = string.Empty;

    public AgentTransmitter(
        HttpClient httpClient,
        IAgentStorage storage,
        IOptions<AgentOptions> options,
        ILogger<AgentTransmitter> logger)
    {
        _httpClient = httpClient;
        _storage = storage;
        _options = options.Value;
        _logger = logger;
    }

    public async Task EnsureEnrolledAsync(SystemIdentity identity, CancellationToken ct = default)
    {
        if (_isEnrolled) return;

        _deviceId = identity.SerialNumber;
        if (string.IsNullOrWhiteSpace(_deviceId)) _deviceId = identity.Hostname;

        string? cachedToken = await _storage.GetStateAsync("device_token", ct);
        if (!string.IsNullOrWhiteSpace(cachedToken))
        {
            _isEnrolled = true;
            _options.DeviceToken = cachedToken;
            _logger.LogInformation("Loaded existing device enrollment token for {DeviceId}", _deviceId);
            return;
        }

        try
        {
            var req = new DeviceRegistrationRequest(
                identity.Hostname,
                identity.ChassisType,
                identity.Model,
                identity.Manufacturer,
                _deviceId,
                identity.OsVersion,
                "2.0.0-net8",
                _options.EnrollmentToken,
                _options.TenantId,
                _options.OrganizationId,
                _options.SiteId
            );

            string url = $"{_options.BackendUrl.TrimEnd('/')}/api/v1/devices/register";
            var resp = await _httpClient.PostAsJsonAsync(url, req, ct);

            if (resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadFromJsonAsync<DeviceRegistrationResponse>(cancellationToken: ct);
                if (body != null)
                {
                    _isEnrolled = true;
                    _options.DeviceToken = body.DeviceToken;
                    await _storage.SetStateAsync("device_token", body.DeviceToken, ct);
                    _logger.LogInformation("Device {DeviceId} registered successfully with Central Cloud Platform", _deviceId);
                }
            }
            else
            {
                _logger.LogWarning("Central cloud enrollment returned status {Status}. Telemetry will spool locally to SQLite.", resp.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Central cloud is offline ({Msg}). Telemetry will spool locally to SQLite.", ex.Message);
        }
    }

    public async Task TransmitQueuedTelemetryAsync(CancellationToken ct = default)
    {
        var pending = await _storage.PeekPendingTelemetryAsync(10, ct);
        if (pending.Count == 0) return;

        string url = $"{_options.BackendUrl.TrimEnd('/')}/api/v1/telemetry/ingest";

        foreach (var batch in pending)
        {
            try
            {
                var resp = await _httpClient.PostAsJsonAsync(url, batch, ct);
                if (resp.IsSuccessStatusCode)
                {
                    await _storage.AcknowledgeTelemetryAsync(batch.BatchId, ct);
                    _logger.LogDebug("Acknowledged telemetry batch {BatchId} from local SQLite queue", batch.BatchId);
                }
                else
                {
                    _logger.LogWarning("Backend rejected telemetry batch: HTTP {Code}", resp.StatusCode);
                    break;
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug("Cloud transmitter network offline: {Msg}", ex.Message);
                break; // Stop transmission loop until next cycle
            }
        }
    }
}
