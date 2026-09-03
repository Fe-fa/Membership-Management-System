import { memo } from "react";
import { Check, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/utils/cn";
import { SectionTitle, SignatureField, TextField } from "../fields";
import { fetchMembershipTypes, type MembershipTypeOption } from "@/services/membership/membershipTypes";
import type { ApplicationDraft } from "@/services/membership/schema";
import type { ErrorMap } from "@/services/membership/useApplication";

type Value = ApplicationDraft["membership"];

export const StepMembership = memo(function StepMembership({
  value,
  errors,
  onChange,
  membershipNo,
  onMembershipNoChange,
  existingMemberMode = false,
}: {
  value: Value;
  errors: ErrorMap;
  onChange: (patch: Partial<Value>) => void;
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
          {existingMemberMode ? "Membership class" : "Member election type"}
        </SectionTitle>
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading membership types…
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {types.map((type: MembershipTypeOption) => {
              const active = selected === type.code;
              return (
                <button
                  key={type.code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ membershipType: type.code })}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-all",
                    active
                      ? "border-accent bg-primary text-primary-foreground shadow-md"
                      : "border-border bg-card hover:border-primary/40 hover:bg-secondary",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-lg">{type.name}</span>
                    {active && <Check className="size-4 text-accent" />}
                  </div>
                  {/* <p
                    className={cn(
                      "mt-1 text-xs",
                      active ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    Membership type ggggggggggggggggg
                  </p> */}
                </button>
              );
            })}
          </div>
        )}
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
