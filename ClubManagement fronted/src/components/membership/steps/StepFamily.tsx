import { memo, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Grid, SectionTitle, TextField, YesNoField } from "../fields";
import type { ApplicationDraft } from "@/services/membership/schema";
import type { ErrorMap } from "@/services/membership/useApplication";

type Value = ApplicationDraft["family"];
type Spouse = NonNullable<Value["spouses"]>[number];
type EmergencyContact = NonNullable<Value["emergencyContacts"]>[number];

const MAX_CHILDREN = 10;
const MAX_SPOUSES = 8;
const MAX_EMERGENCY = 5;
const emptySpouse = (): Spouse => ({ name: "", phone: "", email: "" });
const emptyEmergency = (): EmergencyContact => ({ name: "", phone: "", email: "" });

export const StepFamily = memo(function StepFamily({
  value,
  errors,
  onChange,
}: {
  value: Value;
  errors: ErrorMap;
  onChange: (patch: Partial<Value>) => void;
}) {
  const children = value.children ?? [];
  const spouses = value.spouses ?? [];
  const emergencyContacts = value.emergencyContacts ?? [];

  const updateChild = useCallback(
    (index: number, patch: { name?: string; dateOfBirth?: string }) =>
      onChange({ children: children.map((c, i) => (i === index ? { ...c, ...patch } : c)) }),
    [children, onChange],
  );

  const updateSpouse = useCallback(
    (index: number, patch: Partial<Spouse>) =>
      onChange({ spouses: spouses.map((s, i) => (i === index ? { ...s, ...patch } : s)) }),
    [spouses, onChange],
  );

  const updateEmergency = useCallback(
    (index: number, patch: Partial<EmergencyContact>) =>
      onChange({
        emergencyContacts: emergencyContacts.map((row, i) => (i === index ? { ...row, ...patch } : row)),
      }),
    [emergencyContacts, onChange],
  );

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionTitle >Marital status</SectionTitle>
        <YesNoField
          label="Are you married?"
          value={value.isMarried}
          onChange={(v) =>
            onChange({
              isMarried: v,
              spouses: v && spouses.length === 0 ? [emptySpouse()] : spouses,
            })
          }
          error={errors["spouses"]}
        />
        {value.isMarried && (
          <div className="space-y-3">
            {spouses.map((spouse, index) => (
              <div key={index} className="rounded-lg border border-border bg-secondary/40 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onChange({ spouses: spouses.filter((_, i) => i !== index) })}
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Remove spouse {index + 1}</span>
                  </Button>
                </div>
                <Grid>
                  <TextField
                    label="Name of spouse"
                    required
                    value={spouse.name ?? ""}
                    onChange={(e) => updateSpouse(index, { name: e.target.value })}
                    error={errors[`spouses.${index}.name`]}
                  />
                  <TextField
                    label="Spouse telephone"
                    required
                    value={spouse.phone ?? ""}
                    onChange={(e) => updateSpouse(index, { phone: e.target.value })}
                    error={errors[`spouses.${index}.phone`]}
                  />
                  <TextField
                    label="Spouse email"
                    type="email"
                    value={spouse.email ?? ""}
                    onChange={(e) => updateSpouse(index, { email: e.target.value })}
                    error={errors[`spouses.${index}.email`]}
                  />
                </Grid>
              </div>
            ))}
            {spouses.length < MAX_SPOUSES && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onChange({ spouses: [...spouses, emptySpouse()] })}
              >
                <Plus className="size-4" /> Add another spouse
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <SectionTitle note="List children below the age of 18 years.">Children</SectionTitle>
        <YesNoField
          label="Do you have children?"
          value={value.hasChildren}
          onChange={(v) =>
            onChange({
              hasChildren: v,
              children: v && children.length === 0 ? [{ name: "", dateOfBirth: "" }] : children,
            })
          }
          error={errors["children"]}
        />
        {value.hasChildren && (
          <div className="space-y-3">
            {children.map((child, index) => (
              <div
                key={index}
                className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-secondary/40 p-3"
              >
                <TextField
                  containerClassName="min-w-56 flex-1"
                  label={`Full name`}
                  value={child.name ?? ""}
                  onChange={(e) => updateChild(index, { name: e.target.value })}
                  error={errors[`children.${index}.name`]}
                />
                <TextField
                  containerClassName="w-48"
                  label="Date of birth"
                  type="date"
                  value={child.dateOfBirth ?? ""}
                  onChange={(e) => updateChild(index, { dateOfBirth: e.target.value })}
                  error={errors[`children.${index}.dateOfBirth`]}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onChange({ children: children.filter((_, i) => i !== index) })}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">Remove child {index + 1}</span>
                </Button>
              </div>
            ))}
            {children.length < MAX_CHILDREN && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onChange({ children: [...children, { name: "", dateOfBirth: "" }] })}
              >
                <Plus className="size-4" /> Add child
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <SectionTitle >Emergency contacts</SectionTitle>
        {errors["emergencyContacts"] ? (
          <p className="text-xs font-medium text-destructive">{errors["emergencyContacts"]}</p>
        ) : null}
        <div className="space-y-3">
          {emergencyContacts.map((contact, index) => (
            <div key={index} className="rounded-lg border border-border bg-secondary/40 p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">Emergency contact </p>
                {emergencyContacts.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      onChange({ emergencyContacts: emergencyContacts.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Remove emergency contact {index + 1}</span>
                  </Button>
                ) : null}
              </div>
              <Grid>
                <TextField
                  label="Name"
                  required
                  value={contact.name ?? ""}
                  onChange={(e) => updateEmergency(index, { name: e.target.value })}
                  error={errors[`emergencyContacts.${index}.name`]}
                />
                <TextField
                  label="Telephone no."
                  required
                  value={contact.phone ?? ""}
                  onChange={(e) => updateEmergency(index, { phone: e.target.value })}
                  error={errors[`emergencyContacts.${index}.phone`]}
                />
                <TextField
                  label="Email"
                  type="email"
                  required
                  value={contact.email ?? ""}
                  onChange={(e) => updateEmergency(index, { email: e.target.value })}
                  error={errors[`emergencyContacts.${index}.email`]}
                />
              </Grid>
            </div>
          ))}
          {emergencyContacts.length < MAX_EMERGENCY ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange({ emergencyContacts: [...emergencyContacts, emptyEmergency()] })}
            >
              <Plus className="size-4" /> Add emergency contact
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
});
