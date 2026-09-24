using System.Management;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using Avantis.Agent.Core.Interfaces;
using Avantis.Contracts.Hardware;
using Microsoft.Extensions.Logging;

namespace Avantis.Agent.Hardware;

public class WindowsHardwareCollector : IHardwareCollector
{
    private readonly ILogger<WindowsHardwareCollector>? _logger;
    private HardwareSnapshot? _cachedSnapshot;
    private DateTime _lastFetchUtc = DateTime.MinValue;
    private readonly TimeSpan _cacheTtl = TimeSpan.FromSeconds(10);

    // Win32 API for high-precision, low-overhead CPU usage without spawning PowerShell
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetSystemTimes(out SystemTime idleTime, out SystemTime kernelTime, out SystemTime userTime);

    [StructLayout(LayoutKind.Sequential)]
    private struct SystemTime
    {
        public uint LowDateTime;
        public uint HighDateTime;

        public ulong ToULong() => ((ulong)HighDateTime << 32) | LowDateTime;
    }

    private ulong _prevIdle;
    private ulong _prevKernel;
    private ulong _prevUser;
    private bool _hasPrevTimes;

    public WindowsHardwareCollector(ILogger<WindowsHardwareCollector>? logger = null)
    {
        _logger = logger;
        InitCpuTimes();
    }

