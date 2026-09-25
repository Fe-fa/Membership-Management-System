using System.Text.Json;

namespace ClubManagement.Services.Finance;

public enum ProrationMode
{
    Daily,
    Monthly
}

public record MembershipFeeFacts(
    long MembershipTypeId,
    string MembershipType,
    decimal StandardEntranceFee,
    decimal StandardAnnualSubscription,
    DateOnly DateOfBirth,
    DateOnly AsOf,
    bool IsChildOfMember,
    string? ParentStatusCode,
    int? ParentContinuousYears,
    ProrationMode ProrationMode = ProrationMode.Daily);

/// <summary>
/// Result of prorating the first-year annual subscription.
/// RemainingDays / DaysInYear are always populated (also in Monthly mode) so
/// documents and quotes can display the full breakdown either way.
/// </summary>
public record AnnualProration(
    decimal FullAnnual,
    decimal PayableAnnual,
    int RemainingDays,
    int DaysInYear,
    bool IsProrated,
    ProrationMode Mode = ProrationMode.Daily,
    int RemainingMonths = 12,
    int MonthsInYear = 12);

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
public record ApplicantPathSnapshot(string? Category, int ParentContinuousYears, DateOnly? DateOfBirth);

public record MembershipFeeInquiry(
    long MembershipTypeId,
    DateOnly DateOfBirth,
    DateOnly AsOf,
    bool IsChildOfMember,
    long? ParentAccountId = null,
    string? ParentMembershipNo = null);

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
        var annual = ProrateAnnual(facts.StandardAnnualSubscription, facts.AsOf, facts.ProrationMode);

        return new MembershipFeeCalculation(
            facts.MembershipTypeId,
            facts.MembershipType,
            age,
            entrance,
            annual,
            facts.AsOf);
    }
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
    /// Prorates the first-year annual subscription against 31 December of the join year.
    ///
    ///   Daily   : Payable = Round(FullAnnual / DaysInYear(asOf) x DaysRemaining, 2)
    ///             - DaysInYear(asOf) is 365, or 366 when the JOIN year is a leap year,
    ///               so the divisor always follows the leap status of the billing period.
    ///             - DaysRemaining counts the join day through 31 December, both inclusive.
    ///   Monthly : Payable = Round(FullAnnual / 12 x MonthsRemaining, 2)
    ///             - MonthsRemaining = 13 - join month; the join month is billed in full.
    ///
    /// Rounding is half away from zero ("commercial" half-up), applied exactly once at the
    /// end. The product full x units is an exact decimal, so a single division followed by a
    /// single round is equivalent to exact rational arithmetic - no double rounding.
    /// </summary>
    public static AnnualProration ProrateAnnual(decimal fullAnnual, DateOnly asOf, ProrationMode mode = ProrationMode.Daily)
    {
        var full = decimal.Round(fullAnnual, 2, MidpointRounding.AwayFromZero);
        var daysInYear = DaysInYear(asOf);
        var remainingDays = DaysRemainingInYear(asOf);
        var remainingMonths = RemainingMonthsInYear(asOf);

        if (full <= 0)
            return new AnnualProration(0m, 0m, remainingDays, daysInYear, false, mode, remainingMonths, 12);

        return mode == ProrationMode.Monthly
            ? ProrateMonthly(full, remainingDays, daysInYear, remainingMonths)
            : ProrateDaily(full, remainingDays, daysInYear, remainingMonths);
    }

    private static AnnualProration ProrateDaily(decimal full, int remainingDays, int daysInYear, int remainingMonths)
    {
        if (remainingDays >= daysInYear)
            return new AnnualProration(full, full, remainingDays, daysInYear, false, ProrationMode.Daily, remainingMonths, 12);

        // full * remainingDays is an exact decimal; a single division keeps one rounding point
        // (previously days/(decimal)daysInYear * full rounded twice and could drift a half-cent).
        var prorated = decimal.Round(full * remainingDays / daysInYear, 2, MidpointRounding.AwayFromZero);
        return new AnnualProration(full, prorated, remainingDays, daysInYear, prorated < full, ProrationMode.Daily, remainingMonths, 12);
    }

    private static AnnualProration ProrateMonthly(decimal full, int remainingDays, int daysInYear, int remainingMonths)
    {
        if (remainingMonths >= 12)
            return new AnnualProration(full, full, remainingDays, daysInYear, false, ProrationMode.Monthly, remainingMonths, 12);

        var prorated = decimal.Round(full * remainingMonths / 12m, 2, MidpointRounding.AwayFromZero);
        return new AnnualProration(full, prorated, remainingDays, daysInYear, prorated < full, ProrationMode.Monthly, remainingMonths, 12);
    }

    /// <summary>
    /// Remaining months in the year, counting the join month as a full month
    /// (e.g. joining any day in September still bills September through December = 4 months).
    /// </summary>
    public static int RemainingMonthsInYear(DateOnly asOf) => 13 - asOf.Month;

    public static int CompletedYears(DateOnly from, DateOnly asOf)
    {
        var years = asOf.Year - from.Year;
        if (asOf < from.AddYears(years))
            years--;
        return years < 0 ? 0 : years;
    }

    /// <summary>365, or 366 when the year of <paramref name="asOf"/> (the billing period year) is a leap year.</summary>
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

    /// <summary>
    /// Days from <paramref name="asOf"/> through 31 December of that year, both inclusive,
    /// clamped to [1, DaysInYear]. A 1 January join therefore yields the full year and no
    /// proration; 31 December yields a single billable day.
    /// </summary>
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
