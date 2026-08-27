using ClubManagement.Auth;
using ClubManagement.DTOs.MembershipAccount;
using ClubManagement.DTOs.MembershipApplication;
using ClubManagement.Services.Finance;
using ClubManagement.Services.MembershipApplication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ClubManagement.Data.MembershipApplication;

namespace ClubManagement.Controllers.MembershipApplication;

[ApiController]
[Route("api/applications")]
public class ApplicationsController : ControllerBase
{
    private readonly IApplicationService _applicationService;
    private readonly IApplicantDetailsService _applicantDetailsService;
    private readonly IFinanceService _finance;
    private readonly IManagerStageService _managerStage;
    private readonly ApplicationModuleDbContext _db;

    public ApplicationsController(
        IApplicationService applicationService,
        IApplicantDetailsService applicantDetailsService,
        IFinanceService finance,
        IManagerStageService managerStage,
        ApplicationModuleDbContext db)
    {
        _applicationService = applicationService;
        _applicantDetailsService = applicantDetailsService;
        _finance = finance;
        _managerStage = managerStage;
        _db = db;
    }

    private bool CanAccessApplication(long applicantProfileId)
    {
        if (User.IsStaff()) return true;
        return User.ProfileId() is long profileId && profileId == applicantProfileId;
    }

    private bool CanManageClubVisits() =>
        User.HasAnyRole("ADMIN", "GENERAL_MANAGER", "CHAIRMAN", "RECEPTIONIST");

    private bool CanOverrideClubVisits() =>
        User.HasAnyRole("ADMIN", "GENERAL_MANAGER", "CHAIRMAN");

    [Authorize]
    [HttpGet("manager-queue")]
    public async Task<ActionResult<IReadOnlyList<ApplicationListItemDto>>> ManagerQueue(CancellationToken cancellationToken)
    {
        if (!User.HasAnyRole("ADMIN", "GENERAL_MANAGER", "CHAIRMAN")) return Forbid();
        return Ok(await _managerStage.ListManagerQueueAsync(cancellationToken));
    }

    [HttpGet("manager-history")]
    public async Task<ActionResult<IReadOnlyList<ApplicationListItemDto>>> ManagerHistory(CancellationToken cancellationToken)
    {
        if (!User.HasAnyRole("ADMIN", "GENERAL_MANAGER", "CHAIRMAN")) return Forbid();
        return Ok(await _managerStage.ListStageAHistoryAsync(cancellationToken));
    }