    private void InitCpuTimes()
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            if (GetSystemTimes(out var idle, out var kernel, out var user))
            {
                _prevIdle = idle.ToULong();
                _prevKernel = kernel.ToULong();
                _prevUser = user.ToULong();
                _hasPrevTimes = true;
            }
        }
    }

    public async Task<HardwareSnapshot> CollectHardwareSnapshotAsync(bool forceLive = false, CancellationToken ct = default)
    {
        if (!forceLive && _cachedSnapshot != null && (DateTime.UtcNow - _lastFetchUtc) < _cacheTtl)
        {
            return _cachedSnapshot;
        }

        var systemTask = GetSystemIdentityAsync(ct);
        var cpuTask = GetCpuInfoAsync(ct);
        var memTask = GetMemoryInfoAsync(ct);
        var diskTask = GetPhysicalDisksAsync(ct);
        var volTask = GetLogicalVolumesAsync(ct);
        var batTask = GetBatteryInfoAsync(ct);
        var gpuTask = GetGpuInfoAsync(ct);
        var netTask = GetNetworkSummaryAsync(ct);

        await Task.WhenAll(systemTask, cpuTask, memTask, diskTask, volTask, batTask, gpuTask, netTask);

        _cachedSnapshot = new HardwareSnapshot(
            await systemTask,
            await cpuTask,
            await memTask,
            await diskTask,
            await volTask,
            await batTask,
            await gpuTask,
            await netTask,
            DateTime.UtcNow
        );
        _lastFetchUtc = DateTime.UtcNow;

        return _cachedSnapshot;
    }

    public Task<SystemIdentity> GetSystemIdentityAsync(CancellationToken ct = default)
    {
        string hostname = Environment.MachineName;
        string model = "Avantis PC";
        string manufacturer = "Avantis";
        string serialNumber = hostname;
        string chassisType = "Desktop";
        string osVersion = RuntimeInformation.OSDescription;
        string biosVersion = "1.0.0";
        bool hasTouch = false;
        bool hasPen = false;

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT Model, Manufacturer FROM Win32_ComputerSystem");
                foreach (ManagementObject obj in searcher.Get())
                {
                    var m = obj["Model"]?.ToString()?.Trim();
                    var mf = obj["Manufacturer"]?.ToString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(m) && !m.Contains("O.E.M.", StringComparison.OrdinalIgnoreCase)) model = m;
                    if (!string.IsNullOrWhiteSpace(mf) && !mf.Contains("O.E.M.", StringComparison.OrdinalIgnoreCase)) manufacturer = mf;
                }
            }
            catch { }

            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT SerialNumber, Version FROM Win32_BIOS");
                foreach (ManagementObject obj in searcher.Get())
                {
                    var s = obj["SerialNumber"]?.ToString()?.Trim();
                    var v = obj["Version"]?.ToString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(s) && !s.Contains("O.E.M.", StringComparison.OrdinalIgnoreCase) && s != "None") serialNumber = s;
                    if (!string.IsNullOrWhiteSpace(v)) biosVersion = v;
                }
            }
            catch { }

            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT ChassisTypes FROM Win32_SystemEnclosure");
                foreach (ManagementObject obj in searcher.Get())
                {
                    if (obj["ChassisTypes"] is ushort[] types && types.Length > 0)
                    {
                        var code = types[0];
                        if (code is 8 or 9 or 10 or 11 or 12 or 14 or 31 or 32) chassisType = "Laptop";
                        else if (code is 13 or 30) chassisType = code == 13 ? "All-in-One" : "Tablet";
                        else if (code is 3 or 4 or 5 or 6 or 7 or 15 or 16) chassisType = "Desktop";
                    }
                }
            }
            catch { }

            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT Name FROM Win32_PnPEntity WHERE Status = 'OK'");
                foreach (ManagementObject obj in searcher.Get())
                {
                    var name = obj["Name"]?.ToString() ?? "";
                    if (name.Contains("Touch Screen", StringComparison.OrdinalIgnoreCase) ||
                        name.Contains("Digitizer", StringComparison.OrdinalIgnoreCase) ||
                        name.Contains("Multi-Touch", StringComparison.OrdinalIgnoreCase))
                    {
                        hasTouch = true;
                    }
                    if (name.Contains("Stylus", StringComparison.OrdinalIgnoreCase) ||
                        name.Contains("Wacom Pen", StringComparison.OrdinalIgnoreCase))
                    {
                        hasPen = true;
                    }
                }
            }
            catch { }
        }

        return Task.FromResult(new SystemIdentity(hostname, model, manufacturer, serialNumber, chassisType, osVersion, biosVersion, hasTouch, hasPen));
    }

    public async Task<CpuInfo> GetCpuInfoAsync(CancellationToken ct = default)
    {
        string model = "Processor";
        string manufacturer = "Genuine";
        int cores = Environment.ProcessorCount;
        int threads = Environment.ProcessorCount;
        double? maxGhz = null;
        double? tempC = null;
        bool isDirectSensor = false;
        string sensorStatus = "Not available on this device";

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed FROM Win32_Processor");
                foreach (ManagementObject obj in searcher.Get())
                {
                    model = obj["Name"]?.ToString()?.Trim() ?? model;
                    manufacturer = obj["Manufacturer"]?.ToString()?.Trim() ?? manufacturer;
                    if (int.TryParse(obj["NumberOfCores"]?.ToString(), out var c)) cores = c;
                    if (int.TryParse(obj["NumberOfLogicalProcessors"]?.ToString(), out var t)) threads = t;
                    if (double.TryParse(obj["MaxClockSpeed"]?.ToString(), out var spd)) maxGhz = Math.Round(spd / 1000.0, 2);
                }
            }
            catch { }

            // ACPI Thermal Zone (returns tenths of Kelvin)
            try
            {
                using var searcher = new ManagementObjectSearcher(@"root\wmi", "SELECT CurrentTemperature FROM MSAcpi_ThermalZoneTemperature");
                foreach (ManagementObject obj in searcher.Get())
                {
                    if (double.TryParse(obj["CurrentTemperature"]?.ToString(), out var kelvinTenths) && kelvinTenths > 2732)
                    {
                        var c = Math.Round((kelvinTenths - 2732) / 10.0, 1);
                        if (c is > 0 and < 130)
                        {
                            tempC = c;
                            isDirectSensor = true;
                            sensorStatus = "Active (Direct ACPI Sensor)";
                            break;
                        }
                    }
                }
            }
            catch { }
        }

        double util = await GetCpuUtilizationInternalAsync();

        return new CpuInfo(model, manufacturer, cores, threads, maxGhz, util, tempC, isDirectSensor, sensorStatus);
    }

    private Task<double> GetCpuUtilizationInternalAsync()
    {
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return Task.FromResult(15.0);
        }

        if (!_hasPrevTimes || !GetSystemTimes(out var idle, out var kernel, out var user))
        {
            return Task.FromResult(0.0);
        }

        var idleUl = idle.ToULong();
        var kernelUl = kernel.ToULong();
        var userUl = user.ToULong();

        var usrDelta = userUl - _prevUser;
        var kerDelta = kernelUl - _prevKernel;
        var idlDelta = idleUl - _prevIdle;

        var total = usrDelta + kerDelta;
        _prevIdle = idleUl;
        _prevKernel = kernelUl;
        _prevUser = userUl;

        if (total == 0) return Task.FromResult(0.0);
        var diff = total - idlDelta;
        double pct = Math.Clamp(Math.Round((double)diff / total * 100.0, 1), 0.0, 100.0);
        return Task.FromResult(pct);
    }

    public Task<MemoryInfo> GetMemoryInfoAsync(CancellationToken ct = default)
    {
        double totalGb = 16.0;
        double freeGb = 8.0;
        var modules = new List<RamStickInfo>();

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT TotalVisibleMemorySize, FreePhysicalMemory FROM Win32_OperatingSystem");
                foreach (ManagementObject obj in searcher.Get())
                {
                    if (double.TryParse(obj["TotalVisibleMemorySize"]?.ToString(), out var totKb))
                        totalGb = Math.Round(totKb / (1024.0 * 1024.0), 1);
                    if (double.TryParse(obj["FreePhysicalMemory"]?.ToString(), out var frKb))
                        freeGb = Math.Round(frKb / (1024.0 * 1024.0), 1);
                }
            }
            catch { }

            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT Capacity, Speed, DeviceLocator, Manufacturer FROM Win32_PhysicalMemory");
                foreach (ManagementObject obj in searcher.Get())
                {
                    var loc = obj["DeviceLocator"]?.ToString() ?? "Slot";
                    var mf = obj["Manufacturer"]?.ToString()?.Trim();
                    double capGb = 8.0;
                    int? spd = null;
                    if (double.TryParse(obj["Capacity"]?.ToString(), out var capBytes))
                        capGb = Math.Round(capBytes / (1024.0 * 1024.0 * 1024.0), 1);
                    if (int.TryParse(obj["Speed"]?.ToString(), out var s)) spd = s;

                    modules.Add(new RamStickInfo(loc, capGb, spd, mf));
                }
            }
            catch { }
        }

        double usedGb = Math.Max(0, Math.Round(totalGb - freeGb, 1));
        int utilPct = totalGb > 0 ? (int)Math.Round((usedGb / totalGb) * 100) : 0;

        return Task.FromResult(new MemoryInfo(totalGb, freeGb, usedGb, utilPct, modules));
    }

    public Task<List<PhysicalDiskInfo>> GetPhysicalDisksAsync(CancellationToken ct = default)
    {
        var disks = new List<PhysicalDiskInfo>();

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            var smartFailures = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                using var searcher = new ManagementObjectSearcher(@"root\wmi", "SELECT InstanceName, PredictFailure FROM MSStorageDriver_FailurePredictStatus");
                foreach (ManagementObject obj in searcher.Get())
                {
                    if (bool.TryParse(obj["PredictFailure"]?.ToString(), out var fail) && fail)
                    {
                        var inst = obj["InstanceName"]?.ToString() ?? "";
                        smartFailures.Add(inst);
                    }
                }
            }
            catch { }

            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT DeviceID, Model, Size, InterfaceType, MediaType, Status FROM Win32_DiskDrive");
                foreach (ManagementObject obj in searcher.Get())
                {
                    var devId = obj["DeviceID"]?.ToString() ?? "";
                    var model = obj["Model"]?.ToString()?.Trim() ?? "Storage Disk";
                    var ifType = obj["InterfaceType"]?.ToString()?.ToUpperInvariant() ?? "";
                    var status = obj["Status"]?.ToString() ?? "OK";
                    double? sizeGb = null;
                    if (double.TryParse(obj["Size"]?.ToString(), out var sz)) sizeGb = Math.Round(sz / (1024.0 * 1024.0 * 1024.0), 1);

                    string driveType = "SSD";
                    if (model.Contains("NVME", StringComparison.OrdinalIgnoreCase) || ifType.Contains("NVME") || devId.Contains("NVME", StringComparison.OrdinalIgnoreCase))
                    {
                        driveType = "NVMe SSD";
                    }
                    else if (ifType.Contains("IDE") || model.Contains("HDD", StringComparison.OrdinalIgnoreCase))
                    {
                        driveType = "HDD";
                    }

                    bool predictFail = smartFailures.Any(f => f.Contains(model, StringComparison.OrdinalIgnoreCase));
                    string smartStatus = predictFail ? "PREDICTIVE_FAILURE" : (status == "OK" ? "PASSED" : status);

                    disks.Add(new PhysicalDiskInfo(devId, model, sizeGb, driveType, ifType, status, smartStatus, predictFail, 0));
                }
            }
            catch { }
        }

        return Task.FromResult(disks);
    }

    public Task<List<LogicalVolumeInfo>> GetLogicalVolumesAsync(CancellationToken ct = default)
    {
        var volumes = new List<LogicalVolumeInfo>();

        try
        {
            foreach (var drive in DriveInfo.GetDrives())
            {
                if (!drive.IsReady || drive.DriveType != DriveType.Fixed) continue;
                double totalGb = Math.Round(drive.TotalSize / (1024.0 * 1024.0 * 1024.0), 1);
                double freeGb = Math.Round(drive.AvailableFreeSpace / (1024.0 * 1024.0 * 1024.0), 1);
                double usedGb = Math.Max(0, Math.Round(totalGb - freeGb, 1));
                int usedPct = totalGb > 0 ? (int)Math.Round((usedGb / totalGb) * 100) : 0;

                volumes.Add(new LogicalVolumeInfo(drive.Name.TrimEnd('\\'), drive.DriveFormat, totalGb, freeGb, usedGb, usedPct));
            }
        }
        catch { }

        return Task.FromResult(volumes);
    }

    public Task<BatteryInfo> GetBatteryInfoAsync(CancellationToken ct = default)
    {
        bool isPresent = false;
        bool isAc = true;
        int? chargePct = null;
        string chargingState = "AC Mains Power (Desktop / PSU)";
        int? designCap = null;
        int? fullCap = null;
        int? wearPct = null;
        string health = "NOT_APPLICABLE";

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT EstimatedChargeRemaining, BatteryStatus, DesignCapacity, FullChargeCapacity FROM Win32_Battery");
                foreach (ManagementObject obj in searcher.Get())
                {
                    isPresent = true;
                    if (int.TryParse(obj["EstimatedChargeRemaining"]?.ToString(), out var chg)) chargePct = chg;
                    if (int.TryParse(obj["DesignCapacity"]?.ToString(), out var dc)) designCap = dc;
                    if (int.TryParse(obj["FullChargeCapacity"]?.ToString(), out var fc)) fullCap = fc;
                    if (int.TryParse(obj["BatteryStatus"]?.ToString(), out var st))
                    {
                        isAc = st is 2 or 6 or 7 or 8; // Charging or AC connected
                        chargingState = st == 2 ? "Charging" : (isAc ? "Plugged in, not charging" : "Discharging on Battery");
                    }

                    if (designCap.HasValue && fullCap.HasValue && designCap.Value > 0)
                    {
                        wearPct = Math.Clamp(100 - (int)Math.Round(((double)fullCap.Value / designCap.Value) * 100), 0, 100);
                        health = wearPct.Value > 40 ? "CRITICAL" : (wearPct.Value > 25 ? "DEGRADED" : "GOOD");
                    }
                    break;
                }
            }
            catch { }
        }

        return Task.FromResult(new BatteryInfo(isPresent, isAc, chargePct, chargingState, designCap, fullCap, wearPct, health));
    }

    public Task<List<GpuInfo>> GetGpuInfoAsync(CancellationToken ct = default)
    {
        var gpus = new List<GpuInfo>();

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT Name, AdapterRAM, DriverVersion FROM Win32_VideoController");
                foreach (ManagementObject obj in searcher.Get())
                {
                    var name = obj["Name"]?.ToString()?.Trim() ?? "Graphics Adapter";
                    var drv = obj["DriverVersion"]?.ToString();
                    double? vramGb = null;
                    if (double.TryParse(obj["AdapterRAM"]?.ToString(), out var ramBytes) && ramBytes > 0)
                    {
                        vramGb = Math.Round(ramBytes / (1024.0 * 1024.0 * 1024.0), 1);
                    }

                    bool isDedicated = (vramGb.HasValue && vramGb.Value >= 1.0) ||
                                       name.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase) ||
                                       name.Contains("GEFORCE", StringComparison.OrdinalIgnoreCase) ||
                                       name.Contains("RTX", StringComparison.OrdinalIgnoreCase) ||
                                       name.Contains("RADEON RX", StringComparison.OrdinalIgnoreCase) ||
                                       name.Contains("ARC", StringComparison.OrdinalIgnoreCase);

                    gpus.Add(new GpuInfo(name, vramGb, drv, isDedicated, isDedicated ? "Dedicated GPU" : "Integrated GPU"));
                }
            }
            catch { }
        }

        return Task.FromResult(gpus);
    }

    public async Task<NetworkSummary> GetNetworkSummaryAsync(CancellationToken ct = default)
    {
        string? primaryAdapter = null;
        string? primaryIp = null;
        string? mac = null;
        string? gateway = null;
        double? gwLatency = null;
        double? dnsLatency = null;
        double? packetLoss = 0.0;
        bool internet = false;

        try
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up ||
                    nic.NetworkInterfaceType == NetworkInterfaceType.Loopback ||
                    nic.NetworkInterfaceType == NetworkInterfaceType.Tunnel) continue;

                var ipProps = nic.GetIPProperties();
                var gw = ipProps.GatewayAddresses.FirstOrDefault()?.Address.ToString();
                var unicast = ipProps.UnicastAddresses.FirstOrDefault(a => a.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork);

                if (unicast != null)
                {
                    primaryAdapter = nic.Name;
                    primaryIp = unicast.Address.ToString();
                    mac = string.Join(":", nic.GetPhysicalAddress().GetAddressBytes().Select(b => b.ToString("X2")));
                    gateway = gw;
                    break;
                }
            }

            using var ping = new Ping();
            if (!string.IsNullOrWhiteSpace(gateway))
            {
                try
                {
                    var reply = await ping.SendPingAsync(gateway, 1000);
                    if (reply.Status == IPStatus.Success) gwLatency = reply.RoundtripTime;
                }
                catch { }
            }

            try
            {
                var reply = await ping.SendPingAsync("8.8.8.8", 1500);
                if (reply.Status == IPStatus.Success)
                {
                    dnsLatency = reply.RoundtripTime;
                    internet = true;
                }
            }
            catch { }
        }
        catch { }

        return new NetworkSummary(primaryAdapter, primaryIp, mac, gateway, gwLatency, dnsLatency, packetLoss, internet);
    }
}
