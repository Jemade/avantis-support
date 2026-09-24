using Avantis.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Configure port
builder.WebHost.UseUrls("http://0.0.0.0:9141");

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "Avantis Assist Enterprise Cloud API", Version = "v1" });
});

// Tenant Provider
builder.Services.AddSingleton<ITenantProvider, DefaultTenantProvider>();

// Database configuration: PostgreSQL with graceful SQLite fallback
string? dbUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
string pgConn = dbUrl ?? builder.Configuration.GetConnectionString("PostgreSQL") ?? "Host=localhost;Port=5432;Database=avantis_db;Username=postgres;Password=postgres";

bool usePostgres = false;
try
{
    // Quick test if pg connection string is active
    if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("DATABASE_URL")))
    {
        usePostgres = true;
    }
}
catch { }

builder.Services.AddDbContext<AvantisDbContext>((sp, options) =>
{
    if (usePostgres)
    {
        options.UseNpgsql(pgConn);
    }
    else
    {
        string appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string dbPath = Path.Combine(appData, "AvantisAssist", "platform.db");
        Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);
        options.UseSqlite($"Data Source={dbPath}");
    }
});

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", p =>
    {
        p.AllowAnyOrigin()
         .AllowAnyHeader()
         .AllowAnyMethod();
    });
});

var app = builder.Build();

// Migrate and seed database
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AvantisDbContext>();
    await db.Database.EnsureCreatedAsync();
    await db.EnsureSeededAsync();
}

app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "Avantis Assist API v1");
});

app.UseCors("AllowAll");
app.UseAuthorization();
app.MapControllers();

app.Run();