    [HttpPost("{applicationId:long}/assign-meeting")]
    public async Task<ActionResult<InterviewDto>> AssignMeeting(
        long applicationId,
        [FromBody] AssignMeetingRequest request,
        CancellationToken cancellationToken)
    {
        if (!User.HasAnyRole("ADMIN", "GENERAL_MANAGER", "CHAIRMAN")) return Forbid();
        try
        {
            var result = await _managerStage.AssignToCommitteeMeetingAsync(
                applicationId,
                request,
                User.UserId(),
                cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [Authorize]
    [HttpGet("{applicationId:long}/manager-readiness")]
    public async Task<ActionResult<ManagerReadinessDto>> ManagerReadiness(long applicationId, CancellationToken cancellationToken)
    {
        var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (existing is null || !CanAccessApplication(existing.ApplicantProfileId)) return NotFound();
        var result = await _managerStage.GetReadinessAsync(applicationId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [Authorize]
    [HttpGet("{applicationId:long}/club-visits")]
    public async Task<ActionResult<IReadOnlyList<ApplicationClubVisitDto>>> ListClubVisits(long applicationId, CancellationToken cancellationToken)
    {
        var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (existing is null) return NotFound();
        if (!User.IsStaff() && !CanAccessApplication(existing.ApplicantProfileId)) return NotFound();
        return Ok(await _managerStage.ListClubVisitsAsync(applicationId, cancellationToken));
    }

    [Authorize]
    [HttpPost("{applicationId:long}/club-visits")]
    public async Task<ActionResult<ApplicationClubVisitDto>> AddClubVisit(
        long applicationId,
        [FromBody] CreateApplicationClubVisitRequest request,
        CancellationToken cancellationToken)
    {
        if (!CanManageClubVisits()) return Forbid();
        try
        {
            var result = await _managerStage.AddClubVisitAsync(applicationId, request, User.UserId(), cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [Authorize]
    [HttpPost("{applicationId:long}/club-visits/override")]
    public async Task<ActionResult<ManagerReadinessDto>> OverrideClubVisits(
        long applicationId,
        [FromBody] ClubVisitsOverrideRequest request,
        CancellationToken cancellationToken)
    {
        if (!CanOverrideClubVisits()) return Forbid();
        try
        {
            var result = await _managerStage.OverrideClubVisitsAsync(applicationId, request, User.UserId(), cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [Authorize]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ApplicationListItemDto>>> GetAll(CancellationToken cancellationToken)
    {
        if (!User.IsStaff()) return Forbid();
        var result = await _applicationService.GetAllAsync(cancellationToken);
        return Ok(result);
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<IReadOnlyList<ApplicationListItemDto>>> GetMine(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null or 0) return Unauthorized();
        var result = await _applicationService.GetMineAsync(profileId.Value, cancellationToken);
        return Ok(result);
    }

    [Authorize]
    [HttpGet("current")]
    public async Task<ActionResult<ApplicationDetailDto>> GetCurrent(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null or 0) return Unauthorized();
        var result = await _applicationService.GetCurrentForProfileAsync(profileId.Value, cancellationToken);
        return result is null ? NoContent() : Ok(result);
    }

    [Authorize]
    [HttpGet("{applicationId:long}")]
    public async Task<ActionResult<ApplicationDetailDto>> GetById(long applicationId, CancellationToken cancellationToken)
    {
        var result = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (result is null || !CanAccessApplication(result.ApplicantProfileId)) return NotFound();
        return Ok(result);
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult<ApplicationDetailDto>> CreateDraft([FromBody] CreateApplicationRequest request, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null or 0) return Unauthorized();
        if (!User.IsStaff())
        {
            request.ApplicantProfileId = profileId;
        }
        else
        {
            request.ApplicantProfileId ??= profileId;
        }
        request.CreatedByUserId = User.UserId();
        var result = await _applicationService.CreateDraftAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { applicationId = result.ApplicationId }, result);
    }

    [Authorize]
    [HttpPut("{applicationId:long}")]
    public async Task<ActionResult<ApplicationDetailDto>> Update(long applicationId, [FromBody] UpdateApplicationRequest request, CancellationToken cancellationToken)
    {
        var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (existing is null || !CanAccessApplication(existing.ApplicantProfileId)) return NotFound();
        if (!User.IsStaff())
        {
            request.ApplicantProfileId = existing.ApplicantProfileId;
        }
        request.UpdatedByUserId = User.UserId();
        var result = await _applicationService.UpdateAsync(applicationId, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }


    [Authorize]
    [HttpGet("{applicationId:long}/details")]
    public async Task<ActionResult<ApplicantDetailsDto>> GetApplicantDetails(long applicationId, CancellationToken cancellationToken)
    {
        var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (existing is null || !CanAccessApplication(existing.ApplicantProfileId)) return NotFound();
        var result = await _applicantDetailsService.GetDetailsAsync(applicationId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [Authorize]
    [HttpPut("{applicationId:long}/details")]
    public async Task<ActionResult<ApplicantDetailsDto>> SaveApplicantDetails(long applicationId, [FromBody] SaveApplicantDetailsRequest request, CancellationToken cancellationToken)
    {
        var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (existing is null || !CanAccessApplication(existing.ApplicantProfileId)) return NotFound();
        if (!User.IsStaff())
        {
            request.ProfileId = existing.ApplicantProfileId;
        }
        var result = await _applicantDetailsService.SaveDetailsAsync(applicationId, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpGet("{applicationId:long}/validate-submission")]
    public async Task<ActionResult<WorkflowValidationResultDto>> ValidateSubmission(long applicationId, CancellationToken cancellationToken)
    {
        var result = await _applicationService.ValidateBeforeSubmitAsync(applicationId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [Authorize]
    [HttpPost("{applicationId:long}/submit")]
    public async Task<ActionResult<ApplicationDetailDto>> Submit(long applicationId, [FromBody] SubmitApplicationRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
            if (existing is null || !CanAccessApplication(existing.ApplicantProfileId)) return NotFound();
            var result = await _applicationService.SubmitAsync(applicationId, request, cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [Authorize]
    [HttpPost("{applicationId:long}/status")]
    public async Task<ActionResult<ApplicationDetailDto>> ChangeStatus(long applicationId, [FromBody] ChangeApplicationStatusRequest request, CancellationToken cancellationToken)
    {
        var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (existing is null || !CanAccessApplication(existing.ApplicantProfileId)) return NotFound();
        if (!User.IsStaff())
        {
            var code = (request.StatusCode ?? string.Empty).Replace("_", "", StringComparison.Ordinal).Trim();
            if (!code.Equals("Withdrawn", StringComparison.OrdinalIgnoreCase)
                && !code.Equals("WITHDRAWN", StringComparison.OrdinalIgnoreCase))
            {
                return Forbid();
            }
        }
        request.ChangedByUserId = User.UserId() ?? request.ChangedByUserId;
        try
        {
            var result = await _applicationService.ChangeStatusAsync(applicationId, request, cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.InnerException?.Message ?? ex.Message });
        }
    }

    [Authorize]
    [HttpPost("{applicationId:long}/advance")]
    public async Task<ActionResult<ApplicationDetailDto>> Advance(
        long applicationId,
        [FromBody] ChangeApplicationStatusRequest? request,
        CancellationToken cancellationToken)
    {
        if (!User.IsStaff()) return Forbid();
        var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (existing is null) return NotFound();
        try
        {
            var result = await _applicationService.AdvanceStageAsync(
                applicationId,
                User.UserId() ?? request?.ChangedByUserId,
                request?.Reason ?? "Approved by committee.",
                cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.InnerException?.Message ?? ex.Message });
        }
    }

    [Authorize]
    [HttpPost("{applicationId:long}/review")]
    public async Task<ActionResult<ApplicationDetailDto>> StartReview(
        long applicationId,
        [FromBody] ChangeApplicationStatusRequest? request,
        CancellationToken cancellationToken)
    {
        if (!User.IsStaff()) return Forbid();
        var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (existing is null) return NotFound();
        try
        {
            var result = await _applicationService.StartReviewAsync(
                applicationId,
                User.UserId() ?? request?.ChangedByUserId,
                request?.Reason ?? "Admin opened the application for review.",
                cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.InnerException?.Message ?? ex.Message });
        }
    }

    [HttpPost("{applicationId:long}/documents")]
    public async Task<ActionResult<ApplicationDocumentDto>> AddDocument(long applicationId, [FromBody] CreateApplicationDocumentRequest request, CancellationToken cancellationToken)
    {
        var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (existing is null || !CanAccessApplication(existing.ApplicantProfileId)) return NotFound();
        var result = await _applicationService.AddDocumentAsync(applicationId, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [Authorize]
    [HttpPost("{applicationId:long}/documents/{applicationDocumentId:long}/verify")]
    public async Task<ActionResult<ApplicationDocumentDto>> VerifyDocument(
        long applicationId,
        long applicationDocumentId,
        [FromBody] VerifyApplicationDocumentRequest request,
        CancellationToken cancellationToken)
    {
        request.VerifiedByUserId = User.UserId() ?? request.VerifiedByUserId;
        var result = await _applicationService.VerifyDocumentAsync(applicationId, applicationDocumentId, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [Authorize]
    [HttpGet("{applicationId:long}/dues")]
    public async Task<ActionResult<ApplicationDuesDto>> GetDues(long applicationId, CancellationToken cancellationToken)
    {
        var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (existing is null || !CanAccessApplication(existing.ApplicantProfileId)) return NotFound();
        try
        {
            return Ok(await _finance.GetApplicationDuesAsync(applicationId, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [Authorize]
    [HttpGet("{applicationId:long}/payments")]
    public async Task<ActionResult<IReadOnlyList<PaymentRowDto>>> ListPayments(long applicationId, CancellationToken cancellationToken)
    {
        var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (existing is null || !CanAccessApplication(existing.ApplicantProfileId)) return NotFound();
        return Ok(await _finance.ListPaymentsByProfileAsync(existing.ApplicantProfileId, cancellationToken));
    }

    [Authorize]
    [HttpPost("{applicationId:long}/payments")]
    public async Task<ActionResult<PaymentRowDto>> RecordPayment(
        long applicationId,
        [FromBody] ApplicationPayRequest request,
        CancellationToken cancellationToken)
    {
        var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (existing is null || !CanAccessApplication(existing.ApplicantProfileId)) return NotFound();

        var feeCode = (request.FeeTypeCode ?? "JOINING").Trim().ToUpperInvariant();
        if (feeCode is not ("JOINING" or "ANNUAL"))
            return BadRequest(new { message = "Fee type must be JOINING or ANNUAL." });

        var fee = await _db.FeeTypes.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Code == feeCode || x.Code == request.FeeTypeCode, cancellationToken);
        if (fee is null)
            return BadRequest(new { message = $"Fee type '{feeCode}' was not found." });

        var noteParts = new List<string>();
        if (!string.IsNullOrWhiteSpace(request.ReferenceNote)) noteParts.Add(request.ReferenceNote.Trim());
        if (!string.IsNullOrWhiteSpace(request.MpesaPhone)) noteParts.Add($"phone:{request.MpesaPhone.Trim()}");

        try
        {
            var row = await _finance.RecordPaymentAsync(
                new RecordPaymentRequest(
                    null,
                    applicationId,
                    fee.FeeTypeId,
                    request.PaymentMethodId,
                    request.Amount,
                    request.PaymentDate,
                    request.ChequeNo,
                    request.MpesaCode,
                    noteParts.Count == 0 ? null : string.Join(" | ", noteParts),
                    request.PaymentStatusCode),
                User.UserId(),
                cancellationToken);
            try
            {
                await _managerStage.OnApplicantPrerequisitesChangedAsync(applicationId, cancellationToken);
            }
            catch { /* ignore notify errors */ }
            return Ok(row);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{applicationId:long}/endorsements")]
    public async Task<ActionResult<EndorsementDto>> AddEndorsement(long applicationId, [FromBody] CreateEndorsementRequest request, CancellationToken cancellationToken)
    {
        var existing = await _applicationService.GetByIdAsync(applicationId, cancellationToken);
        if (existing is null || !CanAccessApplication(existing.ApplicantProfileId)) return NotFound();
        var result = await _applicationService.AddEndorsementAsync(applicationId, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("{applicationId:long}/signatures")]
    public async Task<ActionResult<ApplicationSignatureDto>> AddSignature(long applicationId, [FromBody] CreateApplicationSignatureRequest request, CancellationToken cancellationToken)
    {
        var result = await _applicationService.AddSignatureAsync(applicationId, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("{applicationId:long}/approvals")]
    public async Task<ActionResult<ApplicationApprovalDto>> AddApproval(long applicationId, [FromBody] CreateApplicationApprovalRequest request, CancellationToken cancellationToken)
    {
        var result = await _applicationService.AddApprovalAsync(applicationId, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("{applicationId:long}/interviews")]
    public async Task<ActionResult<InterviewDto>> AddInterview(long applicationId, [FromBody] CreateInterviewRequest request, CancellationToken cancellationToken)
    {
        var result = await _applicationService.AddInterviewAsync(applicationId, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("{applicationId:long}/exclusions")]
    public async Task<ActionResult<ApplicationExclusionDto>> AddExclusion(long applicationId, [FromBody] CreateApplicationExclusionRequest request, CancellationToken cancellationToken)
    {
        var result = await _applicationService.AddExclusionAsync(applicationId, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }
}
