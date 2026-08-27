import { memo, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Grid, SectionTitle, TextField, YesNoField } from "../fields";
import type { ApplicationDraft } from "@/services/membership/schema";
import type { ErrorMap } from "@/services/membership/useApplication";

type Value = ApplicationDraft["family"];
type Spouse = NonNullable<Value["spouses"]>[number];

const MAX_CHILDREN = 10;
const MAX_SPOUSES = 8;
const emptySpouse = (): Spouse => ({ name: "", phone: "", email: "" });

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

  const set = useCallback(
    (key: keyof Value) => (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ [key]: e.target.value } as Partial<Value>),
    [onChange],
  );

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

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionTitle note="You may record more than one spouse.">Marital status</SectionTitle>
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
                  <p className="text-sm font-medium">Spouse {index + 1}</p>
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
                  label={`Child ${index + 1} name`}
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
        <SectionTitle>Emergency contact</SectionTitle>
        <Grid>
          <TextField
            label="Name"
            required
            value={value.emergencyName}
            onChange={set("emergencyName")}
            error={errors["emergencyName"]}
          />
          <TextField
            label="Telephone no."
            required
            value={value.emergencyPhone}
            onChange={set("emergencyPhone")}
            error={errors["emergencyPhone"]}
          />
          <TextField
            label="Email"
            type="email"
            required
            value={value.emergencyEmail}
            onChange={set("emergencyEmail")}
            error={errors["emergencyEmail"]}
          />
        </Grid>
      </section>
    </div>
  );
});
