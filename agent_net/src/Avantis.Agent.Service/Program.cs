using Avantis.Agent.Core.Configuration;
using Avantis.Agent.Core.Health;
using Avantis.Agent.Core.Interfaces;
using Avantis.Agent.Diagnostics;
using Avantis.Agent.Hardware;
using Avantis.Agent.Remediation;
using Avantis.Agent.Service;
using Avantis.Agent.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = Host.CreateApplicationBuilder(args);

// Enable running as a Windows Service
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "AvantisAgentService";
});

// Options
builder.Services.Configure<AgentOptions>(builder.Configuration.GetSection(AgentOptions.SectionName));
builder.Services.Configure<ThresholdOptions>(builder.Configuration.GetSection("Thresholds"));

// Core & Hardware
builder.Services.AddSingleton<IHardwareCollector, WindowsHardwareCollector>();
builder.Services.AddSingleton<IHealthScoreEngine, HealthScoreEngine>();

// Storage
builder.Services.AddSingleton<IAgentStorage, SqliteAgentDatabase>();

// Diagnostics Framework
builder.Services.AddSingleton<IDiagnostic, CpuDiagnostic>();
builder.Services.AddSingleton<IDiagnostic, MemoryDiagnostic>();
builder.Services.AddSingleton<IDiagnostic, StorageDiagnostic>();
builder.Services.AddSingleton<IDiagnostic, BatteryDiagnostic>();
builder.Services.AddSingleton<IDiagnostic, NetworkDiagnostic>();
builder.Services.AddSingleton<IDiagnostic, SecurityDiagnostic>();
builder.Services.AddSingleton<IDiagnosticExecutor, DiagnosticExecutor>();

// Remediation Engine
builder.Services.AddSingleton<IRemediation, DiskSweepRemediation>();
builder.Services.AddSingleton<IRemediation, DnsFlushRemediation>();
builder.Services.AddSingleton<IRemediation, NetworkResetRemediation>();
builder.Services.AddSingleton<IRemediationExecutor, RemediationExecutor>();

// IPC & Cloud Transmitter
builder.Services.AddHttpClient<AgentTransmitter>();
builder.Services.AddSingleton<LocalIpcServer>();

// Hosted Worker
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
