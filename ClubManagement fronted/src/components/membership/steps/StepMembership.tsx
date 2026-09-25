import { memo } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/utils/cn";
import { formatKes } from "@/utils/format";
import { SectionTitle, SignatureField, TextField } from "../fields";
import { apiRequest } from "@/services/membership/api";
import { fetchMembershipTypes, type MembershipTypeOption } from "@/services/membership/membershipTypes";
import type { ApplicationDraft } from "@/services/membership/schema";
import type { ErrorMap } from "@/services/membership/useApplication";

type Value = ApplicationDraft["membership"];

type FeeQuote = {
  membershipTypeId: number;
  membershipType: string;
  joiningFee: number;
  joiningFeeUnder30: number;
  annualSubscription: number;
  payableJoining: number;
  payableAnnual: number;
  halfYear: boolean;
};

function money(value?: number | null) {
  return formatKes(Number(value ?? 0));
}

export const StepMembership = memo(function StepMembership({
  value,
  errors,
  onChange,
  dateOfBirth,
  membershipNo,
  onMembershipNoChange,
  existingMemberMode = false,
}: {
  value: Value;
  errors: ErrorMap;
  onChange: (patch: Partial<Value>) => void;
  dateOfBirth?: string;
  membershipNo?: string;
  onMembershipNoChange?: (value: string) => void;
  existingMemberMode?: boolean;
}) {
  const { data: types = [], isLoading } = useQuery({
    queryKey: ["membership-types", existingMemberMode ? "all" : "applicant"],
    queryFn: () => fetchMembershipTypes({ applicantOnly: !existingMemberMode }),
    staleTime: 5 * 60_000,
  });
  const selected = String(value.membershipType ?? "");
  const selectedType = types.find((type) => type.code === selected);
  const typeId = selectedType?.membershipTypeId;
  const dob = (dateOfBirth ?? "").slice(0, 10);
  const canQuote = !existingMemberMode && Boolean(typeId) && /^\d{4}-\d{2}-\d{2}$/.test(dob);

  const quote = useQuery({
    queryKey: ["membership-fee-quote", typeId, dob],
    queryFn: () =>
      apiRequest<FeeQuote>(
        `/api/finance/quote?membershipTypeId=${typeId}&dateOfBirth=${encodeURIComponent(dob)}`,
      ),
    enabled: canQuote,
    staleTime: 60_000,
  });

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionTitle
          note={
            existingMemberMode
              ? "Select the membership class"
              : "I wish to be elected as:"
          }
        >
          {existingMemberMode ? "Membership class" : "Membership type"}
        </SectionTitle>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading membership types…
            </div>
          ) : (
            <div className="relative w-full max-w-xs shrink-0">
              <select
                value={selected}
                onChange={(e) => onChange({ membershipType: e.target.value })}
                aria-invalid={Boolean(errors["membershipType"])}
                className={cn(
                  "w-full appearance-none rounded-xl border p-4 pr-10 text-left font-display text-lg transition-all",
                  "border-border bg-card focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20",
                  !selected && "text-muted-foreground",
                )}
              >
                <option value="" disabled>
                  Select membership type
                </option>
                {types.map((type: MembershipTypeOption) => (
                  <option key={type.code} value={type.code}>
                    {type.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          )}

          {!existingMemberMode && selected ? (
            <aside className="w-full max-w-sm rounded-xl border border-[#e4d7bf] bg-[#f8f5ef] p-4 text-[#1f2554] shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#c9a46c]">
                Amount you will pay
              </p>
              {!dob ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Enter your date of birth on Personal details so fees can use the under-30 joining rate.
                </p>
              ) : quote.isFetching ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Calculating fees…
                </p>
              ) : quote.isError ? (
                <p className="mt-2 text-sm text-destructive">
                  Could not load the fee schedule for this membership type.
                </p>
              ) : quote.data ? (
                <dl className="mt-3 space-y-3">
                  <div className="flex items-baseline justify-between gap-3 border-b border-[#e4d7bf]/pb-2">
                    <dt className="text-sm font-medium">Joining fee</dt>
                    <dd className="font-display text-lg font-semibold tabular-nums">
                      {money(quote.data.payableJoining)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-sm font-medium">
                      Annual subscription
                    </dt>
                    <dd className="font-display text-lg font-semibold tabular-nums">
                      {money(quote.data.payableAnnual)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <dl className="mt-3 space-y-3">
                  <div className="flex items-baseline justify-between gap-3 border-b border-[#e4d7bf]/pb-2">
                    <dt className="text-sm font-medium">Joining fee</dt>
                    <dd className="font-display text-lg font-semibold tabular-nums">{money(0)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-sm font-medium">Annual subscription</dt>
                    <dd className="font-display text-lg font-semibold tabular-nums">{money(0)}</dd>
                  </div>
                </dl>
              )}
            </aside>
          ) : null}
        </div>
        {errors["membershipType"] && (
          <p className="text-xs font-medium text-destructive">{errors["membershipType"]}</p>
        )}
      </section>

      {onMembershipNoChange ? (
        <section className="space-y-4">
          <SectionTitle note="Assign or confirm the membership number already held by this member.">
            Membership number
          </SectionTitle>
          <div className={existingMemberMode ? "grid gap-4 sm:grid-cols-2" : undefined}>
            <TextField
              label="Membership no."
              required
              value={membershipNo ?? ""}
              onChange={(event) => onMembershipNoChange(event.target.value)}
              error={errors["membershipNo"]}
              placeholder="AC-0001"
            />
            {existingMemberMode ? (
              <TextField
                label="Joining date"
                type="date"
                required
                value={value.signatureDate ?? ""}
                onChange={(e) => onChange({ signatureDate: e.target.value })}
                error={errors["signatureDate"]}
              />
            ) : null}
          </div>
          {existingMemberMode ? (
            <p className="text-xs text-muted-foreground">
              Use the member&apos;s real join / election date. If set to today, they cannot propose or
              second until they have 3 years of continuous membership.
            </p>
          ) : null}
        </section>
      ) : null}

      {existingMemberMode && !onMembershipNoChange ? (
        <section className="space-y-4">
          <SectionTitle note="Date this member joined / was elected to the club.">Joining date</SectionTitle>
          <TextField
            label="Joining date"
            type="date"
            required
            value={value.signatureDate ?? ""}
            onChange={(e) => onChange({ signatureDate: e.target.value })}
            error={errors["signatureDate"]}
          />
        </section>
      ) : null}

      {!existingMemberMode ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <SignatureField
            label="Signature of applicant"
            value={value.applicantSignature ?? ""}
            onChange={(v) => onChange({ applicantSignature: v })}
            error={errors["applicantSignature"]}
          />
          <TextField
            label="Date"
            type="date"
            required
            value={value.signatureDate ?? ""}
            onChange={(e) => onChange({ signatureDate: e.target.value })}
            error={errors["signatureDate"]}
          />
        </section>
      ) : null}
    </div>
  );
});
