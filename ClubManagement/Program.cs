using System.Text;
using ClubManagement.Auth;
using ClubManagement.Data;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.Services;
using ClubManagement.Services.Committee;
using ClubManagement.Services.Dashboard;
using ClubManagement.Services.Finance;
using ClubManagement.Services.Guests;
using ClubManagement.Services.Identity;
using ClubManagement.Services.MembershipAccount;
using ClubManagement.Services.MembershipApplication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<ApplicationWorkflowOptions>(builder.Configuration.GetSection("ApplicationWorkflow"));
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
var jwt = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? throw new InvalidOperationException("Jwt configuration is missing.");

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantContext, TenantContext>();
builder.Services.AddDbContext<ApplicationModuleDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("ClubManagement")));

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    });

builder.Services.AddOpenApi();
builder.Services.AddScoped<IProfileService, ProfileService>();
builder.Services.AddScoped<IApplicationService, ApplicationService>();
builder.Services.AddScoped<IApplicantDetailsService, ApplicantDetailsService>();
builder.Services.Configure<SmtpOptions>(builder.Configuration.GetSection(SmtpOptions.SectionName));
builder.Services.Configure<AppPublicOptions>(builder.Configuration.GetSection(AppPublicOptions.SectionName));
builder.Services.AddScoped<IEmailSender, EmailSender>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IUserManagementService, UserManagementService>();
builder.Services.AddScoped<IClubPolicyService, ClubPolicyService>();
builder.Services.AddScoped<IMemberAccountProvisioner, MemberAccountProvisioner>();
builder.Services.AddScoped<IMemberLifecycleService, MemberLifecycleService>();
builder.Services.AddScoped<IMemberProfileService, MemberProfileService>();
builder.Services.AddScoped<IMemberDashboardService, MemberDashboardService>();
builder.Services.AddScoped<IEndorsementInviteService, EndorsementInviteService>();
builder.Services.AddScoped<IManagerStageService, ManagerStageService>();
builder.Services.AddScoped<ICommitteeService, CommitteeService>();
builder.Services.AddScoped<IInterviewConductService, InterviewConductService>();
builder.Services.AddScoped<ICommitteeBallotService, CommitteeBallotService>();
builder.Services.AddScoped<ClubManagement.Services.Governance.IElectionService, ClubManagement.Services.Governance.ElectionService>();
builder.Services.AddScoped<IFinanceService, FinanceService>();
builder.Services.AddScoped<IGuestService, GuestService>();
builder.Services.AddScoped<IDashboardService, DashboardService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
            ClockSkew = TimeSpan.FromMinutes(1),
            RoleClaimType = System.Security.Claims.ClaimTypes.Role,
            NameClaimType = System.Security.Claims.ClaimTypes.Name
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Open", policy =>
    {
        // Vite frontend is on :8080; API on :5275 — allow local + LAN origins in Development.
        if (builder.Environment.IsDevelopment())
        {
            policy.SetIsOriginAllowed(origin =>
                {
                    if (string.IsNullOrWhiteSpace(origin)) return false;
                    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
                    if (uri.Host is "localhost" or "127.0.0.1" or "::1") return true;
                    // Private LAN (e.g. http://192.168.x.x:8080 from Vite Network URL)
                    if (System.Net.IPAddress.TryParse(uri.Host, out var ip))
                    {
                        var bytes = ip.GetAddressBytes();
                        if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                        {
                            return bytes[0] == 10
                                || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31)
                                || (bytes[0] == 192 && bytes[1] == 168);
                        }
                    }
                    return false;
                })
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
            return;
        }

        policy.WithOrigins(
                "http://localhost:8080", "https://localhost:8080",
                "http://localhost:8081", "https://localhost:8081",
                "http://localhost:5173", "https://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationModuleDbContext>();
    var userManagement = scope.ServiceProvider.GetRequiredService<IUserManagementService>();
    try
    {
        await userManagement.EnsureSchemaAsync(CancellationToken.None);
        await EnsureTenantSchemaAsync(db);
        var committeeService = scope.ServiceProvider.GetRequiredService<ICommitteeService>();
        await committeeService.EnsureLookupsAsync(CancellationToken.None);
        var interviewConduct = scope.ServiceProvider.GetRequiredService<IInterviewConductService>();
        await interviewConduct.EnsureStatusesAsync(CancellationToken.None);
        var ballot = scope.ServiceProvider.GetRequiredService<ICommitteeBallotService>();
        await ballot.EnsureSchemaAsync(CancellationToken.None);
        var elections = scope.ServiceProvider.GetRequiredService<ClubManagement.Services.Governance.IElectionService>();
        await elections.EnsureSchemaAsync(CancellationToken.None);
        await db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.Aplication_document', N'is_verified') IS NULL
    ALTER TABLE dbo.Aplication_document ADD is_verified BIT NOT NULL CONSTRAINT DF_appdoc_is_verified DEFAULT(0);");
        await db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.Aplication_document', N'verification_status') IS NULL
    ALTER TABLE dbo.Aplication_document ADD verification_status NVARCHAR(40) NULL;");
        await db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.Aplication_document', N'verification_notes') IS NULL
    ALTER TABLE dbo.Aplication_document ADD verification_notes NVARCHAR(500) NULL;");
        await db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.Aplication_document', N'verified_at') IS NULL
    ALTER TABLE dbo.Aplication_document ADD verified_at DATETIME2 NULL;");
        await db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.Aplication_document', N'verified_by_user_id') IS NULL
    ALTER TABLE dbo.Aplication_document ADD verified_by_user_id BIGINT NULL;");
        await db.Database.ExecuteSqlRawAsync(@"
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'uq_maccount_membership_no')
    ALTER TABLE dbo.MAccount DROP CONSTRAINT uq_maccount_membership_no;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_maccount_membership_no' AND object_id = OBJECT_ID(N'dbo.MAccount'))
    DROP INDEX uq_maccount_membership_no ON dbo.MAccount;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MAccount_TenantId_MembershipNo' AND object_id = OBJECT_ID(N'dbo.MAccount'))
    DROP INDEX IX_MAccount_TenantId_MembershipNo ON dbo.MAccount;
IF COL_LENGTH(N'dbo.MAccount', N'membership_no') IS NOT NULL
    ALTER TABLE dbo.MAccount ALTER COLUMN membership_no NVARCHAR(80) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_MAccount_membership_no_present' AND object_id = OBJECT_ID(N'dbo.MAccount'))
    CREATE UNIQUE INDEX UX_MAccount_membership_no_present
        ON dbo.MAccount(tenant_id, membership_no)
        WHERE membership_no IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM dbo.Member_status WHERE code = N'TEMPORARY')
    INSERT INTO dbo.Member_status (code, name, sort_order, is_active, is_terminal, is_active_status, created_at)
    VALUES (N'TEMPORARY', N'Temporary', 15, 1, 0, 1, SYSUTCDATETIME());
UPDATE dbo.MAccount SET membership_no = NULL
WHERE membership_no LIKE N'TM-[0-9][0-9][0-9][0-9]'
  AND membership_type_id IN (SELECT membership_type_id FROM dbo.Membership_type WHERE code = N'TEMPORARY');
UPDATE dbo.MProfile SET membership_no = NULL
WHERE membership_no LIKE N'TM-[0-9][0-9][0-9][0-9]'
  AND profile_id IN (
      SELECT profile_id FROM dbo.MAccount
      WHERE membership_no IS NULL
        AND membership_type_id IN (SELECT membership_type_id FROM dbo.Membership_type WHERE code = N'TEMPORARY')
  );");
        await db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.Member_aircraft', N'country_of_registration') IS NULL
    ALTER TABLE dbo.Member_aircraft ADD country_of_registration NVARCHAR(120) NULL;");
        await db.Database.ExecuteSqlRawAsync(@"
DECLARE @tid BIGINT = (SELECT TOP 1 tenant_id FROM dbo.Tenant WHERE code = N'ACEA');
IF @tid IS NULL SET @tid = 1;
MERGE dbo.Membership_type AS target
USING (VALUES
    (N'FULL', N'Full', 1, 1, 1, 1, 1, 1, NULL),
    (N'COUNTRY', N'Country', 2, 1, 1, 1, 1, 1, NULL),
    (N'OVERSEAS', N'Overseas', 3, 1, 0, 1, 1, 1, NULL),
    (N'LIFE', N'Life', 4, 1, 1, 1, 1, 1, NULL),
    (N'HONORARY', N'Honorary', 5, 0, 0, 0, 0, 1, NULL),
    (N'TEMPORARY', N'Temporary', 6, 0, 0, 0, 0, 0, 365),
    (N'SENIOR', N'Senior', 7, 1, 1, 1, 1, 1, NULL),
    (N'SENIOR_LIFE', N'Senior Life', 8, 1, 1, 1, 1, 1, NULL)
) AS src (code, name, sort_order, can_vote, can_run_for_office, reciprocation_allowed, can_introduce_guests, is_permanent, max_duration_days)
ON target.code = src.code AND target.tenant_id = @tid
WHEN NOT MATCHED THEN
    INSERT (code, name, sort_order, is_active, can_vote, can_run_for_office, reciprocation_allowed, can_introduce_guests, is_permanent, max_duration_days, created_at, tenant_id)
    VALUES (src.code, src.name, src.sort_order, 1, src.can_vote, src.can_run_for_office, src.reciprocation_allowed, src.can_introduce_guests, src.is_permanent, src.max_duration_days, SYSUTCDATETIME(), @tid);");
        await db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.Membership_type', N'can_access_subscriptions') IS NULL
    ALTER TABLE dbo.Membership_type ADD can_access_subscriptions BIT NOT NULL CONSTRAINT DF_mt_subs DEFAULT(1);");
        await db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.Membership_type', N'can_access_committee') IS NULL
    ALTER TABLE dbo.Membership_type ADD can_access_committee BIT NOT NULL CONSTRAINT DF_mt_committee DEFAULT(1);");
        await db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.Membership_type', N'can_access_accommodation') IS NULL
    ALTER TABLE dbo.Membership_type ADD can_access_accommodation BIT NOT NULL CONSTRAINT DF_mt_accom DEFAULT(1);");
        await db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.Membership_type', N'can_access_endorsements') IS NULL
    ALTER TABLE dbo.Membership_type ADD can_access_endorsements BIT NOT NULL CONSTRAINT DF_mt_endorse DEFAULT(1);");
        await db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.Membership_type', N'can_access_documents') IS NULL
    ALTER TABLE dbo.Membership_type ADD can_access_documents BIT NOT NULL CONSTRAINT DF_mt_docs DEFAULT(1);");
        await db.Database.ExecuteSqlRawAsync(@"
IF EXISTS (SELECT 1 FROM dbo.Membership_type WHERE code = N'TEMPORARY' AND can_access_committee = 1 AND can_access_subscriptions = 1)
BEGIN
  UPDATE dbo.Membership_type SET
    can_access_subscriptions = CASE WHEN code IN (N'HONORARY', N'TEMPORARY', N'LIFE') THEN 0 ELSE can_access_subscriptions END,
    can_access_committee = CASE WHEN code = N'TEMPORARY' THEN 0 ELSE can_access_committee END,
    can_access_accommodation = CASE WHEN code = N'TEMPORARY' THEN 0 ELSE can_access_accommodation END,
    can_access_endorsements = CASE WHEN code IN (N'HONORARY', N'TEMPORARY') THEN 0 ELSE can_access_endorsements END
  WHERE code IN (N'HONORARY', N'TEMPORARY', N'LIFE');
END");
        await db.Database.ExecuteSqlRawAsync(@"
UPDATE dbo.Application_status SET name = N'Pre-requisites', description = N'Submitted — collecting or verifying application pre-requisites.', updated_at = SYSUTCDATETIME()
WHERE code IN (N'SUBMITTED', N'Submitted');
UPDATE dbo.Application_status SET name = N'Screening', description = N'Admin is reviewing applicant details (screening).', updated_at = SYSUTCDATETIME()
WHERE code IN (N'UNDERREVIEW', N'UNDER_REVIEW', N'UnderReview');
UPDATE dbo.Application_status SET name = N'Fully approved', description = N'Application fully approved for membership.', updated_at = SYSUTCDATETIME()
WHERE code IN (N'APPROVED', N'Approved');");
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Could not add document verification columns.");
    }
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationModuleDbContext>();
    var users = scope.ServiceProvider.GetRequiredService<IUserManagementService>();
    try
    {
        await users.EnsureSchemaAsync(CancellationToken.None);
        var managerStage = scope.ServiceProvider.GetRequiredService<IManagerStageService>();
        await managerStage.EnsureSchemaAsync(CancellationToken.None);
        var committeeService = scope.ServiceProvider.GetRequiredService<ICommitteeService>();
        await committeeService.EnsureLookupsAsync(CancellationToken.None);
        var ballot = scope.ServiceProvider.GetRequiredService<ICommitteeBallotService>();
        await ballot.EnsureSchemaAsync(CancellationToken.None);
        var elections = scope.ServiceProvider.GetRequiredService<ClubManagement.Services.Governance.IElectionService>();
        await elections.EnsureSchemaAsync(CancellationToken.None);
        await db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Membership_fee_schedule', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Membership_fee_schedule (
        membership_fee_schedule_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        membership_type_id BIGINT NOT NULL,
        joining_fee DECIMAL(18,2) NOT NULL,
        joining_fee_under_30 DECIMAL(18,2) NOT NULL,
        annual_subscription DECIMAL(18,2) NOT NULL,
        effective_date DATE NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_fee_sched_active DEFAULT(1),
        created_at DATETIME2 NOT NULL,
        created_by_user_id BIGINT NULL,
        updated_by_user_id BIGINT NULL
    );
END");
        await DevelopmentSeeder.SeedAsync(db);
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Database seed skipped — start SQL Server and apply the optimize script if tables are missing.");
    }
}
else
{
    app.UseHttpsRedirection();
}

app.UseCors("Open");
app.UseStaticFiles();
app.UseAuthentication();
app.UseMiddleware<TenantResolutionMiddleware>();
app.UseAuthorization();
app.MapControllers();
app.Run();

static async Task EnsureTenantSchemaAsync(ApplicationModuleDbContext db)
{
    await db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Tenant', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Tenant (
        tenant_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        code NVARCHAR(40) NOT NULL,
        name NVARCHAR(200) NOT NULL,
        short_name NVARCHAR(80) NULL,
        contact_email NVARCHAR(200) NULL,
        contact_phone NVARCHAR(40) NULL,
        address_line NVARCHAR(400) NULL,
        is_active BIT NOT NULL CONSTRAINT DF_tenant_active DEFAULT(1),
        created_at DATETIME2 NOT NULL,
        CONSTRAINT UQ_tenant_code UNIQUE (code)
    );
END");
    await db.Database.ExecuteSqlRawAsync(@"
IF NOT EXISTS (SELECT 1 FROM dbo.Tenant WHERE code = N'ACEA')
INSERT INTO dbo.Tenant (code, name, short_name, contact_email, contact_phone, address_line, is_active, created_at)
VALUES (N'ACEA', N'Aero Club of East Africa', N'ACEA', N'info@aeroclubea.com', N'+254 111 053 220',
        N'P.O. Box 40813, 00100 Wilson Airport, Nairobi, Kenya', 1, SYSUTCDATETIME());");

    foreach (var table in new[]
             {
                 "User_account", "MProfile", "MAccount", "MApplication", "Membership_type", "Club_setting",
                 "Committee"
             })
    {
        await db.Database.ExecuteSqlRawAsync($@"
IF COL_LENGTH(N'dbo.{table}', N'tenant_id') IS NULL
    ALTER TABLE dbo.[{table}] ADD tenant_id BIGINT NULL;");
        await db.Database.ExecuteSqlRawAsync($@"
UPDATE dbo.[{table}] SET tenant_id = (SELECT TOP 1 tenant_id FROM dbo.Tenant WHERE code = N'ACEA')
WHERE tenant_id IS NULL;");
        await db.Database.ExecuteSqlRawAsync($@"
IF COL_LENGTH(N'dbo.{table}', N'tenant_id') IS NOT NULL
   AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{table}') AND name = N'tenant_id' AND is_nullable = 1)
    ALTER TABLE dbo.[{table}] ALTER COLUMN tenant_id BIGINT NOT NULL;");
    }
}
