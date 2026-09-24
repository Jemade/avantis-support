using System.Text.Json;
using Avantis.Agent.Core.Configuration;
using Avantis.Contracts.Diagnostics;
using Avantis.Contracts.Events;
using Avantis.Contracts.Telemetry;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Avantis.Agent.Storage;

public interface IAgentStorage
{
    Task InitializeAsync(CancellationToken ct = default);
    Task EnqueueTelemetryAsync(TelemetryBatch batch, CancellationToken ct = default);
    Task<List<TelemetryBatch>> PeekPendingTelemetryAsync(int limit = 10, CancellationToken ct = default);
    Task AcknowledgeTelemetryAsync(Guid batchId, CancellationToken ct = default);
    Task SaveEventAsync(AvantisEvent evt, CancellationToken ct = default);
    Task<List<AvantisEvent>> GetRecentEventsAsync(int limit = 50, CancellationToken ct = default);
    Task SaveDiagnosticRunAsync(DiagnosticProfileExecutionResult run, CancellationToken ct = default);
    Task<List<DiagnosticProfileExecutionResult>> GetDiagnosticHistoryAsync(int limit = 20, CancellationToken ct = default);
    Task SetStateAsync(string key, string value, CancellationToken ct = default);
    Task<string?> GetStateAsync(string key, CancellationToken ct = default);
}

public class SqliteAgentDatabase : IAgentStorage
{
    private readonly string _connectionString;
    private readonly ILogger<SqliteAgentDatabase>? _logger;

    public SqliteAgentDatabase(IOptions<AgentOptions> options, ILogger<SqliteAgentDatabase>? logger = null)
    {
        _logger = logger;
        string dbPath = options.Value.LocalDatabasePath;
        if (string.IsNullOrWhiteSpace(dbPath))
        {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string dir = Path.Combine(appData, "AvantisAssist");
            Directory.CreateDirectory(dir);
            dbPath = Path.Combine(dir, "agent.db");
        }

        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = dbPath,
            Mode = SqliteOpenMode.ReadWriteCreate
        }.ToString();
    }

    public async Task InitializeAsync(CancellationToken ct = default)
    {
        using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS telemetry_queue (
                batch_id TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL,
                retry_count INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'QUEUED'
            );

            CREATE TABLE IF NOT EXISTS events_store (
                event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                severity TEXT NOT NULL,
                payload TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS diagnostic_history (
                execution_id TEXT PRIMARY KEY,
                profile_name TEXT NOT NULL,
                started_at TEXT NOT NULL,
                status TEXT NOT NULL,
                health_score INTEGER NOT NULL,
                results_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_kv (
                key TEXT PRIMARY KEY,
                val TEXT NOT NULL
            );
        ";
        await cmd.ExecuteNonQueryAsync(ct);
        _logger?.LogInformation("Avantis Agent SQLite database initialized successfully.");
    }

    public async Task EnqueueTelemetryAsync(TelemetryBatch batch, CancellationToken ct = default)
    {
        using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO telemetry_queue (batch_id, payload, created_at, retry_count, status)
            VALUES (@batchId, @payload, @createdAt, 0, 'QUEUED')
            ON CONFLICT(batch_id) DO NOTHING;
        ";
        cmd.Parameters.AddWithValue("@batchId", batch.BatchId.ToString());
        cmd.Parameters.AddWithValue("@payload", JsonSerializer.Serialize(batch));
        cmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow.ToString("O"));

        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<List<TelemetryBatch>> PeekPendingTelemetryAsync(int limit = 10, CancellationToken ct = default)
    {
        using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT batch_id, payload FROM telemetry_queue 
            WHERE status = 'QUEUED' 
            ORDER BY created_at ASC 
            LIMIT @limit;
        ";
        cmd.Parameters.AddWithValue("@limit", limit);

        var list = new List<TelemetryBatch>();
        using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var json = reader.GetString(1);
            var batch = JsonSerializer.Deserialize<TelemetryBatch>(json);
            if (batch != null) list.Add(batch);
        }

        return list;
    }

    public async Task AcknowledgeTelemetryAsync(Guid batchId, CancellationToken ct = default)
    {
        using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM telemetry_queue WHERE batch_id = @batchId;";
        cmd.Parameters.AddWithValue("@batchId", batchId.ToString());

        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task SaveEventAsync(AvantisEvent evt, CancellationToken ct = default)
    {
        using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO events_store (event_id, event_type, timestamp, severity, payload)
            VALUES (@id, @type, @ts, @sev, @payload)
            ON CONFLICT(event_id) DO NOTHING;
        ";
        cmd.Parameters.AddWithValue("@id", evt.EventId.ToString());
        cmd.Parameters.AddWithValue("@type", evt.EventType);
        cmd.Parameters.AddWithValue("@ts", evt.TimestampUtc.ToString("O"));
        cmd.Parameters.AddWithValue("@sev", evt.Severity.ToString());
        cmd.Parameters.AddWithValue("@payload", JsonSerializer.Serialize(evt));

        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<List<AvantisEvent>> GetRecentEventsAsync(int limit = 50, CancellationToken ct = default)
    {
        using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT payload FROM events_store ORDER BY timestamp DESC LIMIT @limit;";
        cmd.Parameters.AddWithValue("@limit", limit);

        var list = new List<AvantisEvent>();
        using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var json = reader.GetString(0);
            var evt = JsonSerializer.Deserialize<AvantisEvent>(json);
            if (evt != null) list.Add(evt);
        }

        return list;
    }

    public async Task SaveDiagnosticRunAsync(DiagnosticProfileExecutionResult run, CancellationToken ct = default)
    {
        using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO diagnostic_history (execution_id, profile_name, started_at, status, health_score, results_json)
            VALUES (@id, @pname, @st, @status, @score, @json)
            ON CONFLICT(execution_id) DO NOTHING;
        ";
        cmd.Parameters.AddWithValue("@id", run.ExecutionId.ToString());
        cmd.Parameters.AddWithValue("@pname", run.ProfileName);
        cmd.Parameters.AddWithValue("@st", run.StartedAtUtc.ToString("O"));
        cmd.Parameters.AddWithValue("@status", run.OverallStatus);
        cmd.Parameters.AddWithValue("@score", run.HealthScore);
        cmd.Parameters.AddWithValue("@json", JsonSerializer.Serialize(run));

        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<List<DiagnosticProfileExecutionResult>> GetDiagnosticHistoryAsync(int limit = 20, CancellationToken ct = default)
    {
        using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT results_json FROM diagnostic_history ORDER BY started_at DESC LIMIT @limit;";
        cmd.Parameters.AddWithValue("@limit", limit);

        var list = new List<DiagnosticProfileExecutionResult>();
        using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var json = reader.GetString(0);
            var res = JsonSerializer.Deserialize<DiagnosticProfileExecutionResult>(json);
            if (res != null) list.Add(res);
        }

        return list;
    }

    public async Task SetStateAsync(string key, string value, CancellationToken ct = default)
    {
        using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO agent_kv (key, val) VALUES (@key, @val)
            ON CONFLICT(key) DO UPDATE SET val = excluded.val;
        ";
        cmd.Parameters.AddWithValue("@key", key);
        cmd.Parameters.AddWithValue("@val", value);

        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<string?> GetStateAsync(string key, CancellationToken ct = default)
    {
        using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT val FROM agent_kv WHERE key = @key;";
        cmd.Parameters.AddWithValue("@key", key);

        var res = await cmd.ExecuteScalarAsync(ct);
        return res?.ToString();
    }
}
