namespace ClubManagement.Services.MembershipAccount;

/// <summary>Article 5 / Bye-Laws privilege matrix for membership classes.</summary>
public static class MemberClassPrivileges
{
    public static MemberPrivilegeSet ForCode(string? code)
    {
        var key = (code ?? "").Trim().ToUpperInvariant().Replace(" ", "_").Replace("-", "_");
        return key switch
        {
            "FULL" => PayVoteOfficeGuests(),
            "COUNTRY" => PayVoteOfficeGuests(),
            "OVERSEAS" => new MemberPrivilegeSet(true, true, false, true, 0, "readonly"),
            "LIFE" => new MemberPrivilegeSet(false, true, true, true, 0, "full"),
            "HONORARY" => new MemberPrivilegeSet(false, false, false, false, 0, "readonly"),
            "SENIOR" => PayVoteOfficeGuests(50),
            "SENIOR_LIFE" => new MemberPrivilegeSet(true, true, true, true, 0, "full"),
            "TEMPORARY" or "FOREIGN_AIR_CREW" or "SPECIAL_EVENT" =>
                new MemberPrivilegeSet(false, false, false, false, 0, "hidden"),
            _ => PayVoteOfficeGuests()
        };
    }

    private static MemberPrivilegeSet PayVoteOfficeGuests(int discount = 0) =>
        new(true, true, true, true, discount, "full");
}

public record MemberPrivilegeSet(
    bool PaysSubscription,
    bool CanVote,
    bool CanRunForOffice,
    bool CanIntroduceGuests,
    int SubscriptionDiscountPercent,
    string CommitteeMode);
