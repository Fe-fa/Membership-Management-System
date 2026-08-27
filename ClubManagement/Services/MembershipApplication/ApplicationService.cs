using System.Text.Json;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.MembershipApplication;
using ClubManagement.Entities;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.Settings;
using ClubManagement.Entities.Subscriptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClubManagement.Services.MembershipApplication;

public class ApplicationWorkflowOptions
{
    public long DraftStatusId { get; set; } = 1;
    public long SubmittedStatusId { get; set; } = 2;
    public long UnderReviewStatusId { get; set; } = 3;
    public long ApprovedStatusId { get; set; } = 4;
    public long RejectedStatusId { get; set; } = 5;
    public long WaitlistedStatusId { get; set; } = 6;
    public long ExcludedStatusId { get; set; } = 7;
}

public interface IApplicationService
{
    Task<IReadOnlyList<ApplicationListItemDto>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ApplicationListItemDto>> GetMineAsync(long applicantProfileId, CancellationToken cancellationToken = default);
    Task<ApplicationDetailDto?> GetCurrentForProfileAsync(long applicantProfileId, CancellationToken cancellationToken = default);
    Task<ApplicationDetailDto?> GetByIdAsync(long applicationId, CancellationToken cancellationToken = default);
    Task<ApplicationDetailDto> CreateDraftAsync(CreateApplicationRequest request, CancellationToken cancellationToken = default);
    Task<ApplicationDetailDto?> UpdateAsync(long applicationId, UpdateApplicationRequest request, CancellationToken cancellationToken = default);
    Task<WorkflowValidationResultDto?> ValidateBeforeSubmitAsync(long applicationId, CancellationToken cancellationToken = default);
    Task<ApplicationDetailDto?> SubmitAsync(long applicationId, SubmitApplicationRequest request, CancellationToken cancellationToken = default);
    Task<ApplicationDetailDto?> ChangeStatusAsync(long applicationId, ChangeApplicationStatusRequest request, CancellationToken cancellationToken = default);
    Task<ApplicationDetailDto?> AdvanceStageAsync(long applicationId, long? actorUserId, string? reason, CancellationToken cancellationToken = default);
    Task<ApplicationDetailDto?> StartReviewAsync(long applicationId, long? actorUserId, string? reason, CancellationToken cancellationToken = default);
    Task<ApplicationDocumentDto?> AddDocumentAsync(long applicationId, CreateApplicationDocumentRequest request, CancellationToken cancellationToken = default);
    Task<ApplicationDocumentDto?> VerifyDocumentAsync(long applicationId, long applicationDocumentId, VerifyApplicationDocumentRequest request, CancellationToken cancellationToken = default);
    Task<EndorsementDto?> AddEndorsementAsync(long applicationId, CreateEndorsementRequest request, CancellationToken cancellationToken = default);
    Task<ApplicationSignatureDto?> AddSignatureAsync(long applicationId, CreateApplicationSignatureRequest request, CancellationToken cancellationToken = default);
    Task<ApplicationApprovalDto?> AddApprovalAsync(long applicationId, CreateApplicationApprovalRequest request, CancellationToken cancellationToken = default);
    Task<InterviewDto?> AddInterviewAsync(long applicationId, CreateInterviewRequest request, CancellationToken cancellationToken = default);
    Task<ApplicationExclusionDto?> AddExclusionAsync(long applicationId, CreateApplicationExclusionRequest request, CancellationToken cancellationToken = default);
}

public class ApplicationService : IApplicationService
{
    private readonly ApplicationModuleDbContext _dbContext;
    private readonly ApplicationWorkflowOptions _workflowOptions;
    private readonly IEndorsementInviteService _endorsementInvites;
    private readonly IManagerStageService _managerStage;

    public ApplicationService(
        ApplicationModuleDbContext dbContext,
        IOptions<ApplicationWorkflowOptions> workflowOptions,
        IEndorsementInviteService endorsementInvites,
        IManagerStageService managerStage)
    {
        _dbContext = dbContext;
        _workflowOptions = workflowOptions.Value;
        _endorsementInvites = endorsementInvites;
        _managerStage = managerStage;
    }

    public async Task<IReadOnlyList<ApplicationListItemDto>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        // AsSplitQuery() avoids the (smaller, but still real) cartesian effect of
        // combining the Applicant.Country ThenInclude with the Status/ElectionType
        // Includes in a single joined statement as the table grows.
        var rows = await _dbContext.Applications
            .AsNoTracking()
            .AsSplitQuery()
            .Include(x => x.Applicant).ThenInclude(a => a.Country)
            .Include(x => x.Status)
            .Include(x => x.ElectionType)
            .Include(x => x.Endorsements)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(cancellationToken);

        var paymentByProfile = await LoadPaymentStatusByProfileAsync(cancellationToken);

