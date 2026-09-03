using ClubManagement.Services.MembershipApplication;
using Xunit;

namespace ClubManagement.Tests;

public class ApplicationWorkflowRouterTests
{
    [Theory]
    [InlineData("EndorsementReview", "Endorsement")]
    [InlineData("InterviewReview", "Interview")]
    [InlineData("ElectionReview", "Waitlist")]
    [InlineData("CommitteeReview", "Committee")]
    [InlineData("Interview", "EndorsementReview")]
    [InlineData("Waitlist", "InterviewReview")]
    [InlineData("Committee", "ElectionReview")]
    [InlineData("TemporaryMember", "InterviewReview")]
    [InlineData("Endorsement", "UnderReview")]
    [InlineData("UnderReview", "Submitted")]
    public void PreviousStatus_returns_the_prior_stage(string current, string expected) =>
        Assert.Equal(expected, ApplicationWorkflowRouter.PreviousStatus(current));

    [Fact]
    public void Reject_at_review_level_routes_to_previous_handler_not_a_new_reviewer()
    {
        var t0 = DateTime.UtcNow.AddHours(-3);
        var history = new[]
        {
            new WorkflowHistoryEntry(11, "Submitted", t0),
            new WorkflowHistoryEntry(22, "UnderReview", t0.AddHours(1)),
            new WorkflowHistoryEntry(22, "Endorsement", t0.AddHours(2)),
            new WorkflowHistoryEntry(33, "EndorsementReview", t0.AddHours(3)),
        };

        var plan = ApplicationWorkflowRouter.PlanReject(
            currentStatus: "EndorsementReview",
            history,
            currentActorUserId: 33,
            currentHandlerUserId: 33,
            createdByUserId: 11);

        Assert.Equal("Endorsement", plan.TargetStatusCode);
        Assert.Equal(22, plan.NewCurrentHandlerId);
        Assert.Equal(33, plan.NewPreviousHandlerId);
        Assert.Equal(ApplicationWorkflowRouter.HandbackAction, plan.Action);
        Assert.True(plan.NotifyReturnedHandler);
        Assert.NotEqual(99, plan.NewCurrentHandlerId);
    }

    [Fact]
    public void Reject_with_no_previous_stage_is_terminal()
    {
        var plan = ApplicationWorkflowRouter.PlanReject(
            "Approved",
            [new WorkflowHistoryEntry(5, "Approved", DateTime.UtcNow)],
            currentActorUserId: 5,
            currentHandlerUserId: 5,
            createdByUserId: 1);

        Assert.Equal("Rejected", plan.TargetStatusCode);
        Assert.Equal(ApplicationWorkflowRouter.RejectAction, plan.Action);
        Assert.False(plan.NotifyReturnedHandler);
    }

    [Fact]
    public void ResolvePreviousHandler_skips_the_current_actor()
    {
        var now = DateTime.UtcNow;
        var id = ApplicationWorkflowRouter.ResolvePreviousHandler(
            [
                new WorkflowHistoryEntry(9, "EndorsementReview", now),
                new WorkflowHistoryEntry(4, "Endorsement", now.AddMinutes(-1)),
            ],
            currentActorUserId: 9);

        Assert.Equal(4, id);
    }
}
