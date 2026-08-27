import { memo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Search, ShieldCheck, X } from "lucide-react";

import { searchEligibleMembers, type EligibleMember } from "@/services/membership/members";
import { MIN_SUPPORTER_YEARS, type ApplicationDraft } from "@/services/membership/schema";
import type { ErrorMap } from "@/services/membership/useApplication";

type Value = ApplicationDraft["supporters"];
type Role = "proposer" | "seconder";
type SupporterDraft = Record<string, unknown>;

function MemberPicker({
  role,
  value,
  excludeProfileId,
  error,
  onSelect,
  onClear,
}: {
  role: Role;
  value: SupporterDraft;
  excludeProfileId?: string | undefined;
  error?: string | undefined;
  onSelect: (member: EligibleMember) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState("");
  const selectedId = String(value["memberProfileId"] ?? "");
  const term = search.trim();
  const { data: members = [], isFetching } = useQuery({
    queryKey: ["members", "eligible", "membershipNo", term],
    queryFn: () => searchEligibleMembers(term),
    enabled: !selectedId && term.length >= 2,
    staleTime: 60_000,
  });
  const visible = members.filter((member) => member.profileId !== excludeProfileId);

  if (selectedId)
    return (
      <div className="rounded-lg border border-success/40 bg-success/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
            <div>
              <p className="font-medium text-foreground">{String(value["membershipNo"] ?? "")}</p>
              <p className="text-muted-foreground">{String(value["name"] ?? "")}</p>
              <p className="text-muted-foreground">
                Member since {String(value["yearOfJoining"] ?? "")}
              </p>
              <p className="mt-1 text-muted-foreground">
                Eligible club member with at least {MIN_SUPPORTER_YEARS} years of continuous
                membership.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" /> Change
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
        Enter {role} membership no. <span className="text-destructive">*</span>
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. AC-0001"
          autoComplete="off"
          inputMode="text"
          className="w-full rounded-md border border-input bg-background py-2 pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {isFetching && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {term.length > 0 && term.length < 2 ? (
        <p className="text-xs text-muted-foreground">Type at least 2 characters of the membership number.</p>
      ) : null}
      <ul className="max-h-64 divide-y divide-border overflow-auto rounded-md border border-border">
        {term.length < 2 ? (
          <li className="p-3 text-sm text-muted-foreground">
            Search by membership number only. Names are not used because more than one member can
            share the same name.
          </li>
        ) : !visible.length && !isFetching ? (
          <li className="p-3 text-sm text-muted-foreground">
            No member found for this membership number. Confirm the number under Existing members.
          </li>
        ) : (
          visible.map((member) => {
            const canSelect = member.eligible;
            return (
              <li key={member.profileId}>
                <button
                  type="button"
                  disabled={!canSelect}
                  onClick={() => {
                    if (canSelect) onSelect(member);
                  }}
                  className={
                    canSelect
                      ? "flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-secondary"
                      : "flex w-full cursor-not-allowed items-start justify-between gap-3 p-3 text-left text-sm opacity-80"
                  }
                >
                  <span>
                    <span className="block font-medium text-foreground">{member.membershipNo}</span>
                    <span className="block text-muted-foreground">
                      {member.fullName} Â· {member.membershipType} Â· {member.tenureYears} years
                    </span>
                    {!canSelect && member.ineligibleReason ? (
                      <span className="mt-1 flex items-start gap-1 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        {member.ineligibleReason}
                      </span>
                    ) : null}
                  </span>
                  {canSelect ? <Check className="size-4 text-muted-foreground" /> : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="size-3" /> {error}
        </p>
      )}
    </div>
  );
}

function SupporterSelector({
  role,
  value,
  error,
  excludeProfileId,
  onChange,
}: {
  role: Role;
  value: SupporterDraft;
  error?: string | undefined;
  excludeProfileId?: string | undefined;
  onChange: (patch: Partial<SupporterDraft>) => void;
}) {
  const label = role === "proposer" ? "Proposer" : "Seconder";
  return (
    <section className="surface-card space-y-4 p-5">
      <div>
        <h3 className="text-lg">{label}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Find the member by their unique membership number.
        </p>
      </div>
      <MemberPicker
        role={role}
        value={value}
        excludeProfileId={excludeProfileId}
        error={error}
        onSelect={(member) =>
          onChange({
            memberProfileId: member.profileId,
            membershipNo: member.membershipNo,
            name: member.fullName,
            email: member.email,
            phone: member.phone,
            yearOfJoining: String(member.yearOfJoining),
          })
        }
        onClear={() =>
          onChange({
            memberProfileId: "",
            membershipNo: "",
            name: "",
            email: "",
            phone: "",
            yearOfJoining: "",
          })
        }
      />
    </section>
  );
}

export const StepSupporters = memo(function StepSupporters({
  value,
  errors,
  onChange,
}: {
  value: Value;
  errors: ErrorMap;
  onChange: (patch: Partial<Value>) => void;
}) {
  const proposer = value.proposer as SupporterDraft;
  const seconder = value.seconder as SupporterDraft;
  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-border bg-secondary/60 p-4 text-sm text-muted-foreground">
        Select two different existing club members by membership number. Membership numbers are
        unique; names are not used for search because members can share the same name.
      </p>
      <SupporterSelector
        role="proposer"
        value={proposer}
        error={errors["proposer.memberProfileId"]}
        excludeProfileId={String(seconder["memberProfileId"] ?? "") || undefined}
        onChange={(patch) =>
          onChange({ proposer: { ...value.proposer, ...patch } as Value["proposer"] })
        }
      />
      <SupporterSelector
        role="seconder"
        value={seconder}
        error={errors["seconder.memberProfileId"]}
        excludeProfileId={String(proposer["memberProfileId"] ?? "") || undefined}
        onChange={(patch) =>
          onChange({ seconder: { ...value.seconder, ...patch } as Value["seconder"] })
        }
      />
    </div>
  );
});
