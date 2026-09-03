import { getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LogOut, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import heroImage from "@/assets/acea-hero.jpg";
import { ListPagination } from "@/components/common/ListPagination";
import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canOperateReception, isReceptionistOnly, readUser } from "@/lib/auth";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { DEFAULT_PAGE_SIZE, emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import { cn } from "@/utils/cn";

const routeApi = getRouteApi("/reception");

type ReceptionMember = {
  profileId: number;
  membershipNo: string;
  fullName: string;
};

type GuestLookup = {
  guestId: number;
  guestName: string;
  phone?: string | null;
  email?: string | null;
  idNumber?: string | null;
  firstVisitDate?: string | null;
  visitSlipCode?: string | null;
  introducedByProfileId?: number | null;
  introducedByName?: string | null;
  visitCount: number;
  visitsThisMonth?: number;
  visitsThisYear?: number;
  isBarred: boolean;
  barredReason?: string | null;
  hasApplicantProfile: boolean;
};

type ReceptionVisit = {
  visitId: number;
  guestId: number;
  guestName: string;
  phone?: string | null;
  visitSlipCode?: string | null;
  visitCount: number;
  visitDate: string;
  timeIn?: string | null;
  timeOut?: string | null;
  isCurrent: boolean;
  guestBookEntryNo?: string | null;
  accompanyingProfileId: number;
  accompanyingMemberName: string;
  introducedByName?: string | null;
  staffName?: string | null;
  notes?: string | null;
};

const LIMITS = { month: 2, year: 12, onSite: 6 };

export function ReceptionDashboardPage() {
  const user = readUser();
  const canOperate = canOperateReception(user);
  const receptionHome = isReceptionistOnly(user);
  const searchParams = routeApi.useSearch();
  const section = "section" in searchParams ? String(searchParams.section ?? "") : "";

  const queryClient = useQueryClient();

  const [lookupName, setLookupName] = useState("");
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupSlip, setLookupSlip] = useState("");
  const [matches, setMatches] = useState<GuestLookup[]>([]);
  const [selected, setSelected] = useState<GuestLookup | null>(null);

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestIdNumber, setGuestIdNumber] = useState("");
  const [firstVisitDate, setFirstVisitDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const [introduceMemberSearch, setIntroduceMemberSearch] = useState("");
  const [debouncedIntroduceMemberSearch, setDebouncedIntroduceMemberSearch] =
    useState("");
  const [introduceMemberId, setIntroduceMemberId] = useState("");
  const [confirmIntroduceMember, setConfirmIntroduceMember] = useState(false);

  const [memberId, setMemberId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [guestBookNo, setGuestBookNo] = useState("");
  const [notes, setNotes] = useState("");
  const [visitPage, setVisitPage] = useState(1);
  const [visitPageSize, setVisitPageSize] = useState(DEFAULT_PAGE_SIZE);

  const members = useQuery({
    queryKey: ["reception-members"],
    queryFn: () => apiRequest<ReceptionMember[]>("/api/reception/members"),
    enabled: canOperate,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedIntroduceMemberSearch(introduceMemberSearch.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [introduceMemberSearch]);

  const introduceMemberQuery = useQuery({
    queryKey: [
      "reception-introduce-members",
      debouncedIntroduceMemberSearch,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        search: debouncedIntroduceMemberSearch,
      });

      return apiRequest<ReceptionMember[]>(
        `/api/reception/members?${params.toString()}`,
      );
    },
    enabled:
      canOperate && debouncedIntroduceMemberSearch.length >= 2,
  });

  const visits = useQuery({
    queryKey: ["reception-visits", visitPage, visitPageSize],
    queryFn: () =>
      apiRequest<PagedResult<ReceptionVisit>>(
        `/api/reception/visits?${pagedQuery({ page: visitPage, pageSize: visitPageSize })}`,
      ),
  });

  useEffect(() => {
    const id =
      section === "visit"
        ? "reception-visit"
        : section === "onsite"
          ? "reception-onsite"
          : section === "policy"
            ? "reception-policy"
            : "reception-lookup";

    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [section]);

  const memberLabel = useMemo(() => {
    const map = new Map<number, string>();

    for (const row of members.data ?? []) {
      map.set(row.profileId, `${row.fullName} (${row.membershipNo})`);
    }

    return map;
  }, [members.data]);

  const hosts = members.data ?? [];

  const filteredHosts = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();

    if (!query) {
      return hosts;
    }

    return hosts.filter((row) =>
      `${row.fullName} ${row.membershipNo}`
        .toLowerCase()
        .includes(query),
    );
  }, [hosts, memberSearch]);

  const search = useMutation({
    mutationFn: (slipOnly?: string) => {
      const params = new URLSearchParams();
      const slip = (slipOnly ?? lookupSlip).trim();

      if (!slipOnly && lookupName.trim()) {
        params.set("name", lookupName.trim());
      }

      if (!slipOnly && lookupPhone.trim()) {
        params.set("phone", lookupPhone.trim());
      }

      if (slip) {
        params.set("visitSlipCode", slip);
      }

      return apiRequest<GuestLookup[]>(
        `/api/reception/guests?${params.toString()}`,
      );
    },

    onSuccess: (rows) => {
      setMatches(rows);

      if (rows.length === 1) {
        applyGuest(rows[0]);

        toast.success(
          `Found ${rows[0].guestName} — ${rows[0].visitCount}/3 visits.`,
        );
      } else if (rows.length === 0) {
        setSelected(null);

        toast.message(
          "No guest record yet. Add a new guest, then log the visit.",
        );
      } else {
        setSelected(null);

        toast.message(
          "Several guests match. Select one from the results.",
        );
      }
    },

    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const createGuest = useMutation({
    mutationFn: () => {
      if (!introduceMemberId) {
        throw new Error(
          "Search for and select the introducing member first.",
        );
      }

      if (!confirmIntroduceMember) {
        throw new Error(
          "Confirm the selected introducing member first.",
        );
      }

      return apiRequest<GuestLookup>("/api/reception/guests", {
        method: "POST",
        body: JSON.stringify({
          guestName: guestName.trim() || lookupName.trim(),
          phone: (guestPhone.trim() || lookupPhone.trim()) || null,
          email: guestEmail.trim() || null,
          idNumber: guestIdNumber.trim() || null,
          firstVisitDate:
            firstVisitDate ||
            new Date().toISOString().slice(0, 10),
          introducedByProfileId: Number(introduceMemberId),
        }),
      });
    },

    onSuccess: (guest) => {
      applyGuest(guest);
      setMatches([guest]);
      setConfirmIntroduceMember(false);

      void queryClient.invalidateQueries({
        queryKey: ["reception-members"],
      });

      toast.success(
        `Guest saved. Visit slip ${guest.visitSlipCode ?? "—"}.`,
      );
    },

    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const logVisit = useMutation({
    mutationFn: () => {
      if (!selected) {
        throw new Error("Look up or add a guest first.");
      }

      if (!memberId) {
        throw new Error("Select the member on site.");
      }

      return apiRequest<ReceptionVisit>("/api/reception/visits", {
        method: "POST",
        body: JSON.stringify({
          guestId: selected.guestId,
          accompanyingProfileId: Number(memberId),
          guestBookEntryNo:
            guestBookNo.trim() ||
            selected.visitSlipCode ||
            lookupSlip.trim(),
          notes: notes.trim() || null,
        }),
      });
    },

    onSuccess: (visit) => {
      toast.success(
        `Visit logged. Slip ${visit.visitSlipCode ?? "—"} — give this to the guest.`,
      );

      setNotes("");

      void queryClient.invalidateQueries({
        queryKey: ["reception-visits"],
      });

      if (selected) {
        setSelected({
          ...selected,
          visitCount: visit.visitCount,
          visitSlipCode: visit.visitSlipCode,
        });
      }
    },

    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const signOut = useMutation({
    mutationFn: (visitId: number) =>
      apiRequest<ReceptionVisit>(
        `/api/reception/visits/${visitId}/sign-out`,
        { method: "POST" },
      ),

    onSuccess: () => {
      toast.success("Guest signed out.");

      void queryClient.invalidateQueries({
        queryKey: ["reception-visits"],
      });
    },

    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  function applyGuest(guest: GuestLookup) {
    setSelected(guest);

    setGuestName(guest.guestName);
    setGuestPhone(guest.phone ?? "");
    setGuestEmail(guest.email ?? "");
    setGuestIdNumber(guest.idNumber ?? "");
    setFirstVisitDate(
      guest.firstVisitDate ??
        new Date().toISOString().slice(0, 10),
    );

    setLookupName(guest.guestName);
    setLookupPhone(guest.phone ?? "");
    setLookupSlip(guest.visitSlipCode ?? "");

    if (guest.introducedByProfileId) {
      const introducedMemberId = String(
        guest.introducedByProfileId,
      );

      const introducedMemberLabel =
        memberLabel.get(guest.introducedByProfileId) ??
        guest.introducedByName ??
        "";

      setIntroduceMemberId(introducedMemberId);
      setIntroduceMemberSearch(introducedMemberLabel);
      setConfirmIntroduceMember(false);

      setMemberId(introducedMemberId);
      setMemberSearch(introducedMemberLabel);
    }
  }

  const visitPageData = visits.data ?? emptyPage<ReceptionVisit>(visitPage, visitPageSize);
  const rows = visitPageData.items;
  const onSite = rows.filter((row) => row.isCurrent);

  const onSiteForMember = memberId
    ? onSite.filter(
        (row) => String(row.accompanyingProfileId) === memberId,
      ).length
    : onSite.length;

  const monthUsed = selected?.visitsThisMonth ?? 0;
  const yearUsed = selected?.visitsThisYear ?? 0;

  const overLimit =
    monthUsed >= LIMITS.month ||
    yearUsed >= LIMITS.year ||
    onSiteForMember >= LIMITS.onSite ||
    Boolean(selected?.isBarred);

  if (!canOperate) {
    return (
      <PageFrame width="lg">
        <PageBackLink
          to="/admin"
          label="Back to admin dashboard"
        />

        <PageHeader
          title="Guest visits"
          description="Guests in the club and the member who accompanied them. Reception logs visits; this view is read-only."
        />

        <OnSiteTable rows={rows} />
        <ListPagination
          page={visitPage}
          pageSize={visitPageSize}
          totalCount={visitPageData.totalCount}
          totalPages={visitPageData.totalPages}
          onPageChange={setVisitPage}
          onPageSizeChange={setVisitPageSize}
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame width="lg">
      {receptionHome ? null : (
        <PageBackLink
          to="/admin"
          label="Back to admin dashboard"
        />
      )}

      <section className="relative overflow-hidden rounded-2xl">
        <img
          src={heroImage}
          alt=""
          width={1600}
          height={900}
          className="h-40 w-full object-cover sm:h-52"
        />

        <div className="absolute inset-0 bg-gradient-to-r from-primary/85 via-primary/45 to-transparent" />

        <h1 className="absolute inset-0 flex items-center px-6 font-sans text-2xl font-semibold tracking-tight text-white sm:px-8 sm:text-3xl">
          Reception dashboard
        </h1>
      </section>

      <p className="-mt-2 text-sm text-muted-foreground">
        Register guests with optional ID / Passport details for deduplication.
        Visit logging does not collect ID / Passport.
      </p>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <section
            id="reception-lookup"
            className="scroll-mt-24 space-y-4 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Search</h2>
            </div>

            <form
              className="grid gap-3 sm:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                search.mutate(undefined);
              }}
            >
              <Field label="Guest name">
                <Input
                  value={lookupName}
                  onChange={(e) => setLookupName(e.target.value)}
                  placeholder="e.g. Festus"
                />
              </Field>

              <Field label="Phone (optional)">
                <Input
                  value={lookupPhone}
                  onChange={(e) => setLookupPhone(e.target.value)}
                  placeholder="0740…"
                />
              </Field>

              <Field label="Visit slip code">
                <Input
                  value={lookupSlip}
                  onChange={(e) => setLookupSlip(e.target.value)}
                  placeholder="ACEA-XXXXXX"
                />
              </Field>

              <div className="sm:col-span-3">
                <Button
                  type="submit"
                  disabled={search.isPending}
                >
                  <Search className="size-4" />
                  {search.isPending
                    ? "Checking…"
                    : "Check Guest Records"}
                </Button>
              </div>
            </form>

            <div className="overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-4 gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Guest name</span>
                <span>Member</span>
                <span>Phone</span>
                <span>3-visit counter</span>
              </div>

              {matches.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  No results yet. Check guest records to fill this table.
                </p>
              ) : (
                matches.map((row) => (
                  <button
                    key={row.guestId}
                    type="button"
                    onClick={() => applyGuest(row)}
                    className={cn(
                      "grid w-full grid-cols-4 gap-2 border-t border-border px-3 py-2.5 text-left text-sm hover:bg-muted/40",
                      selected?.guestId === row.guestId &&
                        "bg-primary/5",
                    )}
                  >
                    <span className="font-medium">
                      {row.guestName}
                    </span>

                    <span>{row.introducedByName ?? "—"}</span>
                    <span>{row.phone ?? "—"}</span>

                    <span
                      className={
                        row.visitCount >= 3
                          ? "text-emerald-700"
                          : "text-muted-foreground"
                      }
                    >
                      {row.visitCount}/3
                    </span>
                  </button>
                ))
              )}
            </div>

            <form
              className="grid gap-3 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                createGuest.mutate();
              }}
            >
              <Field label="Full Name">
                <Input
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              </Field>

              <Field label="Phone Number">
                <Input
                  required
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                />
              </Field>

              <Field label="Email (optional at this stage)">
                <Input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                />
              </Field>

              <Field label="ID/Passport Number (optional, for dedupe)">
                <Input
                  value={guestIdNumber}
                  onChange={(e) => setGuestIdNumber(e.target.value)}
                />
              </Field>

              <Field label="Date of first visit">
                <Input
                  type="date"
                  required
                  value={firstVisitDate}
                  onChange={(e) => setFirstVisitDate(e.target.value)}
                />
              </Field>

              <Field label="Introduce Member">
                <Input
                  required
                  value={introduceMemberSearch}
                  onChange={(e) => {
                    setIntroduceMemberSearch(e.target.value);
                    setIntroduceMemberId("");
                    setConfirmIntroduceMember(false);
                  }}
                  placeholder="Search existing member by name or membership number"
                />

                <div className="max-h-40 overflow-y-auto rounded-md border border-input bg-background">
                  {!canOperate ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      You do not have permission to search members.
                    </p>
                  ) : introduceMemberSearch.trim().length < 2 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      Enter at least 2 characters to search.
                    </p>
                  ) : introduceMemberQuery.isPending ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      Searching members…
                    </p>
                  ) : introduceMemberQuery.isError ? (
                    <p className="px-3 py-2 text-xs text-destructive">
                      Unable to search members.
                    </p>
                  ) : (introduceMemberQuery.data ?? []).length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      No existing member found.
                    </p>
                  ) : (
                    introduceMemberQuery.data?.map((row) => (
                      <button
                        key={row.profileId}
                        type="button"
                        className={cn(
                          "block w-full px-3 py-2 text-left text-sm hover:bg-muted/40",
                          String(row.profileId) ===
                            introduceMemberId && "bg-primary/5",
                        )}
                        onClick={() => {
                          setIntroduceMemberId(
                            String(row.profileId),
                          );
                          setIntroduceMemberSearch(
                            `${row.fullName} (${row.membershipNo})`,
                          );
                          setConfirmIntroduceMember(false);
                        }}
                      >
                        {row.fullName} ({row.membershipNo})
                      </button>
                    ))
                  )}
                </div>
              </Field>

              <div className="flex items-end">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={
                    createGuest.isPending ||
                    Boolean(selected?.isBarred) ||
                    !introduceMemberId ||
                    !confirmIntroduceMember
                  }
                >
                  {createGuest.isPending
                    ? "Saving…"
                    : "Add New Guest"}
                </Button>
              </div>

              {introduceMemberId ? (
                <label className="flex items-start gap-2 text-xs text-muted-foreground sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={confirmIntroduceMember}
                    onChange={(e) =>
                      setConfirmIntroduceMember(e.target.checked)
                    }
                    className="mt-0.5"
                  />

                  <span>
                    Confirm that{" "}
                    <strong className="text-foreground">
                      {introduceMemberSearch}
                    </strong>{" "}
                    is the member introducing this guest.
                  </span>
                </label>
              ) : null}
            </form>

            {selected?.isBarred ? (
              <p className="text-sm text-destructive">
                Barred — may not be re-introduced
                {selected.barredReason
                  ? `: ${selected.barredReason}`
                  : "."}
              </p>
            ) : null}
          </section>

          <section
            id="reception-visit"
            className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-card p-4"
          >
            <h2 className="text-sm font-semibold">Log visit</h2>

            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                logVisit.mutate();
              }}
            >
              <Field label="Introducing / accompanying member">
                <Input
                  required
                  value={memberSearch}
                  onChange={(e) => {
                    setMemberSearch(e.target.value);
                    setMemberId("");
                  }}
                  placeholder="Search by member name or number"
                />

                <div className="max-h-48 overflow-y-auto rounded-md border border-input bg-background">
                  {filteredHosts.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      No members found.
                    </p>
                  ) : (
                    filteredHosts.map((row) => (
                      <button
                        key={row.profileId}
                        type="button"
                        className={cn(
                          "block w-full px-3 py-2 text-left text-sm hover:bg-muted/40",
                          String(row.profileId) === memberId &&
                            "bg-primary/5",
                        )}
                        onClick={() => {
                          setMemberId(String(row.profileId));
                          setMemberSearch(
                            memberLabel.get(row.profileId) ?? "",
                          );
                        }}
                      >
                        {memberLabel.get(row.profileId)}
                      </button>
                    ))
                  )}
                </div>
              </Field>

              <Field label="Visit slip code">
                <div className="flex gap-2">
                  <Input
                    value={lookupSlip}
                    onChange={(e) => setLookupSlip(e.target.value)}
                  />

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => search.mutate(lookupSlip)}
                  >
                    Lookup
                  </Button>
                </div>
              </Field>

              <Field label="Guest Book entry number">
                <Input
                  value={guestBookNo}
                  onChange={(e) => setGuestBookNo(e.target.value)}
                  placeholder="Matches the physical book"
                />
              </Field>

              <Field label="Notes (optional)">
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>

              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  disabled={
                    logVisit.isPending ||
                    !selected ||
                    selected.isBarred
                  }
                >
                  {logVisit.isPending ? "Logging…" : "Log Visit"}
                </Button>
              </div>
            </form>
          </section>
        </div>

        <aside
          id="reception-policy"
          className="scroll-mt-24 h-fit space-y-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={cn(
                "size-4",
                overLimit
                  ? "text-destructive"
                  : "text-amber-500",
              )}
            />

            <h2 className="text-sm font-semibold">
              Visit Policy & Alert
            </h2>
          </div>

          <PolicyBar
            label="2 visits/mo"
            used={monthUsed}
            max={LIMITS.month}
          />

          <PolicyBar
            label="12/yr"
            used={yearUsed}
            max={LIMITS.year}
          />

          <PolicyBar
            label="6 on-site"
            used={onSiteForMember}
            max={LIMITS.onSite}
          />

          {selected ? (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {selected.guestName}: {selected.visitCount}/3 visits toward
              registration.
            </p>
          ) : null}
        </aside>
      </div>

      <section
        id="reception-onsite"
        className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">
          Guests on site ({onSite.length})
        </h2>

        <OnSiteTable
          rows={onSite}
          actions={
            canOperate
              ? (row) => (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => signOut.mutate(row.visitId)}
                    disabled={signOut.isPending}
                  >
                    <LogOut className="size-3.5" />
                    Time out
                  </Button>
                )
              : undefined
          }
        />
        <ListPagination
          page={visitPage}
          pageSize={visitPageSize}
          totalCount={visitPageData.totalCount}
          totalPages={visitPageData.totalPages}
          onPageChange={setVisitPage}
          onPageSizeChange={setVisitPageSize}
        />
      </section>
    </PageFrame>
  );
}

