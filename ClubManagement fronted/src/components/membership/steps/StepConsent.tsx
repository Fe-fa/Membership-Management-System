import { memo } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Grid, SectionTitle, SignatureField, TextField } from "../fields";
import type { ApplicationDraft } from "@/services/membership/schema";
import type { ErrorMap } from "@/services/membership/useApplication";

type Value = ApplicationDraft["consent"];

const POLICY = [
  {
    title: "1. Personal data collected",
    body: "Name, phone number, marital status, occupation, residence, signature specimen, gender, age, email address, date of birth and any other information required to enrol you in our membership programme.",
  },
  {
    title: "2. Purpose of collection",
    body: "Processing your membership application in accordance with ACEA Membership Application Procedures, and contacting you with information regarding your membership.",
  },
  { title: "3. Transfer outside Kenya", body: "We will not transfer your data outside Kenya." },
  {
    title: "4. Sharing with third parties",
    body: "Your data is shared with AMREF Flying Doctors upon application of the Maisha Cover, and your name and membership number with reciprocating clubs.",
  },
  {
    title: "5. Data security",
    body: "Internal and external data protection policies, regular staff training, firewalls, end-to-end encryption and access control.",
  },
  {
    title: "6. Your rights",
    body: "Right to restrict processing, to information, to erasure, to data portability, in relation to automated decision making, of rectification, of access, to object to processing and to withdraw consent.",
  },
  {
    title: "7. Incomplete data",
    body: "If you do not provide all the personal information required, we may not be able to provide the services you require.",
  },
  {
    title: "8. Our obligation",
    body: "We process your data only with your consent and in compliance with the Data Protection Act, 2019. Withdrawing consent stops all further processing.",
  },
];

export const StepConsent = memo(function StepConsent({
  value,
  errors,
  onChange,
}: {
  value: Value;
  errors: ErrorMap;
  onChange: (patch: Partial<Value>) => void;
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionTitle note="Aero Club of East Africa, P.O. Box 40813, 00100 Wilson Airport, Nairobi, Kenya · +254 111 053 220">
          Members Privacy Policy summary
        </SectionTitle>
        <div className="max-h-80 space-y-4 overflow-y-auto rounded-xl border border-border bg-secondary/40 p-4 text-sm">
          {POLICY.map((item) => (
            <div key={item.title}>
              <p className="font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-muted-foreground">{item.body}</p>
            </div>
          ))}
          <p className="text-muted-foreground">
            Data enquiries and rights requests:{" "}
            <a
              className="font-medium text-primary underline"
              href="mailto:membershipdesk@aeroclubea.com"
            >
              membershipdesk@aeroclubea.com
            </a>
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Declaration and data consent</SectionTitle>
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox
              id="privacy"
              checked={value.privacyPolicyAccepted === true}
              onCheckedChange={(c) =>
                onChange({ privacyPolicyAccepted: (c === true ? true : undefined) as true })
              }
            />
            <Label htmlFor="privacy" className="text-sm leading-relaxed font-normal">
              I hereby agree to adhere to the Members Privacy Policy, which will be amended from
              time to time, and consent to the processing of my personal data as outlined above.
            </Label>
          </div>
          {errors["privacyPolicyAccepted"] && (
            <p className="text-xs font-medium text-destructive">
              {errors["privacyPolicyAccepted"]}
            </p>
          )}

          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox
              id="declaration"
              checked={value.declarationAccepted === true}
              onCheckedChange={(c) =>
                onChange({ declarationAccepted: (c === true ? true : undefined) as true })
              }
            />
            <Label htmlFor="declaration" className="text-sm leading-relaxed font-normal">
              I hereby apply for membership of the Aero Club of East Africa. I agree to abide by the
              rules, regulations and constitution of the Club and confirm that the information
              provided is accurate to the best of my knowledge.
            </Label>
          </div>
          {errors["declarationAccepted"] && (
            <p className="text-xs font-medium text-destructive">{errors["declarationAccepted"]}</p>
          )}
        </div>

        <Grid>
          <TextField
            label="Name"
            required
            value={value.declarationName ?? ""}
            onChange={(e) => onChange({ declarationName: e.target.value })}
            error={errors["declarationName"]}
          />
          <SignatureField
            value={value.declarationSignature ?? ""}
            onChange={(v) => onChange({ declarationSignature: v })}
            error={errors["declarationSignature"]}
          />
          <TextField
            label="Date"
            type="date"
            required
            value={value.declarationDate ?? ""}
            onChange={(e) => onChange({ declarationDate: e.target.value })}
            error={errors["declarationDate"]}
          />
        </Grid>
      </section>
    </div>
  );
});
