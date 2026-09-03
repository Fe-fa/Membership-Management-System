import { memo } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionTitle, TextField, YesNoField } from "../fields";
import type { ApplicationDraft } from "@/services/membership/schema";
import type { ErrorMap } from "@/services/membership/useApplication";

type Value = ApplicationDraft["clubs"];

export const StepClubs = memo(function StepClubs({
  value,
  errors,
  onChange,
}: {
  value: Value;
  errors: ErrorMap;
  onChange: (patch: Partial<Value>) => void;
}) {
  const clubs = value.otherClubs ?? [];

  return (
    <div className="space-y-6">
      <SectionTitle note="List up to three clubs where you currently hold membership.">
        Other club memberships
      </SectionTitle>
      <YesNoField
        label="Are you a member of another club?"
        value={value.memberOfOtherClub}
        onChange={(v) =>
          onChange({
            memberOfOtherClub: v,
            otherClubs: v && clubs.length === 0 ? [{ name: "" }] : clubs,
          })
        }
        error={errors["otherClubs"]}
      />
      {value.memberOfOtherClub && (
        <div className="space-y-3">
          {clubs.map((club, index) => (
            <div key={index} className="flex items-end gap-3">
              <TextField
                containerClassName="flex-1"
                label={`Name of club ${index + 1}`}
                value={club.name ?? ""}
                onChange={(e) =>
                  onChange({
                    otherClubs: clubs.map((c, i) => (i === index ? { name: e.target.value } : c)),
                  })
                }
                error={errors[`otherClubs.${index}.name`]}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange({ otherClubs: clubs.filter((_, i) => i !== index) })}
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Remove club {index + 1}</span>
              </Button>
            </div>
          ))}
          {clubs.length < 3 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange({ otherClubs: [...clubs, { name: "" }] })}
            >
              <Plus className="size-4" /> Add club
            </Button>
          )}
        </div>
      )}
    </div>
  );
});