function OnSiteTable({
  rows,
  actions,
}: {
  rows: ReceptionVisit[];
  actions?: (row: ReceptionVisit) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No guests currently signed in.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Guest name</th>
            <th className="py-2 pr-3 font-medium">Member</th>
            <th className="py-2 pr-3 font-medium">Phone</th>
            <th className="py-2 pr-3 font-medium">3-visit counter</th>
            <th className="py-2 pr-3 font-medium">Time in</th>
            <th className="py-2 pr-3 font-medium">Visit code</th>
            {actions ? (
              <th className="py-2 font-medium">Actions</th>
            ) : null}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr
              key={row.visitId}
              className="border-b border-border last:border-0"
            >
              <td className="py-2.5 pr-3 font-medium">
                {row.guestName}
              </td>

              <td className="py-2.5 pr-3">
                {row.accompanyingMemberName ||
                  row.introducedByName ||
                  "—"}
              </td>

              <td className="py-2.5 pr-3">
                {row.phone ?? "—"}
              </td>

              <td className="py-2.5 pr-3">
                {row.visitCount}/3
              </td>

              <td className="py-2.5 pr-3">
                {formatTime(row.timeIn)}
              </td>

              <td className="py-2.5 pr-3 font-mono text-xs">
                {row.visitSlipCode ??
                  row.guestBookEntryNo ??
                  "—"}
              </td>

              {actions ? (
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-full bg-muted text-muted-foreground">
                      <UserRound className="size-3.5" />
                    </span>

                    {actions(row)}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PolicyBar({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max: number;
}) {
  const ratio = Math.min(1, used / Math.max(max, 1));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>

        <span
          className={
            used >= max ? "font-medium text-destructive" : ""
          }
        >
          {used}/{max}
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            used >= max ? "bg-destructive" : "bg-primary",
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>

      {children}
    </label>
  );
}

function formatTime(value?: string | null) {
  if (!value) return "—";

  const [hours, minutes] = value.split(":");
  const hour = Number(hours);

  if (Number.isNaN(hour)) {
    return value;
  }

  const suffix = hour >= 12 ? "PM" : "AM";

  return `${hour % 12 || 12}:${minutes ?? "00"} ${suffix}`;
}
