using System.Text.Json;

namespace ClubManagement.Services.Finance;

/// <summary>
/// Facts required to price an applicant. The calculator does not load members or schedules.
/// </summary>
public record MembershipFeeFacts(
    long MembershipTypeId,
    string MembershipType,
    decimal StandardEntranceFee,
    decimal StandardAnnualSubscription,
    DateOnly DateOfBirth,
    DateOnly AsOf,
    bool IsChildOfMember,
    string? ParentStatusCode,
    int? ParentContinuousYears);

public record AnnualProration(
    decimal FullAnnual,
    decimal PayableAnnual,
    int RemainingDays,
    int DaysInYear,
    bool IsProrated);

public record EntranceFeeDecision(
    decimal StandardEntranceFee,
    decimal PayableEntranceFee,
    bool Waived,
    string Reason);

public record MembershipFeeCalculation(
    long MembershipTypeId,
    string MembershipType,
    int ApplicantAge,
    EntranceFeeDecision EntranceFee,
    AnnualProration AnnualSubscription,
    DateOnly AsOf);

/// <summary>
/// Inputs for a priced quote. Parent standing is resolved by the finance service when an account is supplied.
/// </summary>
public record ApplicantPathSnapshot(string? Category, int ParentContinuousYears, DateOnly? DateOfBirth);

public record MembershipFeeInquiry(
    long MembershipTypeId,
    DateOnly DateOfBirth,
    DateOnly AsOf,
    bool IsChildOfMember,
    long? ParentAccountId = null,
    string? ParentMembershipNo = null);

/// <summary>
/// Membership entrance and annual fee rules. Pure: same facts always produce the same money.
/// </summary>
public static class MembershipFeeCalculator
{
    public const int EntranceWaiverMinimumAge = 21;
    public const int EntranceWaiverMinimumParentYears = 5;

    public static MembershipFeeCalculation Calculate(MembershipFeeFacts facts)
    {
        if (facts.StandardEntranceFee < 0 || facts.StandardAnnualSubscription < 0)
            throw new InvalidOperationException("Fee schedule amounts cannot be negative.");
        if (facts.DateOfBirth > facts.AsOf)
            throw new InvalidOperationException("Date of birth cannot be after the application date.");

        var age = CompletedYears(facts.DateOfBirth, facts.AsOf);
        var entrance = DecideEntranceFee(
            facts.StandardEntranceFee,
            age,
            facts.IsChildOfMember,
            facts.ParentStatusCode,
            facts.ParentContinuousYears);
        var annual = ProrateAnnual(facts.StandardAnnualSubscription, facts.AsOf);

        return new MembershipFeeCalculation(
            facts.MembershipTypeId,
            facts.MembershipType,
            age,
            entrance,
            annual,
            facts.AsOf);
    }

    /// <summary>
    /// 100% entrance waiver only when the applicant is a child of a member, that parent is ACTIVE
    /// with at least five continuous years at the application date, and the applicant is 21 or older.
    /// Any failed condition charges the full standard entrance fee. The under-30 tariff is not applied here.
    /// </summary>
    public static EntranceFeeDecision DecideEntranceFee(
        decimal standardEntranceFee,
        int applicantAge,
        bool isChildOfMember,
        string? parentStatusCode,
        int? parentContinuousYears)
    {
        var standard = decimal.Round(standardEntranceFee, 2, MidpointRounding.AwayFromZero);
        if (!isChildOfMember)
            return new EntranceFeeDecision(standard, standard, false, "Not a child of a member. Standard entrance fee applies.");

        var parentActive = string.Equals(parentStatusCode?.Trim(), "ACTIVE", StringComparison.OrdinalIgnoreCase);
        var years = parentContinuousYears ?? 0;
        var parentSeasoned = parentActive && years >= EntranceWaiverMinimumParentYears;
        var ofAge = applicantAge >= EntranceWaiverMinimumAge;

        if (parentActive && parentSeasoned && ofAge)
        {
            return new EntranceFeeDecision(
                standard,
                0m,
                true,
                $"Entrance fee waived. Child of an ACTIVE member with {years} continuous years; applicant age {applicantAge}.");
        }

        var failed = new List<string>();
        if (!parentActive)
            failed.Add($"parent status is '{(string.IsNullOrWhiteSpace(parentStatusCode) ? "unknown" : parentStatusCode.Trim())}', not ACTIVE");
        if (years < EntranceWaiverMinimumParentYears)
            failed.Add($"parent continuous membership is {years} year(s), needs {EntranceWaiverMinimumParentYears}");
        if (!ofAge)
            failed.Add($"applicant age is {applicantAge}, needs {EntranceWaiverMinimumAge}");

        return new EntranceFeeDecision(
            standard,
            standard,
            false,
            "Standard entrance fee applies. " + string.Join("; ", failed) + ".");
    }

