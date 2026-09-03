import { memo, useCallback } from "react";

import { FileField, Grid, SectionTitle, TextField, YesNoField } from "../fields";
import type { ApplicationDraft } from "@/services/membership/schema";
import type { ErrorMap } from "@/services/membership/useApplication";

type Value = ApplicationDraft["aviation"];

export const StepAviation = memo(function StepAviation({
  value,
  errors,
  onChange,
}: {
  value: Value;
  errors: ErrorMap;
  onChange: (patch: Partial<Value>) => void;
}) {
  const set = useCallback(
    (key: keyof Value) => (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ [key]: e.target.value } as Partial<Value>),
    [onChange],
  );

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionTitle>Affiliation with aviation</SectionTitle>
        <YesNoField
          label="Are you affiliated with aviation?"
          value={value.isAffiliated}
          onChange={(v) => onChange({ isAffiliated: v })}
        />
        {value.isAffiliated && (
          <TextField
            label="Specify your role"
            required
            value={value.aviationRole ?? ""}
            onChange={set("aviationRole")}
            error={errors["aviationRole"]}
          />
        )}
      </section>

      <section className="space-y-4">
        <SectionTitle note="Attach a copy of your licence if you hold one.">
          Pilot's licence
        </SectionTitle>
        <YesNoField
          label="Do you hold a pilot's licence?"
          value={value.holdsLicense}
          onChange={(v) => onChange({ holdsLicense: v })}
        />
        {value.holdsLicense && (
          <Grid>
            <TextField
              label="Licence type"
              required
              value={value.licenseType ?? ""}
              onChange={set("licenseType")}
              error={errors["licenseType"]}
            />
            <TextField
              label="Licence number"
              required
              value={value.licenseNumber ?? ""}
              onChange={set("licenseNumber")}
              error={errors["licenseNumber"]}
            />
            <TextField
              label="Issuer"
              required
              value={value.licenseIssuer ?? ""}
              onChange={set("licenseIssuer")}
              error={errors["licenseIssuer"]}
            />
            <FileField
              label="Licence copy"
              purpose="license"
              accept="application/pdf,image/png,image/jpeg"
              required
              value={value.licenseFile ?? null}
              onChange={(file) => onChange({ licenseFile: file })}
              error={errors["licenseFile"]}
            />
          </Grid>
        )}
      </section>

      <section className="space-y-4">
        <SectionTitle>Aircraft ownership</SectionTitle>
        <YesNoField
          label="Do you own or co-own an aircraft?"
          value={value.ownsAircraft}
          onChange={(v) => onChange({ ownsAircraft: v })}
        />
        {value.ownsAircraft && (
          <Grid>
            <TextField
              label="Type of aircraft"
              required
              value={value.aircraftType ?? ""}
              onChange={set("aircraftType")}
              error={errors["aircraftType"]}
            />
            <TextField
              label="Registration number"
              required
              value={value.aircraftRegistration ?? ""}
              onChange={set("aircraftRegistration")}
              error={errors["aircraftRegistration"]}
            />
            <TextField
              label="Hangar location"
              required
              value={value.hangarLocation ?? ""}
              onChange={set("hangarLocation")}
              error={errors["hangarLocation"]}
            />
          </Grid>
        )}
      </section>
    </div>
  );
});
