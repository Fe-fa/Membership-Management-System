namespace ClubManagement.DTOs.Committee;

public class AttachInterviewRequest
{
    public long ApplicationId { get; set; }
}

public class SaveInterviewOutcomeRequest
{
    /// <summary>Positive | Negative | Deferred</summary>
    public string Outcome { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public bool Attended { get; set; } = true;
    public long? InterviewerProfileId { get; set; }
}

public class MeetingInterviewDto
{
    public long InterviewId { get; set; }
    public long ApplicationId { get; set; }
    public string ApplicationNo { get; set; } = string.Empty;
    public string ApplicantName { get; set; } = string.Empty;
    public string? StatusCode { get; set; }
    public string? StatusName { get; set; }
    public long? CommitteeMeetingId { get; set; }
    public DateTime? ScheduledAt { get; set; }
    public DateTime? ConductedAt { get; set; }
    public long? InterviewerProfileId { get; set; }
    public bool AttendedFlag { get; set; }
    public string? Outcome { get; set; }
    public string? Notes { get; set; }
    public bool OutcomeRecorded { get; set; }
}

public class InterviewCandidateDto
{
    public long ApplicationId { get; set; }
    public string ApplicationNo { get; set; } = string.Empty;
    public string ApplicantName { get; set; } = string.Empty;
    public string? StatusCode { get; set; }
    public string? StatusName { get; set; }
    public bool AlreadyLinked { get; set; }
}