    /// <summary>
    /// Prorated annual = (remaining days in the joining year / days in that year) × full annual.
    /// Remaining days include the application date through 31 December.
    /// A non-leap year has 365 days; a leap year has 366. Joining on 1 January charges the full annual.
    /// </summary>
    public static AnnualProration ProrateAnnual(decimal fullAnnual, DateOnly asOf)
    {
        var full = decimal.Round(fullAnnual, 2, MidpointRounding.AwayFromZero);
        if (full <= 0)
            return new AnnualProration(0m, 0m, DaysRemainingInYear(asOf), DaysInYear(asOf), false);

        var daysInYear = DaysInYear(asOf);
        var remaining = DaysRemainingInYear(asOf);
        if (remaining >= daysInYear)
            return new AnnualProration(full, full, remaining, daysInYear, false);

        var prorated = decimal.Round(remaining / (decimal)daysInYear * full, 2, MidpointRounding.AwayFromZero);
        return new AnnualProration(full, prorated, remaining, daysInYear, prorated < full);
    }

    public static int CompletedYears(DateOnly from, DateOnly asOf)
    {
        var years = asOf.Year - from.Year;
        if (asOf < from.AddYears(years))
            years--;
        return years < 0 ? 0 : years;
    }

    public static int DaysInYear(DateOnly asOf)
    {
        var start = new DateOnly(asOf.Year, 1, 1);
        var end = new DateOnly(asOf.Year, 12, 31);
        return end.DayNumber - start.DayNumber + 1;
    }

    public static bool IsChildOfMember(string? formDataJson) =>
        string.Equals(ReadApplicationPath(formDataJson)?.Category, "CHILD_OF_MEMBER", StringComparison.OrdinalIgnoreCase);

    public static bool EntranceWaiverApplies(string? formDataJson, DateOnly asOf)
    {
        var path = ReadApplicationPath(formDataJson);
        if (path is null || !string.Equals(path.Category, "CHILD_OF_MEMBER", StringComparison.OrdinalIgnoreCase))
            return false;
        if (path.ParentContinuousYears < EntranceWaiverMinimumParentYears)
            return false;
        if (path.DateOfBirth is not DateOnly dob)
            return false;
        return CompletedYears(dob, asOf) >= EntranceWaiverMinimumAge;
    }

    public static ApplicantPathSnapshot? ReadApplicationPath(string? formDataJson)
    {
        if (string.IsNullOrWhiteSpace(formDataJson)) return null;
        try
        {
            using var doc = JsonDocument.Parse(formDataJson);
            if (!doc.RootElement.TryGetProperty("applicationPath", out var path) || path.ValueKind != JsonValueKind.Object)
                return null;
            var category = path.TryGetProperty("category", out var categoryEl) ? categoryEl.GetString() : null;
            var years = path.TryGetProperty("parentContinuousYears", out var yearsEl) && yearsEl.TryGetInt32(out var n) ? n : 0;
            DateOnly? dob = null;
            if (doc.RootElement.TryGetProperty("personal", out var personal)
                && personal.TryGetProperty("dateOfBirth", out var dobEl)
                && DateOnly.TryParse(dobEl.GetString(), out var parsed))
                dob = parsed;
            return new ApplicantPathSnapshot(category, years, dob);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static int DaysRemainingInYear(DateOnly asOf)
    {
        var end = new DateOnly(asOf.Year, 12, 31);
        var remaining = end.DayNumber - asOf.DayNumber + 1;
        var daysInYear = DaysInYear(asOf);
        if (remaining < 1) return 1;
        if (remaining > daysInYear) return daysInYear;
        return remaining;
    }
}
