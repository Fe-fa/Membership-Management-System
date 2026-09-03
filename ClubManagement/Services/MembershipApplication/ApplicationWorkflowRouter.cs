namespace ClubManagement.Services.MembershipApplication;

public record WorkflowHistoryEntry(long? ActorUserId, string? ToStatusCode, DateTime ChangedAt);

public static class ApplicationWorkflowRouter
{
    public const string ApproveAction = "APPROVE";
    public const string RejectAction = "REJECT";
    public const string ReviewAction = "REVIEW";
    public const string HandbackAction = "HANDBACK";

    /// <summary>Stage to return to when the current reviewer rejects (not Draft, not a new assignee).</summary>
    public static string? PreviousStatus(string? current) => current switch
    {
        "EndorsementReview" => "Endorsement",
        "InterviewReview" => "Interview",
        "ElectionReview" => "Waitlist",
        "CommitteeReview" => "Committee",
        "Interview" => "EndorsementReview",
        "Waitlist" => "InterviewReview",
        "Committee" => "ElectionReview",
        "TemporaryMember" => "InterviewReview",
        "Endorsement" => "UnderReview",
        "UnderReview" => "Submitted",
        _ => null,
    };

    /// <summary>Last person who acted on the application before the current actor.</summary>
    public static long? ResolvePreviousHandler(
        IEnumerable<WorkflowHistoryEntry> history,
        long? currentActorUserId)
    {
        foreach (var entry in history.OrderByDescending(h => h.ChangedAt))
        {
            if (entry.ActorUserId is long id && id > 0 && id != currentActorUserId)
                return id;
        }
        return null;
    }

    public static HandbackPlan PlanReject(
        string? currentStatus,
        IEnumerable<WorkflowHistoryEntry> history,
        long? currentActorUserId,
        long? currentHandlerUserId,
        long? createdByUserId)
    {
        var previousStatus = PreviousStatus(currentStatus);
        var previousHandler = ResolvePreviousHandler(history, currentActorUserId);
        var returnedToHandler = previousHandler ?? createdByUserId;
        return new HandbackPlan(
            TargetStatusCode: previousStatus ?? "Rejected",
            NewCurrentHandlerId: returnedToHandler,
            NewPreviousHandlerId: currentHandlerUserId ?? currentActorUserId,
            Action: previousStatus is null ? RejectAction : HandbackAction,
            NotifyReturnedHandler: previousStatus is not null && returnedToHandler is long hid && hid > 0 && hid != currentActorUserId);
    }

    public static void AssignAdvanceHandlers(
        ref long? currentHandlerUserId,
        ref long? previousHandlerUserId,
        long? actorUserId)
    {
        if (actorUserId is not long id || id <= 0) return;
        previousHandlerUserId = currentHandlerUserId;
        currentHandlerUserId = id;
    }
}

public record HandbackPlan(
    string TargetStatusCode,
    long? NewCurrentHandlerId,
    long? NewPreviousHandlerId,
    string Action,
    bool NotifyReturnedHandler);