        return rows.Select(x => MapListItem(x, paymentByProfile)).ToList();
    }

    public async Task<IReadOnlyList<ApplicationListItemDto>> GetMineAsync(long applicantProfileId, CancellationToken cancellationToken = default)
    {
        var rows = await _dbContext.Applications
            .AsNoTracking()
            .AsSplitQuery()
            .Include(x => x.Applicant).ThenInclude(a => a.Country)
            .Include(x => x.Status)
            .Include(x => x.ElectionType)
            .Include(x => x.Endorsements)
            .Include(x => x.ApplicationExclusions)
            .Where(x => x.ApplicantProfileId == applicantProfileId)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(cancellationToken);

        var paymentByProfile = await LoadPaymentStatusByProfileAsync(cancellationToken, applicantProfileId);
        var ids = rows.Select(r => r.ApplicationId).ToList();
        var openBallot = ids.Count == 0
            ? new HashSet<long>()
            : (await _dbContext.CommitteeBallotItems.AsNoTracking()
                .Where(b => ids.Contains(b.ApplicationId) && b.Status == "OPEN")
                .Select(b => b.ApplicationId)
                .ToListAsync(cancellationToken)).ToHashSet();

        return rows.Select(x =>
        {
            var dto = MapListItem(x, paymentByProfile);
            dto.ApplicantBallotLabel = ApplicantBallotCopy(x, openBallot.Contains(x.ApplicationId));
            dto.ExcludedUntilDate = x.ApplicationExclusions
                .Where(e => e.IsActive)
                .OrderByDescending(e => e.ExcludedUntilDate)
                .Select(e => e.ExcludedUntilDate)
                .FirstOrDefault();
            return dto;
        }).ToList();
    }

    private async Task<Dictionary<long, (string Code, string Name)>> LoadPaymentStatusByProfileAsync(
        CancellationToken cancellationToken,
        long? onlyProfileId = null)
    {
        var pending = await _dbContext.PaymentStatuses.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Code == "PENDING" || x.Code == "Pending", cancellationToken);
        var defaultCode = pending?.Code ?? "PENDING";
        var defaultName = pending?.Name ?? "Pending";

        var query = _dbContext.Transactions
            .AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Where(t => t.ProfileId != null);
        if (onlyProfileId is long profileId)
            query = query.Where(t => t.ProfileId == profileId);

        var txs = await query
            .OrderByDescending(t => t.CreatedAt)
            .ThenByDescending(t => t.TransactionId)
            .ToListAsync(cancellationToken);

        var result = new Dictionary<long, (string Code, string Name)>
        {
            // Sentinel 0 unused; callers use TryGetValue and fall back to these via helper.
        };
        foreach (var group in txs.GroupBy(t => t.ProfileId!.Value))
        {
            result[group.Key] = AggregatePaymentStatus(group, defaultCode, defaultName);
        }

        // Stash defaults under key 0 for MapListItem fallback name from Payment_status.
        result[0] = (defaultCode, defaultName);
        return result;
    }

    private static (string Code, string Name) AggregatePaymentStatus(
        IEnumerable<MTransaction> txs,
        string defaultCode,
        string defaultName)
    {
        var list = txs.Where(t => t.PaymentStatus != null).ToList();
        if (list.Count == 0)
            return (defaultCode, defaultName);

        static string Norm(string? code) => (code ?? "").Trim().ToUpperInvariant().Replace("-", "_");

        var codes = list.Select(t => Norm(t.PaymentStatus.Code)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var latest = list[0].PaymentStatus;

        if (codes.Contains("PARTIALLY_PAID"))
            return ("PARTIALLY_PAID", list.First(t => Norm(t.PaymentStatus.Code) == "PARTIALLY_PAID").PaymentStatus.Name);

        var hasPaid = codes.Contains("PAID") || codes.Contains("WAIVED");
        var hasOpen = codes.Contains("PENDING") || codes.Contains("OVERDUE");
        if (hasPaid && hasOpen)
        {
            var partial = list.FirstOrDefault(t => Norm(t.PaymentStatus.Code) == "PARTIALLY_PAID")?.PaymentStatus;
            return ("PARTIALLY_PAID", partial?.Name ?? "Partially paid");
        }

        if (codes.Contains("PAID"))
            return ("PAID", list.First(t => Norm(t.PaymentStatus.Code) == "PAID").PaymentStatus.Name);

        if (codes.Contains("WAIVED"))
            return ("WAIVED", list.First(t => Norm(t.PaymentStatus.Code) == "WAIVED").PaymentStatus.Name);

        return (Norm(latest.Code), latest.Name);
    }

    private ApplicationListItemDto MapListItem(
        MApplication x,
        Dictionary<long, (string Code, string Name)> paymentByProfile)
    {
        var applicantDateOfBirth = ResolveApplicantDateOfBirth(x);
        var statusCode = NormalizeStatusCode(x.Status?.Code);
        var sponsor = ResolveSponsorFromEndorsements(x.Endorsements);

        string paymentStatusCode;
        string paymentStatusName;
        if (paymentByProfile.TryGetValue(x.ApplicantProfileId, out var payment))
        {
            paymentStatusCode = payment.Code;
            paymentStatusName = payment.Name;
        }
        else if (paymentByProfile.TryGetValue(0, out var pendingDefault))
        {
            paymentStatusCode = pendingDefault.Code;
            paymentStatusName = pendingDefault.Name;
        }
        else
        {
            paymentStatusCode = "PENDING";
            paymentStatusName = "Pending";
        }

        return new ApplicationListItemDto
        {
            ApplicationId = x.ApplicationId,
            ReferenceNumber = $"APP-{x.ApplicationId:D4}",
            ApplicationNo = x.ApplicationNo,
            ApplicantProfileId = x.ApplicantProfileId,
            ApplicantName = BuildName(x.Applicant?.Title, x.Applicant?.FirstName, x.Applicant?.MiddleName, x.Applicant?.LastName),
            ApplicantCity = x.Applicant?.City,
            ApplicantCountry = x.Applicant?.Country?.CountryName,
            ApplicantDateOfBirth = applicantDateOfBirth,
            ApplicantAgeYears = CalculateAgeInYears(applicantDateOfBirth),
            ApplicationStatusId = x.ApplicationStatusId,
            StatusCode = statusCode,
            StatusName = x.Status?.Name,
            ElectionTypeId = x.ElectionTypeId,
            MembershipTypeName = ResolveMembershipTypeName(x.FormDataJson, x.ElectionType?.Name),
            MembershipTypeBadge = ResolveMembershipTypeBadge(x.FormDataJson, x.ElectionType?.Name),
            AppliedAt = x.SubmittedAt ?? x.CreatedAt,
            UpdatedAt = x.UpdatedAt,
            SectionsCompleted = CountCompletedSteps(x.CompletedStepsJson),
            TotalSections = 7,
            EntranceFeeAmount = x.EntranceFeeAmount,
            AnnualSubscriptionAmount = x.AnnualSubscriptionAmount,
            InterviewRequiredFlag = x.InterviewRequiredFlag,
            PaymentStatus = paymentStatusName,
            PaymentStatusCode = paymentStatusCode,
            SponsorStatus = sponsor.Name,
            SponsorStatusCode = sponsor.Code,
            SponsorCompletedAt = sponsor.CompletedAt,
            EndorsementsCompleted = sponsor.CompletedCount,
            EndorsementsRequired = sponsor.RequiredCount,
        };
    }

    private static string? ApplicantBallotCopy(MApplication x, bool ballotOpen)
    {
        var code = NormalizeStatusCode(x.Status?.Code);
        var until = x.ApplicationExclusions
            .Where(e => e.IsActive && e.ExcludedUntilDate is not null)
            .OrderByDescending(e => e.ExcludedUntilDate)
            .Select(e => e.ExcludedUntilDate)
            .FirstOrDefault();
        if (code is "NotElected" or "Rejected")
        {
            return until is DateOnly d
                ? $"Rejected — you may reapply after {d:dd MMM yyyy}"
                : "Rejected — you may reapply later per the rules";
        }
        if (code is "Committee" or "CommitteeReview")
            return "Approved — pending signatures";
        if (ballotOpen || code is "Waitlist" or "ElectionReview" or "TemporaryMember")
            return "Ballot in progress";
        return null;
    }

    /// <summary>
    /// Sponsor progress from Endorsement: latest row per role (proposer/seconder).
    /// A role counts as complete when personal, professional, or value-addition text is present.
    /// </summary>
    private static (string Code, string Name, int CompletedCount, int RequiredCount, DateTime? CompletedAt)
        ResolveSponsorFromEndorsements(IEnumerable<Endorsement> endorsements)
    {
        const int required = 2;
        var latestByRole = endorsements
            .GroupBy(e => NormalizeEndorserRole(e.EndorserRole))
            .Where(g => g.Key is "PROPOSER" or "SECONDER")
            .Select(g => g.OrderByDescending(e => e.UpdatedAt ?? e.CreatedAt)
                .ThenByDescending(e => e.EndorsementId)
                .First())
            .ToList();

        var filled = latestByRole.Where(IsEndorsementFilled).ToList();
        var completed = 0;
        if (filled.Any(e => NormalizeEndorserRole(e.EndorserRole) == "PROPOSER")) completed++;
        if (filled.Any(e => NormalizeEndorserRole(e.EndorserRole) == "SECONDER")) completed++;

        if (completed >= required)
        {
            return ("COMPLETE", "Complete", completed, required, filled.Max(e => e.UpdatedAt ?? e.CreatedAt));
        }

        if (completed == 1)
            return ("PARTIAL", "Partial", completed, required, null);

        return ("PENDING", "Pending", completed, required, null);
    }

    private static bool IsEndorsementFilled(Endorsement e) =>
        !string.IsNullOrWhiteSpace(e.PersonalKnowledge) ||
        !string.IsNullOrWhiteSpace(e.ProfessionalKnowledge) ||
        !string.IsNullOrWhiteSpace(e.ValueAddition);

    private static string NormalizeEndorserRole(string? role)
    {
        var raw = (role ?? "").Trim().ToUpperInvariant().Replace(" ", "").Replace("-", "").Replace("_", "");
        return raw switch
        {
            "PROPOSER" or "PROPOSE" => "PROPOSER",
            "SECONDER" or "SECOND" => "SECONDER",
            _ => raw,
        };
    }

    public async Task<ApplicationDetailDto?> GetCurrentForProfileAsync(long applicantProfileId, CancellationToken cancellationToken = default)
    {
        var applicationId = await _dbContext.Applications
            .AsNoTracking()
            .Where(x => x.ApplicantProfileId == applicantProfileId)
            .OrderByDescending(x => x.UpdatedAt ?? x.CreatedAt)
            .Select(x => x.ApplicationId)
            .FirstOrDefaultAsync(cancellationToken);

        if (applicationId == 0)
        {
            return null;
        }

        return await GetByIdAsync(applicationId, cancellationToken);
    }

    public async Task<ApplicationDetailDto?> GetByIdAsync(long applicationId, CancellationToken cancellationToken = default)
    {
        var entity = await LoadApplicationAsync(applicationId, cancellationToken);
        return entity is null ? null : Map(entity);
    }

    public async Task<ApplicationDetailDto> CreateDraftAsync(CreateApplicationRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new MApplication
        {
            ApplicationNo = string.IsNullOrWhiteSpace(request.ApplicationNo)
                ? GenerateApplicationNo()
                : request.ApplicationNo,
            ApplicantProfileId = request.ApplicantProfileId ?? 0,
            ApplicationFormVersionId = request.ApplicationFormVersionId,
            ElectionTypeId = request.ElectionTypeId ?? 1,
            ProposerProfileId = request.ProposerProfileId,
            SeconderProfileId = request.SeconderProfileId,
            ApplicationStatusId = request.ApplicationStatusId.GetValueOrDefault(0) == 0
                ? _workflowOptions.DraftStatusId
                : request.ApplicationStatusId.Value,
            ReceivedDate = request.ReceivedDate,
            ClubVisitsCount = request.ClubVisitsCount,
            InterviewRequiredFlag = request.InterviewRequiredFlag,
            EntranceFeeAmount = request.EntranceFeeAmount,
            AnnualSubscriptionAmount = request.AnnualSubscriptionAmount,
            SubmittedAt = request.SubmittedAt,
            FormDataJson = request.FormDataJson,
            CompletedStepsJson = request.CompletedSteps is null ? null : JsonSerializer.Serialize(request.CompletedSteps),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            CreatedByUserId = request.CreatedByUserId
        };

        _dbContext.Applications.Add(entity);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await AddStatusHistoryInternalAsync(entity.ApplicationId, null, entity.ApplicationStatusId, request.CreatedByUserId, "Draft application created.", cancellationToken);
        await WriteAuditAsync(
            "MApplication",
            entity.ApplicationId,
            "INSERT",
            null,
            $"Draft created ({entity.ApplicationNo})",
            request.CreatedByUserId,
            cancellationToken);

        var created = await LoadApplicationAsync(entity.ApplicationId, cancellationToken)
            ?? throw new InvalidOperationException("Application could not be reloaded after creation.");

        return Map(created);
    }

    public async Task<ApplicationDetailDto?> UpdateAsync(long applicationId, UpdateApplicationRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await _dbContext.Applications.FirstOrDefaultAsync(x => x.ApplicationId == applicationId, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        var before = SnapshotApplication(entity);
        var previousStatusId = entity.ApplicationStatusId;
        if (!string.IsNullOrWhiteSpace(request.ApplicationNo))
            entity.ApplicationNo = request.ApplicationNo;
        if (request.ApplicantProfileId.HasValue)
            entity.ApplicantProfileId = request.ApplicantProfileId.Value;
        if (request.ApplicationFormVersionId.HasValue)
            entity.ApplicationFormVersionId = request.ApplicationFormVersionId;
        if (request.ElectionTypeId.HasValue)
            entity.ElectionTypeId = request.ElectionTypeId.Value;
        if (request.ApplicationStatusId.HasValue)
            entity.ApplicationStatusId = request.ApplicationStatusId.Value;

        entity.ProposerProfileId = request.ProposerProfileId ?? entity.ProposerProfileId;
        entity.SeconderProfileId = request.SeconderProfileId ?? entity.SeconderProfileId;
        entity.ReceivedDate = request.ReceivedDate;
        entity.ClubVisitsCount = request.ClubVisitsCount;
        entity.InterviewRequiredFlag = request.InterviewRequiredFlag;
        entity.EntranceFeeAmount = request.EntranceFeeAmount;
        entity.AnnualSubscriptionAmount = request.AnnualSubscriptionAmount;
        entity.SubmittedAt = request.SubmittedAt;
        if (request.FormDataJson is not null)
            entity.FormDataJson = request.FormDataJson;
        if (request.CompletedSteps is not null)
            entity.CompletedStepsJson = JsonSerializer.Serialize(request.CompletedSteps);
        entity.UpdatedByUserId = request.UpdatedByUserId;
        entity.UpdatedAt = DateTime.UtcNow;

        await PruneOrphanEmptyEndorsementStubsAsync(entity, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        if (previousStatusId != entity.ApplicationStatusId)
        {
            await AddStatusHistoryInternalAsync(applicationId, previousStatusId, entity.ApplicationStatusId, request.UpdatedByUserId, "Application updated and status changed.", cancellationToken);
        }

        await WriteAuditAsync(
            "MApplication",
            applicationId,
            "UPDATE",
            before,
            SnapshotApplication(entity),
            request.UpdatedByUserId,
            cancellationToken);

        var updated = await LoadApplicationAsync(applicationId, cancellationToken);
        return updated is null ? null : Map(updated);
    }

    public async Task<WorkflowValidationResultDto?> ValidateBeforeSubmitAsync(long applicationId, CancellationToken cancellationToken = default)
    {
        var entity = await LoadApplicationAsync(applicationId, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        var result = new WorkflowValidationResultDto();

        if (entity.ApplicantProfileId <= 0)
            result.Errors.Add("Applicant profile is required.");

        if (string.IsNullOrWhiteSpace(entity.ApplicationNo))
            result.Errors.Add("Application number is required.");

        if (entity.ElectionTypeId <= 0)
            result.Errors.Add("Election type is required.");

        if (entity.ProposerProfileId is null || entity.SeconderProfileId is null)
            result.Errors.Add("Both proposer and seconder are required before submission.");

        //if (entity.ClubVisitsCount < 3)
        //    result.Errors.Add("Applicant should visit the club at least three times before joining.");

        if (!entity.AplicationDocuments.Any())
            result.Errors.Add("At least one supporting document is required.");

        // Named proposers/seconders are enough at submit. Completed Endorsement
        // statements are collected after admin authorizes the Endorsement stage.

        if (entity.InterviewRequiredFlag && !entity.Interviews.Any(x => x.ScheduledAt.HasValue || x.ConductedAt.HasValue))
            result.Errors.Add("Interview is marked as required but no interview has been scheduled or conducted.");

        if (!entity.Applicant.DataConsentGiven)
            result.Errors.Add("Applicant data consent must be captured before submission.");

        if (!entity.Applicant.PrivacyPolicyAcceptedAt.HasValue)
            result.Errors.Add("Applicant privacy policy acceptance timestamp is required.");

        //if (!entity.EntranceFeeAmount.HasValue)
        //    result.Errors.Add("Entrance fee amount should be captured before submission.");

        //if (!entity.AnnualSubscriptionAmount.HasValue)
        //    result.Errors.Add("Annual subscription amount should be captured before submission.");

        result.IsValid = result.Errors.Count == 0;
        return result;
    }

    public async Task<ApplicationDetailDto?> SubmitAsync(long applicationId, SubmitApplicationRequest request, CancellationToken cancellationToken = default)
    {
        var validation = await ValidateBeforeSubmitAsync(applicationId, cancellationToken);
        if (validation is null)
        {
            return null;
        }

        if (!validation.IsValid)
        {
            throw new InvalidOperationException(string.Join(" | ", validation.Errors));
        }

        var entity = await _dbContext.Applications.FirstAsync(x => x.ApplicationId == applicationId, cancellationToken);
        var previousStatusId = entity.ApplicationStatusId;

        entity.SubmittedAt = request.SubmittedAt ?? DateTime.UtcNow;
        entity.ApplicationStatusId = _workflowOptions.SubmittedStatusId;
        entity.UpdatedByUserId = request.ChangedByUserId;
        entity.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);
        await AddStatusHistoryInternalAsync(
            applicationId,
            previousStatusId,
            entity.ApplicationStatusId,
            request.ChangedByUserId,
            request.Reason ?? "Application submitted and is now Pre-requisites, awaiting admin screening.",
            cancellationToken);

        var updated = await LoadApplicationAsync(applicationId, cancellationToken);
        return updated is null ? null : Map(updated);
    }

    public async Task<ApplicationDetailDto?> ChangeStatusAsync(long applicationId, ChangeApplicationStatusRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await _dbContext.Applications.FirstOrDefaultAsync(x => x.ApplicationId == applicationId, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(request.StatusCode) && request.ToStatusId <= 0)
        {
            var status = await FindStatusByCodeAsync(request.StatusCode, cancellationToken)
                ?? throw new InvalidOperationException($"Application status '{request.StatusCode}' was not found.");
            request.ToStatusId = status.ApplicationStatusId;
        }

        var previousStatusId = entity.ApplicationStatusId;
        entity.ApplicationStatusId = request.ToStatusId;
        entity.UpdatedByUserId = request.ChangedByUserId;
        entity.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);
        await AddStatusHistoryInternalAsync(applicationId, previousStatusId, request.ToStatusId, request.ChangedByUserId, request.Reason, cancellationToken);

        var updated = await LoadApplicationAsync(applicationId, cancellationToken);
        return updated is null ? null : Map(updated);
    }

    public async Task<ApplicationDetailDto?> AdvanceStageAsync(
        long applicationId,
        long? actorUserId,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var entity = await _dbContext.Applications
            .Include(x => x.Status)
            .Include(x => x.Endorsements)
            .FirstOrDefaultAsync(x => x.ApplicationId == applicationId, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        var current = NormalizeStatusCode(entity.Status?.Code);
        var nextCode = NextApprovedStatus(current)
            ?? throw new InvalidOperationException(ApproveBlockedMessage(current));

        // Proposer + seconder must both endorse before leaving the endorsement stage.
        if (string.Equals(current, "EndorsementReview", StringComparison.OrdinalIgnoreCase)
            || string.Equals(nextCode, "Interview", StringComparison.OrdinalIgnoreCase))
        {
            EnsureEndorsementsComplete(entity.Endorsements);
        }

        // Before Interview: manager must have verified payments, docs, sponsors and ≥3 visits.
        if (string.Equals(nextCode, "Interview", StringComparison.OrdinalIgnoreCase))
            await _managerStage.EnsureAuthorizeToInterviewAsync(applicationId, cancellationToken);

        var moved = await TransitionToCodeAsync(
            entity,
            nextCode,
            actorUserId,
            reason ?? "Authorized after review.",
            cancellationToken);

        // Stamp Stage A history only when the manager authorize-to-interview flow runs.
        if (string.Equals(current, "EndorsementReview", StringComparison.OrdinalIgnoreCase)
            && string.Equals(nextCode, "Interview", StringComparison.OrdinalIgnoreCase)
            && IsStageAAuthorizeReason(reason))
        {
            await _managerStage.MarkStageAAuthorizedAsync(applicationId, actorUserId, cancellationToken);
        }

        if (string.Equals(nextCode, "Endorsement", StringComparison.OrdinalIgnoreCase))
            await _endorsementInvites.NotifyNamedEndorsersAsync(applicationId, cancellationToken);
        return moved;
    }

    private static bool IsStageAAuthorizeReason(string? reason)
    {
        if (string.IsNullOrWhiteSpace(reason)) return false;
        var text = reason.Trim();
        return text.Contains("verifying endorsements", StringComparison.OrdinalIgnoreCase)
            || text.Contains("Stage A", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<ApplicationDetailDto?> StartReviewAsync(
        long applicationId,
        long? actorUserId,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var entity = await _dbContext.Applications
            .Include(x => x.Status)
            .Include(x => x.Endorsements)
            .FirstOrDefaultAsync(x => x.ApplicationId == applicationId, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        var current = NormalizeStatusCode(entity.Status?.Code);
        var reviewCode = ReviewStatus(current)
            ?? throw new InvalidOperationException(ReviewBlockedMessage(current));

        // Do not open endorsement review until both named sponsors have endorsed.
        if (string.Equals(current, "Endorsement", StringComparison.OrdinalIgnoreCase))
        {
            EnsureEndorsementsComplete(entity.Endorsements);
            // Stage A — Submit to Manager: payments + required documents must be ready.
            await _managerStage.EnsureReadyForManagerAsync(applicationId, cancellationToken);
        }

        return await TransitionToCodeAsync(
            entity,
            reviewCode,
            actorUserId,
            reason ?? (string.Equals(current, "Endorsement", StringComparison.OrdinalIgnoreCase)
                ? "Submitted to manager for Stage A review."
                : "Admin started review."),
            cancellationToken);
    }

    public async Task<ApplicationDocumentDto?> AddDocumentAsync(long applicationId, CreateApplicationDocumentRequest request, CancellationToken cancellationToken = default)
    {
        if (!await _dbContext.Applications.AnyAsync(x => x.ApplicationId == applicationId, cancellationToken))
        {
            return null;
        }

        var entity = new AplicationDocument
        {
            ApplicationId = applicationId,
            DocumentTypeId = request.DocumentTypeId,
            FileName = request.FileName,
            FileUrl = request.FileUrl,
            UploadedAt = request.UploadedAt ?? DateTime.UtcNow,
            UploadedByUserId = request.UploadedByUserId,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = request.CreatedByUserId
        };

        _dbContext.ApplicationDocuments.Add(entity);
        await _dbContext.SaveChangesAsync(cancellationToken);
        await WriteAuditAsync(
            "Aplication_document",
            entity.ApplicationDocumentId,
            "INSERT",
            null,
            $"applicationId={applicationId}; typeId={entity.DocumentTypeId}; file={entity.FileName}",
            request.UploadedByUserId ?? request.CreatedByUserId,
            cancellationToken);
        try { await _managerStage.OnApplicantPrerequisitesChangedAsync(applicationId, cancellationToken); }
        catch { /* notification failures must not block uploads */ }
        return Map(entity);
    }

    public async Task<ApplicationDocumentDto?> VerifyDocumentAsync(
        long applicationId,
        long applicationDocumentId,
        VerifyApplicationDocumentRequest request,
        CancellationToken cancellationToken = default)
    {
        var entity = await _dbContext.ApplicationDocuments
            .Include(x => x.DocumentType)
            .FirstOrDefaultAsync(
                x => x.ApplicationId == applicationId && x.ApplicationDocumentId == applicationDocumentId,
                cancellationToken);
        if (entity is null)
        {
            return null;
        }

        var before = $"verified={entity.IsVerified}; status={entity.VerificationStatus}";
        entity.IsVerified = request.Verified;
        entity.VerificationStatus = request.Verified ? "Verified" : "Rejected";
        entity.VerificationNotes = request.Notes;
        entity.VerifiedAt = DateTime.UtcNow;
        entity.VerifiedByUserId = request.VerifiedByUserId;
        entity.UpdatedByUserId = request.VerifiedByUserId;
        await _dbContext.SaveChangesAsync(cancellationToken);
        await WriteAuditAsync(
            "Aplication_document",
            entity.ApplicationDocumentId,
            "VERIFY",
            before,
            $"verified={entity.IsVerified}; status={entity.VerificationStatus}; notes={entity.VerificationNotes}",
            request.VerifiedByUserId,
            cancellationToken);
        return Map(entity);
    }

    public async Task<EndorsementDto?> AddEndorsementAsync(long applicationId, CreateEndorsementRequest request, CancellationToken cancellationToken = default)
    {
        if (!await _dbContext.Applications.AnyAsync(x => x.ApplicationId == applicationId, cancellationToken))
        {
            return null;
        }

        var entity = new Endorsement
        {
            ApplicationId = applicationId,
            EndorserProfileId = request.EndorserProfileId,
            EndorserRole = request.EndorserRole,
            YearsKnownCandidate = request.YearsKnownCandidate,
            PersonalKnowledge = request.PersonalKnowledge,
            ProfessionalKnowledge = request.ProfessionalKnowledge,
            ValueAddition = request.ValueAddition,
            EndorserYearOfJoining = request.EndorserYearOfJoining,
            EndorserPhone = request.EndorserPhone,
            EndorserEmail = request.EndorserEmail,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = request.CreatedByUserId
        };

        _dbContext.Endorsements.Add(entity);
        await _dbContext.SaveChangesAsync(cancellationToken);
        await WriteAuditAsync(
            "Endorsement",
            entity.EndorsementId,
            "INSERT",
            null,
            $"applicationId={applicationId}; role={entity.EndorserRole}; endorserProfileId={entity.EndorserProfileId}",
            request.CreatedByUserId,
            cancellationToken);
        return Map(entity);
    }

    public async Task<ApplicationSignatureDto?> AddSignatureAsync(long applicationId, CreateApplicationSignatureRequest request, CancellationToken cancellationToken = default)
    {
        if (!await _dbContext.Applications.AnyAsync(x => x.ApplicationId == applicationId, cancellationToken))
        {
            return null;
        }

        var entity = new ApplicationSignature
        {
            ApplicationId = applicationId,
            SignatoryProfileId = request.SignatoryProfileId,
            SignatoryRole = request.SignatoryRole,
            SignatureImageUrl = request.SignatureImageUrl,
            SignedAt = request.SignedAt ?? DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = request.CreatedByUserId
        };

        _dbContext.ApplicationSignatures.Add(entity);
        await _dbContext.SaveChangesAsync(cancellationToken);
        await WriteAuditAsync(
            "Application_signature",
            entity.ApplicationSignatureId,
            "INSERT",
            null,
            $"applicationId={applicationId}; role={entity.SignatoryRole}",
            request.CreatedByUserId,
            cancellationToken);
        return Map(entity);
    }

    public async Task<ApplicationApprovalDto?> AddApprovalAsync(long applicationId, CreateApplicationApprovalRequest request, CancellationToken cancellationToken = default)
    {
        if (!await _dbContext.Applications.AnyAsync(x => x.ApplicationId == applicationId, cancellationToken))
        {
            return null;
        }

        var entity = new ApplicationApproval
        {
            ApplicationId = applicationId,
            ApproverProfileId = request.ApproverProfileId,
            ApproverRoleId = request.ApproverRoleId,
            ApprovalDecision = request.ApprovalDecision,
            ApprovalSignatureUrl = request.ApprovalSignatureUrl,
            ApprovedAt = request.ApprovedAt ?? DateTime.UtcNow,
            DateElected = request.DateElected,
            Remarks = request.Remarks,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = request.CreatedByUserId
        };

        _dbContext.ApplicationApprovals.Add(entity);
        await _dbContext.SaveChangesAsync(cancellationToken);
        await WriteAuditAsync(
            "Application_approval",
            entity.ApplicationApprovalId,
            "INSERT",
            null,
            $"applicationId={applicationId}; decision={entity.ApprovalDecision}",
            request.CreatedByUserId,
            cancellationToken);
        return Map(entity);
    }

    public async Task<InterviewDto?> AddInterviewAsync(long applicationId, CreateInterviewRequest request, CancellationToken cancellationToken = default)
    {
        if (!await _dbContext.Applications.AnyAsync(x => x.ApplicationId == applicationId, cancellationToken))
        {
            return null;
        }

        var entity = new Interview
        {
            ApplicationId = applicationId,
            CommitteeMeetingId = request.CommitteeMeetingId,
            ScheduledAt = request.ScheduledAt,
            ConductedAt = request.ConductedAt,
            InterviewerProfileId = request.InterviewerProfileId,
            AttendedFlag = request.AttendedFlag,
            Outcome = request.Outcome,
            Notes = request.Notes,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = request.CreatedByUserId
        };

        _dbContext.Interviews.Add(entity);
        await _dbContext.SaveChangesAsync(cancellationToken);
        await WriteAuditAsync(
            "Interview",
            entity.InterviewId,
            "INSERT",
            null,
            $"applicationId={applicationId}; outcome={entity.Outcome}",
            request.CreatedByUserId,
            cancellationToken);
        return Map(entity);
    }

    public async Task<ApplicationExclusionDto?> AddExclusionAsync(long applicationId, CreateApplicationExclusionRequest request, CancellationToken cancellationToken = default)
    {
        if (!await _dbContext.Applications.AnyAsync(x => x.ApplicationId == applicationId, cancellationToken))
        {
            return null;
        }

        var entity = new ApplicationExclusion
        {
            ApplicationId = applicationId,
            ApplicantProfileId = request.ApplicantProfileId,
            AdverseVoteCount = request.AdverseVoteCount,
            ExcludedDate = request.ExcludedDate,
            ExcludedUntilDate = request.ExcludedUntilDate,
            IsActive = request.IsActive,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = request.CreatedByUserId
        };

        _dbContext.ApplicationExclusions.Add(entity);
        await _dbContext.SaveChangesAsync(cancellationToken);
        await WriteAuditAsync(
            "ApplicationExclusion",
            entity.ApplicationExclusionId,
            "INSERT",
            null,
            $"applicationId={applicationId}; until={entity.ExcludedUntilDate}",
            request.CreatedByUserId,
            cancellationToken);
        return Map(entity);
    }
    /// <summary>Reads the wizard‑captured membership type from formDataJson.membership.membershipType
    /// and humanises it ("full" → "Full Membership"). Falls back to the ElectionType
    /// when no draft has been saved.</summary>
    private static string? ResolveMembershipTypeName(string? formJson, string? electionTypeName)
    {
        if (!string.IsNullOrWhiteSpace(formJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(formJson);
                if (doc.RootElement.TryGetProperty("membership", out var mem))
                {
                    if (mem.TryGetProperty("membershipType", out var mt))
                    {
                        var raw = mt.GetString();
                        if (!string.IsNullOrWhiteSpace(raw))
                        {
                            return HumanizeMembershipType(raw!);
                        }
                    }
                }
            }
            catch (JsonException)
            {
                /* malformed JSON — fall through */
            }
        }

        return electionTypeName;
    }

    /// <summary>Short badge version of the membership type — whitespace removed
    /// and upper‑cased (Full → FULL, Associate Membership → ASSOCIATEMEMBERSHIP;
    /// the client splits on caps to render the chip).</summary>
    private static string? ResolveMembershipTypeBadge(string? formJson, string? electionTypeName)
    {
        var name = ResolveMembershipTypeName(formJson, electionTypeName);
        if (string.IsNullOrWhiteSpace(name)) return null;
        var cleaned = new string(name.Where(c => !char.IsWhiteSpace(c)).ToArray());
        return string.IsNullOrEmpty(cleaned) ? null : cleaned.ToUpperInvariant();
    }

    private static string HumanizeMembershipType(string raw)
    {
        var trimmed = raw.Trim();
        if (trimmed.Equals("full", StringComparison.OrdinalIgnoreCase)) return "Full Membership";
        if (trimmed.StartsWith("associate", StringComparison.OrdinalIgnoreCase)) return "Associate Membership";
        if (trimmed.StartsWith("junior", StringComparison.OrdinalIgnoreCase)) return "Junior Membership";
        if (trimmed.StartsWith("honorary", StringComparison.OrdinalIgnoreCase)) return "Honorary Membership";
        if (trimmed.StartsWith("corporate", StringComparison.OrdinalIgnoreCase)) return "Corporate Membership";
        if (trimmed.StartsWith("family", StringComparison.OrdinalIgnoreCase)) return "Family Membership";
        return trimmed;
    }

    /// <summary>Returns the number of wizard steps the applicant marked complete.
    /// CompletedStepsJson is a List&lt;string&gt; serialized by the wizard
    /// (see CreateDraftAsync line 99).</summary>
    private static int CountCompletedSteps(string? completedJson)
    {
        if (string.IsNullOrWhiteSpace(completedJson)) return 0;
        try
        {
            return JsonSerializer.Deserialize<List<string>>(completedJson)?.Count ?? 0;
        }
        catch (JsonException)
        {
            return 0;
        }
    }


    private async Task<MApplication?> LoadApplicationAsync(long applicationId, CancellationToken cancellationToken)
    {
        // AsSplitQuery() is required here: with 7 separate one-to-many collection
        // Includes (Documents, Endorsements, Signatures, Approvals, StatusHistory,
        // Interviews, Exclusions), EF's default single-query mode LEFT JOINs every
        // child table together in one statement. That produces a cartesian
        // product — the row counts of each collection multiply together — which
        // can balloon a "load 1 application" read into thousands of duplicated
        // rows for SQL Server to build and transfer. That's what was causing the
        // execution timeouts on both the GET and PUT endpoints (PUT calls this
        // method too, to reload and return the updated entity). Splitting into
        // one query per collection avoids the multiplication; EF still stitches
        // the results back into a single object graph.
        return await _dbContext.Applications
            .AsNoTracking()
            .AsSplitQuery()
            .Include(x => x.Applicant)
            .Include(x => x.Status)
            .Include(x => x.Proposer)
            .Include(x => x.Seconder)
            .Include(x => x.AplicationDocuments)
                .ThenInclude(x => x.DocumentType)
            .Include(x => x.Endorsements)
                .ThenInclude(x => x.Endorser)
            .Include(x => x.ApplicationSignatures)
            .Include(x => x.ApplicationApprovals)
            .Include(x => x.ApplicationStatusHistories)
                .ThenInclude(h => h.FromStatus)
            .Include(x => x.ApplicationStatusHistories)
                .ThenInclude(h => h.ToStatus)
            .Include(x => x.Interviews)
            .Include(x => x.ApplicationExclusions)
            .FirstOrDefaultAsync(x => x.ApplicationId == applicationId, cancellationToken);
    }

    private async Task AddStatusHistoryInternalAsync(long applicationId, long? fromStatusId, long toStatusId, long? changedByUserId, string? reason, CancellationToken cancellationToken)
    {
        _dbContext.ApplicationStatusHistories.Add(new ApplicationStatusHistory
        {
            ApplicationId = applicationId,
            FromStatusId = fromStatusId,
            ToStatusId = toStatusId,
            ChangedAt = DateTime.UtcNow,
            ChangedByUserId = changedByUserId,
            Reason = reason
        });

        await _dbContext.SaveChangesAsync(cancellationToken);
        await WriteAuditAsync(
            "MApplication",
            applicationId,
            "STATUS",
            fromStatusId?.ToString(),
            $"toStatusId={toStatusId}; reason={reason}",
            changedByUserId,
            cancellationToken);
    }

    private async Task WriteAuditAsync(
        string tableName,
        long recordId,
        string action,
        string? oldValues,
        string? newValues,
        long? changedByUserId,
        CancellationToken cancellationToken)
    {
        _dbContext.AuditLogs.Add(new AuditLog
        {
            TableName = tableName,
            RecordId = recordId,
            Action = action,
            OldValues = TruncateAudit(oldValues),
            NewValues = TruncateAudit(newValues),
            ChangedByUserId = changedByUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private static string? TruncateAudit(string? value)
    {
        if (string.IsNullOrEmpty(value)) return value;
        return value.Length <= 4000 ? value : value[..4000];
    }

    private static string SnapshotApplication(MApplication entity) =>
        JsonSerializer.Serialize(new
        {
            entity.ApplicationNo,
            entity.ApplicationStatusId,
            entity.ProposerProfileId,
            entity.SeconderProfileId,
            entity.ElectionTypeId,
            entity.SubmittedAt,
            CompletedSteps = entity.CompletedStepsJson,
            FormDataLength = entity.FormDataJson?.Length ?? 0,
            entity.UpdatedByUserId,
            entity.UpdatedAt
        });

    private static ApplicationDetailDto Map(MApplication entity)
    {
        return new ApplicationDetailDto
        {
            ApplicationId = entity.ApplicationId,
            ApplicationNo = entity.ApplicationNo,
            ApplicantProfileId = entity.ApplicantProfileId,
            ApplicantName = BuildName(entity.Applicant?.Title, entity.Applicant?.FirstName, entity.Applicant?.MiddleName, entity.Applicant?.LastName),
            ApplicationFormVersionId = entity.ApplicationFormVersionId,
            ElectionTypeId = entity.ElectionTypeId,
            ProposerProfileId = entity.ProposerProfileId,
            ProposerName = entity.Proposer is null ? null : BuildName(entity.Proposer.Title, entity.Proposer.FirstName, entity.Proposer.MiddleName, entity.Proposer.LastName),
            SeconderProfileId = entity.SeconderProfileId,
            SeconderName = entity.Seconder is null ? null : BuildName(entity.Seconder.Title, entity.Seconder.FirstName, entity.Seconder.MiddleName, entity.Seconder.LastName),
            ApplicationStatusId = entity.ApplicationStatusId,
            ReceivedDate = entity.ReceivedDate,
            ClubVisitsCount = entity.ClubVisitsCount,
            InterviewRequiredFlag = entity.InterviewRequiredFlag,
            EntranceFeeAmount = entity.EntranceFeeAmount,
            AnnualSubscriptionAmount = entity.AnnualSubscriptionAmount,
            SubmittedAt = entity.SubmittedAt,
            CreatedAt = entity.CreatedAt,
            UpdatedAt = entity.UpdatedAt,
            CreatedByUserId = entity.CreatedByUserId,
            UpdatedByUserId = entity.UpdatedByUserId,
            // Surface the normalized workflow status code and the wizard payload so the React
            // client can rehydrate the draft (formDataJson / completedSteps).
            StatusCode = NormalizeStatusCode(entity.Status?.Code),
            StatusName = entity.Status?.Name,
            FormDataJson = entity.FormDataJson,
            CompletedSteps = DeserializeSteps(entity.CompletedStepsJson),
            Documents = entity.AplicationDocuments.OrderByDescending(x => x.CreatedAt).Select(Map).ToList(),
            Endorsements = entity.Endorsements.OrderBy(x => x.EndorsementId).Select(Map).ToList(),
            Signatures = entity.ApplicationSignatures.OrderBy(x => x.ApplicationSignatureId).Select(Map).ToList(),
            Approvals = entity.ApplicationApprovals.OrderBy(x => x.ApplicationApprovalId).Select(Map).ToList(),
            StatusHistory = entity.ApplicationStatusHistories.OrderByDescending(x => x.ChangedAt).Select(Map).ToList(),
            Interviews = entity.Interviews.OrderByDescending(x => x.ScheduledAt).Select(Map).ToList(),
            Exclusions = entity.ApplicationExclusions.OrderByDescending(x => x.ExcludedDate).Select(Map).ToList()
        };
    }

    private static ApplicationDocumentDto Map(AplicationDocument entity) => new()
    {
        ApplicationDocumentId = entity.ApplicationDocumentId,
        ApplicationId = entity.ApplicationId,
        DocumentTypeId = entity.DocumentTypeId,
        DocumentTypeName = entity.DocumentType?.Name,
        DocumentTypeCode = entity.DocumentType?.Code,
        FileName = entity.FileName,
        FileUrl = entity.FileUrl,
        UploadedAt = entity.UploadedAt,
        UploadedByUserId = entity.UploadedByUserId,
        CreatedAt = entity.CreatedAt,
        CreatedByUserId = entity.CreatedByUserId,
        UpdatedByUserId = entity.UpdatedByUserId,
        IsVerified = entity.IsVerified,
        VerificationStatus = entity.VerificationStatus,
        VerificationNotes = entity.VerificationNotes,
        VerifiedAt = entity.VerifiedAt,
        VerifiedByUserId = entity.VerifiedByUserId
    };

    private static EndorsementDto Map(Endorsement entity) => new()
    {
        EndorsementId = entity.EndorsementId,
        ApplicationId = entity.ApplicationId,
        EndorserProfileId = entity.EndorserProfileId,
        EndorserName = entity.Endorser is null
            ? null
            : string.Join(" ", new[] { entity.Endorser.FirstName, entity.Endorser.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
        EndorserRole = entity.EndorserRole,
        YearsKnownCandidate = entity.YearsKnownCandidate,
        PersonalKnowledge = entity.PersonalKnowledge,
        ProfessionalKnowledge = entity.ProfessionalKnowledge,
        ValueAddition = entity.ValueAddition,
        EndorserYearOfJoining = entity.EndorserYearOfJoining,
        EndorserPhone = entity.EndorserPhone,
        EndorserEmail = entity.EndorserEmail,
        CreatedAt = entity.CreatedAt,
        CreatedByUserId = entity.CreatedByUserId,
        UpdatedByUserId = entity.UpdatedByUserId
    };

    private static ApplicationSignatureDto Map(ApplicationSignature entity) => new()
    {
        ApplicationSignatureId = entity.ApplicationSignatureId,
        ApplicationId = entity.ApplicationId,
        SignatoryProfileId = entity.SignatoryProfileId,
        SignatoryRole = entity.SignatoryRole,
        SignatureImageUrl = entity.SignatureImageUrl,
        SignedAt = entity.SignedAt,
        CreatedAt = entity.CreatedAt,
        CreatedByUserId = entity.CreatedByUserId,
        UpdatedByUserId = entity.UpdatedByUserId
    };

    private static ApplicationApprovalDto Map(ApplicationApproval entity) => new()
    {
        ApplicationApprovalId = entity.ApplicationApprovalId,
        ApplicationId = entity.ApplicationId,
        ApproverProfileId = entity.ApproverProfileId,
        ApproverRoleId = entity.ApproverRoleId,
        ApprovalDecision = entity.ApprovalDecision,
        ApprovalSignatureUrl = entity.ApprovalSignatureUrl,
        ApprovedAt = entity.ApprovedAt,
        DateElected = entity.DateElected,
        Remarks = entity.Remarks,
        CreatedAt = entity.CreatedAt,
        CreatedByUserId = entity.CreatedByUserId,
        UpdatedByUserId = entity.UpdatedByUserId
    };

    private static ApplicationStatusHistoryDto Map(ApplicationStatusHistory entity) => new()
    {
        ApplicationStatusHistoryId = entity.ApplicationStatusHistoryId,
        ApplicationId = entity.ApplicationId,
        FromStatusId = entity.FromStatusId,
        FromStatusCode = NormalizeStatusCode(entity.FromStatus?.Code),
        FromStatusName = entity.FromStatus?.Name,
        ToStatusId = entity.ToStatusId,
        ToStatusCode = NormalizeStatusCode(entity.ToStatus?.Code),
        ToStatusName = entity.ToStatus?.Name,
        ChangedAt = entity.ChangedAt,
        ChangedByUserId = entity.ChangedByUserId,
        Reason = entity.Reason
    };

    private static InterviewDto Map(Interview entity) => new()
    {
        InterviewId = entity.InterviewId,
        ApplicationId = entity.ApplicationId,
        CommitteeMeetingId = entity.CommitteeMeetingId,
        ScheduledAt = entity.ScheduledAt,
        ConductedAt = entity.ConductedAt,
        InterviewerProfileId = entity.InterviewerProfileId,
        AttendedFlag = entity.AttendedFlag,
        Outcome = entity.Outcome,
        Notes = entity.Notes,
        CreatedAt = entity.CreatedAt,
        CreatedByUserId = entity.CreatedByUserId,
        UpdatedByUserId = entity.UpdatedByUserId
    };

    private static ApplicationExclusionDto Map(ApplicationExclusion entity) => new()
    {
        ApplicationExclusionId = entity.ApplicationExclusionId,
        ApplicationId = entity.ApplicationId,
        ApplicantProfileId = entity.ApplicantProfileId,
        AdverseVoteCount = entity.AdverseVoteCount,
        ExcludedDate = entity.ExcludedDate,
        ExcludedUntilDate = entity.ExcludedUntilDate,
        IsActive = entity.IsActive,
        CreatedAt = entity.CreatedAt,
        CreatedByUserId = entity.CreatedByUserId,
        UpdatedByUserId = entity.UpdatedByUserId
    };

    private static DateOnly? ResolveApplicantDateOfBirth(MApplication entity)
    {
        if (entity.Applicant?.DateOfBirth is not null)
        {
            return entity.Applicant.DateOfBirth;
        }

        if (string.IsNullOrWhiteSpace(entity.FormDataJson))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(entity.FormDataJson);
            if (!doc.RootElement.TryGetProperty("personal", out var personal)) return null;
            if (!personal.TryGetProperty("dateOfBirth", out var dateOfBirth)) return null;
            return dateOfBirth.ValueKind == JsonValueKind.String
                ? TryParseDateOnly(dateOfBirth.GetString())
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static DateOnly? TryParseDateOnly(string? value)
    {
        return DateOnly.TryParse(value, out var parsed) ? parsed : null;
    }

    private static int? CalculateAgeInYears(DateOnly? dateOfBirth)
    {
        if (dateOfBirth is null) return null;

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var age = today.Year - dateOfBirth.Value.Year;
        if (today < dateOfBirth.Value.AddYears(age))
        {
            age--;
        }

        return age >= 0 ? age : null;
    }

    private async Task<ApplicationStatus?> FindStatusByCodeAsync(string statusCode, CancellationToken cancellationToken)
    {
        var wanted = NormalizeStatusCode(statusCode) ?? statusCode.Trim();
        var rows = await _dbContext.ApplicationStatuses.ToListAsync(cancellationToken);
        return rows.FirstOrDefault(row =>
            string.Equals(NormalizeStatusCode(row.Code), wanted, StringComparison.OrdinalIgnoreCase)
            || string.Equals(row.Code, statusCode, StringComparison.OrdinalIgnoreCase));
    }

    private static string? NormalizeStatusCode(string? statusCode)
    {
        if (string.IsNullOrWhiteSpace(statusCode)) return statusCode;

        return statusCode.Trim().ToUpperInvariant() switch
        {
            "DRAFT" => "Draft",
            "SUBMITTED" => "Submitted",
            "UNDERREVIEW" or "UNDER_REVIEW" => "UnderReview",
            "ENDORSEMENT" => "Endorsement",
            "ENDORSEMENTREVIEW" or "ENDORSEMENT_REVIEW" => "EndorsementReview",
            "INTERVIEW" => "Interview",
            "INTERVIEWREVIEW" or "INTERVIEW_REVIEW" => "InterviewReview",
            "TEMPORARY_MEMBER" or "TEMPORARYMEMBER" => "TemporaryMember",
            "WAITLIST" or "WAITLISTED" or "ELECTION" => "Waitlist",
            "ELECTIONREVIEW" or "ELECTION_REVIEW" => "ElectionReview",
            "COMMITTEE" => "Committee",
            "COMMITTEEREVIEW" or "COMMITTEE_REVIEW" => "CommitteeReview",
            "APPROVED" => "Approved",
            "REJECTED" => "Rejected",
            "NOTELECTED" or "NOT_ELECTED" => "NotElected",
            "WITHDRAWN" or "EXCLUDED" => "Withdrawn",
            _ => statusCode,
        };
    }

    private static void EnsureEndorsementsComplete(IEnumerable<Endorsement> endorsements)
    {
        var sponsor = ResolveSponsorFromEndorsements(endorsements);
        if (!string.Equals(sponsor.Code, "COMPLETE", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "Both the proposer and the seconder must complete their endorsements before this application can move to the next step.");
        }
    }

    /// <summary>
    /// Removes empty endorsement stubs that no longer match the named proposer/seconder
    /// (e.g. after the applicant changed who should second them).
    /// </summary>
    private async Task PruneOrphanEmptyEndorsementStubsAsync(MApplication entity, CancellationToken cancellationToken)
    {
        var stubs = await _dbContext.Endorsements
            .Where(e => e.ApplicationId == entity.ApplicationId
                && (e.PersonalKnowledge == null || e.PersonalKnowledge == "")
                && (e.ProfessionalKnowledge == null || e.ProfessionalKnowledge == "")
                && (e.ValueAddition == null || e.ValueAddition == ""))
            .ToListAsync(cancellationToken);
        if (stubs.Count == 0) return;

        foreach (var stub in stubs)
        {
            var role = NormalizeEndorserRole(stub.EndorserRole);
            var stillNamed =
                (role == "PROPOSER" && stub.EndorserProfileId == entity.ProposerProfileId)
                || (role == "SECONDER" && stub.EndorserProfileId == entity.SeconderProfileId);
            if (!stillNamed)
                _dbContext.Endorsements.Remove(stub);
        }
    }

    private static string? ReviewStatus(string? current) => current switch
    {
        "Submitted" => "UnderReview",
        "Endorsement" => "EndorsementReview",
        "Interview" => "InterviewReview",
        "Waitlist" => "ElectionReview",
        "Committee" => "CommitteeReview",
        _ => null,
    };

    private static string? NextApprovedStatus(string? current) => current switch
    {
        "UnderReview" => "Endorsement",
        "EndorsementReview" => "Interview",
        "InterviewReview" => "Waitlist",
        "ElectionReview" => "Committee",
        "CommitteeReview" => "Approved",
        _ => null,
    };

    private static string ReviewBlockedMessage(string? current) => current switch
    {
        "UnderReview" or "EndorsementReview" or "InterviewReview" or "ElectionReview" or "CommitteeReview"
            => "This application is already under review.",
        "Approved" => "This application is already at the final decision. Elect the applicant to add them to the member register.",
        "Rejected" or "Withdrawn" => "A closed application cannot be reviewed.",
        _ => "Review is only available when the application is waiting at a stage.",
    };

    private static string ApproveBlockedMessage(string? current) => current switch
    {
        "Submitted" or "Endorsement" or "Interview" or "Waitlist" or "Committee"
            => "Start review before approving this application to the next stage.",
        "Approved" => "This application is already at the final decision. Elect the applicant to add them to the member register.",
        _ => $"This application cannot be approved from {current ?? "its current"} status.",
    };

    private async Task<ApplicationDetailDto?> TransitionToCodeAsync(
        MApplication entity,
        string nextCode,
        long? actorUserId,
        string reason,
        CancellationToken cancellationToken)
    {
        var next = await FindStatusByCodeAsync(nextCode, cancellationToken)
            ?? throw new InvalidOperationException($"Application status '{nextCode}' was not found. Apply the latest Application_status seed.");

        var previousStatusId = entity.ApplicationStatusId;
        entity.ApplicationStatusId = next.ApplicationStatusId;
        entity.UpdatedByUserId = actorUserId;
        entity.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);
        await AddStatusHistoryInternalAsync(
            entity.ApplicationId,
            previousStatusId,
            next.ApplicationStatusId,
            actorUserId,
            $"{reason} ({next.Name}).",
            cancellationToken);

        var updated = await LoadApplicationAsync(entity.ApplicationId, cancellationToken);
        return updated is null ? null : Map(updated);
    }

    private static string GenerateApplicationNo()
    {
        var now = DateTime.UtcNow;
        return $"ACEA-{now.Year}-{Random.Shared.Next(10000, 100000)}";
    }

    private static List<string>? DeserializeSteps(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string BuildName(string? title, string? firstName, string? middleName, string? lastName)
    {
        return string.Join(" ", new[] { title, firstName, middleName, lastName }.Where(x => !string.IsNullOrWhiteSpace(x)));
    }
}