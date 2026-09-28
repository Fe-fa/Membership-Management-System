using System.Security.Cryptography;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClubManagement.Services.Identity;

public interface IEmailVerificationService
{
    Task EnsureSchemaAsync(CancellationToken cancellationToken);
    /// <summary>Stores a new code and emails it. Returns the code only when SMTP did not send.</summary>
    Task<string?> SendCodeAsync(UserAccount user, string email, CancellationToken cancellationToken);
    Task VerifyCodeAsync(string email, string code, CancellationToken cancellationToken);
}

public class EmailVerificationService : IEmailVerificationService
{
    public const int CodeLifetimeMinutes = 15;

    private readonly ApplicationModuleDbContext _db;
    private readonly IEmailSender _email;
    private readonly SmtpOptions _smtp;

    public EmailVerificationService(
        ApplicationModuleDbContext db,
        IEmailSender email,
        IOptions<SmtpOptions> smtp)
    {
        _db = db;
        _email = email;
        _smtp = smtp.Value;
    }

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.User_account', N'email_verification_code_hash') IS NULL
    ALTER TABLE dbo.[User_account] ADD email_verification_code_hash NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.User_account', N'email_verification_expires_at') IS NULL
    ALTER TABLE dbo.[User_account] ADD email_verification_expires_at DATETIME2 NULL;
IF COL_LENGTH(N'dbo.MApplication', N'manager_stage_pending') IS NULL
    ALTER TABLE dbo.MApplication ADD manager_stage_pending BIT NOT NULL CONSTRAINT DF_mapp_manager_pending DEFAULT(0);
IF COL_LENGTH(N'dbo.MApplication', N'manager_stage_pending_note') IS NULL
    ALTER TABLE dbo.MApplication ADD manager_stage_pending_note NVARCHAR(500) NULL;
IF COL_LENGTH(N'dbo.MApplication', N'manager_stage_pending_at') IS NULL
    ALTER TABLE dbo.MApplication ADD manager_stage_pending_at DATETIME2 NULL;
IF OBJECT_ID(N'dbo.Club_event', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Club_event (
        club_event_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        title NVARCHAR(200) NOT NULL,
        location NVARCHAR(200) NULL,
        description NVARCHAR(2000) NULL,
        starts_at DATETIME2 NOT NULL,
        ends_at DATETIME2 NULL,
        is_published BIT NOT NULL CONSTRAINT DF_club_event_published DEFAULT(1),
        created_at DATETIME2 NOT NULL,
        created_by_user_id BIGINT NULL
    );
END
");
        cancellationToken.ThrowIfCancellationRequested();
    }

    public async Task<string?> SendCodeAsync(UserAccount user, string email, CancellationToken cancellationToken)
    {
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        user.EmailVerificationCodeHash = BCrypt.Net.BCrypt.HashPassword(code);
        user.EmailVerificationExpiresAt = DateTime.UtcNow.AddMinutes(CodeLifetimeMinutes);
        await _db.SaveChangesAsync(cancellationToken);

        var sent = await _email.SendAsync(
            email,
            "Aero Club of East Africa — email verification code",
            $"Your Aero Club verification code is {code}. It expires in {CodeLifetimeMinutes} minutes.\n\nIf you did not create an account, you can ignore this email.",
            cancellationToken);

        return sent ? null : code;
    }

    public async Task VerifyCodeAsync(string email, string code, CancellationToken cancellationToken)
    {
        var needle = (email ?? "").Trim().ToLowerInvariant();
        var digits = new string((code ?? "").Where(char.IsDigit).ToArray());
        if (string.IsNullOrWhiteSpace(needle) || digits.Length != 6)
            throw new InvalidOperationException("Enter the 6-digit code sent to your email.");

        var user = await _db.UserAccounts
            .Include(x => x.Profile)
            .FirstOrDefaultAsync(
                x => x.Profile.Email != null && x.Profile.Email.ToLower() == needle,
                cancellationToken)
            ?? throw new InvalidOperationException("We could not find an account for that email.");

        if (user.EmailVerifiedAt is not null && !string.Equals(user.AccountStatus, "UNVERIFIED", StringComparison.OrdinalIgnoreCase))
            return;

        if (string.IsNullOrWhiteSpace(user.EmailVerificationCodeHash) || user.EmailVerificationExpiresAt is null)
            throw new InvalidOperationException("Request a new verification code.");
        if (user.EmailVerificationExpiresAt < DateTime.UtcNow)
            throw new InvalidOperationException("That code has expired. Request a new one.");
        if (!BCrypt.Net.BCrypt.Verify(digits, user.EmailVerificationCodeHash))
            throw new InvalidOperationException("That code does not match. Check the email and try again.");

        user.EmailVerifiedAt = DateTime.UtcNow;
        user.AccountStatus = "ACTIVE";
        user.IsActive = true;
        user.EmailVerificationCodeHash = null;
        user.EmailVerificationExpiresAt = null;
        await _db.SaveChangesAsync(cancellationToken);
    }
}
