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
        <SectionTitle>
          Affiliation with aviation
        </SectionTitle>
        <YesNoField
          label="Are you affiliated with aviation?"
          value={value.isAffiliated}
          onChange={(v) =>
            onChange({
              isAffiliated: v,
              aviationRole: "",
              holdsLicense: v,
              ownsAircraft: v,
              ...(v
                ? {}
                : {
                    licenseType: "",
                    licenseNumber: "",
                    licenseIssuer: "",
                    licenseFile: null,
                    aircraftType: "",
                    aircraftRegistration: "",
                    hangarLocation: "",
                  }),
            })
          }
        />
      </section>

      {value.isAffiliated ? (
        <>
          <section className="space-y-4">
            <SectionTitle >Pilot&apos;s licence</SectionTitle>
            <Grid>
              <TextField
                label="Licence type"
                value={value.licenseType ?? ""}
                onChange={set("licenseType")}
                error={errors["licenseType"]}
              />
              <TextField
                label="Licence number"
                value={value.licenseNumber ?? ""}
                onChange={set("licenseNumber")}
                error={errors["licenseNumber"]}
              />
              <TextField
                label="Issuer"
                value={value.licenseIssuer ?? ""}
                onChange={set("licenseIssuer")}
                error={errors["licenseIssuer"]}
              />
              <FileField
                label="Licence copy"
                purpose="license"
                accept="application/pdf,image/png,image/jpeg"
                value={value.licenseFile ?? null}
                onChange={(file) => onChange({ licenseFile: file })}
                error={errors["licenseFile"]}
              />
            </Grid>
          </section>

          <section className="space-y-4">
            <SectionTitle >Aircraft ownership</SectionTitle>
            <Grid>
              <TextField
                label="Type of aircraft"
                value={value.aircraftType ?? ""}
                onChange={set("aircraftType")}
                error={errors["aircraftType"]}
              />
              <TextField
                label="Registration number"
                value={value.aircraftRegistration ?? ""}
                onChange={set("aircraftRegistration")}
                error={errors["aircraftRegistration"]}
              />
              <TextField
                label="Hangar location"
                value={value.hangarLocation ?? ""}
                onChange={set("hangarLocation")}
                error={errors["hangarLocation"]}
              />
            </Grid>
          </section>
        </>
      ) : null}
    </div>
  );
});
