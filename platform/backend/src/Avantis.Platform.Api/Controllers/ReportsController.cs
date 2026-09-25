using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace Avantis.Platform.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class ReportsController : ControllerBase
{
    private readonly ILogger<ReportsController> _logger;
    private readonly string _reportsDir;

    public ReportsController(ILogger<ReportsController> logger, IConfiguration config)
    {
        _logger = logger;
        
        // Find reports directory by walking up from current directory or app domain
        string current = Directory.GetCurrentDirectory();
        string candidate = Path.Combine(current, "reports");
        if (!Directory.Exists(candidate))
        {
            candidate = Path.Combine(current, "../../../../reports");
        }
        if (!Directory.Exists(candidate))
        {
            candidate = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "../../../../../../reports");
        }

        _reportsDir = Path.GetFullPath(candidate);
        if (!Directory.Exists(_reportsDir))
        {
            Directory.CreateDirectory(_reportsDir);
        }
    }

    [HttpGet]
    public async Task<IActionResult> GetReports()
    {
        try
        {
            if (!Directory.Exists(_reportsDir))
            {
                return Ok(new { success = true, count = 0, reports = Array.Empty<object>() });
            }

            var files = Directory.GetFiles(_reportsDir, "*.json");
            var reports = new List<object>();

            foreach (var file in files)
            {
                try
                {
                    string content = await System.IO.File.ReadAllTextAsync(file);
                    using var doc = JsonDocument.Parse(content);
                    var root = doc.RootElement.Clone();
                    reports.Add(root);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to parse report file {File}", file);
                }
            }

            return Ok(new { success = true, count = reports.Count, reports });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching reports");
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpGet("{filename}")]
    public async Task<IActionResult> GetReportByFilename(string filename)
    {
        try
        {
            if (!filename.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            {
                filename += ".json";
            }

            string safeFilename = Path.GetFileName(filename);
            string filePath = Path.Combine(_reportsDir, safeFilename);

            if (!System.IO.File.Exists(filePath))
            {
                return NotFound(new { success = false, message = "Report file not found" });
            }

            string content = await System.IO.File.ReadAllTextAsync(filePath);
            return Content(content, "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reading report file {File}", filename);
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<IActionResult> SaveReport([FromBody] JsonElement reportData)
    {
        try
        {
            string id = "AVANTIS_" + DateTime.UtcNow.ToString("yyyy-MM-ddTHH-mm-ss-fffZ");
            string filename = $"{id}.json";
            string filePath = Path.Combine(_reportsDir, filename);

            string json = JsonSerializer.Serialize(reportData, new JsonSerializerOptions { WriteIndented = true });
            await System.IO.File.WriteAllTextAsync(filePath, json);

            return Ok(new { success = true, reportId = id, filename });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving report");
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }
}
