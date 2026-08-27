import { memo, useCallback } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FileField, Grid, SectionTitle, SelectField, TextField } from "../fields";
import { useLookup } from "@/services/membership/lookups";
import type { ApplicationDraft } from "@/services/membership/schema";
import type { ErrorMap } from "@/services/membership/useApplication";

type Value = ApplicationDraft["personal"];

type LookupQuery = ReturnType<typeof useLookup>;

/**
 * SelectField fed by a lookup query, with per-lookup loading and error/retry
 * states. Options render in the order the server emitted them (sort_order, name).
 */
function LookupSelect({
  label,
  required,
  value,
  onChange,
  error,
  query,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  error?: string | undefined;
  query: LookupQuery;
}) {
  const { data = [], isLoading, isError, refetch } = query;

  if (isLoading) {
    return (
      <SelectField
        label={label}
        required={required}
        options={[]}
        value=""
        disabled
        placeholder="Loading…"
        error={error}
      />
    );
  }

  if (isError) {
    return (
      <div className="space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </div>
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <TriangleAlert className="size-4 shrink-0" />
          <span className="flex-1">Couldn't load options.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <SelectField
      label={label}
      required={required}
      options={data}
      value={value}
      onChange={onChange}
      error={error}
    />
  );
}

export const StepPersonal = memo(function StepPersonal({
  value,
  errors,
  onChange,
  hidePhotoField = false,
}: {
  value: Value;
  errors: ErrorMap;
  onChange: (patch: Partial<Value>) => void;
  hidePhotoField?: boolean;
}) {
  const set = useCallback(
    (key: keyof Value) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ [key]: e.target.value } as Partial<Value>),
    [onChange],
  );

  const genders = useLookup("genders");
  const bloodGroups = useLookup("blood-groups");

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionTitle note="As it appears on your ID or passport.">Applicant name</SectionTitle>
        <Grid>
          <TextField
            label="First name"
            required
            value={value.firstName}
            onChange={set("firstName")}
            error={errors["firstName"]}
          />
          <TextField
            label="Middle name"
            value={value.middleName ?? ""}
            onChange={set("middleName")}
            error={errors["middleName"]}
          />
          <TextField
            label="Last name"
            required
            value={value.lastName}
            onChange={set("lastName")}
            error={errors["lastName"]}
          />
        </Grid>
      </section>

      <section className="space-y-4">
        <SectionTitle>Address</SectionTitle>
        <Grid>
          <TextField
            containerClassName="lg:col-span-2"
            label="Postal address"
            required
            value={value.postalAddress}
            onChange={set("postalAddress")}
            error={errors["postalAddress"]}
          />
          <TextField
            label="City"
            required
            value={value.city}
            onChange={set("city")}
            error={errors["city"]}
          />
          <TextField
            label="State / county"
            value={value.stateCountry ?? ""}
            onChange={set("stateCountry")}
            error={errors["stateCountry"]}
          />
          <TextField
            label="Postal / ZIP code"
            value={value.postalCode ?? ""}
            onChange={set("postalCode")}
            error={errors["postalCode"]}
          />
          <TextField
            label="Country"
            required
            value={value.country}
            onChange={set("country")}
            error={errors["country"]}
          />
        </Grid>
      </section>

      <section className="space-y-4">
        <SectionTitle>Contact</SectionTitle>
        <Grid>
          <TextField
            label="Email"
            type="email"
            required
            value={value.email}
            onChange={set("email")}
            error={errors["email"]}
          />
          <TextField
            label="Alt. email"
            type="email"
            value={value.altEmail ?? ""}
            onChange={set("altEmail")}
            error={errors["altEmail"]}
          />
          <div className="grid grid-cols-[6.5rem_1fr] gap-2">
            <TextField
              label="Intl prefix"
              required
              value={value.telPrefix}
              onChange={set("telPrefix")}
              error={errors["telPrefix"]}
            />
            <TextField
              label="Mobile"
              required
              value={value.mobile}
              onChange={set("mobile")}
              error={errors["mobile"]}
            />
          </div>
          <TextField
            label="Tel. other"
            value={value.telOther ?? ""}
            onChange={set("telOther")}
            error={errors["telOther"]}
          />
        </Grid>
      </section>

      <section className="space-y-4">
        <SectionTitle>Identity</SectionTitle>
        <Grid>
          <TextField
            label="ID / Passport no."
            required
            value={value.idPassportNo}
            onChange={set("idPassportNo")}
            error={errors["idPassportNo"]}
          />
          <TextField
            label="Nationality"
            required
            value={value.nationality}
            onChange={set("nationality")}
            error={errors["nationality"]}
          />
          <TextField
            label="Date of birth"
            type="date"
            required
            value={value.dateOfBirth}
            onChange={set("dateOfBirth")}
            error={errors["dateOfBirth"]}
          />
          <TextField
            label="Place of birth"
            required
            value={value.placeOfBirth}
            onChange={set("placeOfBirth")}
            error={errors["placeOfBirth"]}
          />
          <TextField
            label="Country of residence"
            required
            value={value.countryOfResidence}
            onChange={set("countryOfResidence")}
            error={errors["countryOfResidence"]}
          />
          <LookupSelect
            label="Blood group"
            required
            value={value.bloodGroup ?? ""}
            onChange={set("bloodGroup")}
            error={errors["bloodGroup"]}
            query={bloodGroups}
          />
          <LookupSelect
            label="Gender"
            required
            value={value.gender ?? ""}
            onChange={set("gender")}
            error={errors["gender"]}
            query={genders}
          />
        </Grid>
      </section>

      <section className="space-y-4">
        <SectionTitle>Occupation</SectionTitle>
        <Grid>
          <TextField
            label="Occupation"
            required
            value={value.occupation}
            onChange={set("occupation")}
            error={errors["occupation"]}
          />
          <TextField
            label="Company"
            value={value.company ?? ""}
            onChange={set("company")}
            error={errors["company"]}
          />
          <TextField
            label="Role"
            value={value.role ?? ""}
            onChange={set("role")}
            error={errors["role"]}
          />
        </Grid>
      </section>

      <section className="space-y-4">
        <SectionTitle
          note={
            hidePhotoField
              ? "CV and ID / Passport copy. Use the camera on the profile photo to change the portrait."
              : "Passport-size photo, CV and ID / Passport copy are required."
          }
        >
          Attachments
        </SectionTitle>
        <Grid cols={2}>
          {hidePhotoField ? null : (
            <FileField
              label="Passport photo"
              purpose="photo"
              accept="image/png,image/jpeg,image/webp"
              required
              value={value.photo}
              onChange={(file) => onChange({ photo: file })}
              error={errors["photo"]}
              hint="JPG, PNG or WEBP up to 8 MB."
            />
          )}
          <FileField
            label="Curriculum vitae"
            purpose="cv"
            accept="application/pdf,.doc,.docx"
            required
            value={value.cv}
            onChange={(file) => onChange({ cv: file })}
            error={errors["cv"]}
            hint="PDF or Word document up to 8 MB."
          />
          <FileField
            label="ID / Passport copy"
            purpose="idPassport"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            required
            value={value.idPassport}
            onChange={(file) => onChange({ idPassport: file })}
            error={errors["idPassport"]}
            hint="PDF or image of your national ID or passport."
          />
        </Grid>
      </section>
    </div>
  );
});
