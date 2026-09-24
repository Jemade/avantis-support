using Avantis.Contracts.Hardware;

namespace Avantis.Agent.Core.Interfaces;

public interface IHardwareCollector
{
    Task<HardwareSnapshot> CollectHardwareSnapshotAsync(bool forceLive = false, CancellationToken ct = default);
    Task<CpuInfo> GetCpuInfoAsync(CancellationToken ct = default);
    Task<MemoryInfo> GetMemoryInfoAsync(CancellationToken ct = default);
    Task<List<PhysicalDiskInfo>> GetPhysicalDisksAsync(CancellationToken ct = default);
    Task<List<LogicalVolumeInfo>> GetLogicalVolumesAsync(CancellationToken ct = default);
    Task<BatteryInfo> GetBatteryInfoAsync(CancellationToken ct = default);
    Task<List<GpuInfo>> GetGpuInfoAsync(CancellationToken ct = default);
    Task<NetworkSummary> GetNetworkSummaryAsync(CancellationToken ct = default);
    Task<SystemIdentity> GetSystemIdentityAsync(CancellationToken ct = default);
}
