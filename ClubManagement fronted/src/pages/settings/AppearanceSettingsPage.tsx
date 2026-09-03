import { useState } from "react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  applyTheme,
  readInstructions,
  readLanguage,
  readTheme,
  saveInstructions,
  saveLanguage,
  saveTheme,
  type ThemePreference,
} from "@/lib/userPreferences";

export function AppearanceSettingsPage() {
  const [theme, setTheme] = useState<ThemePreference>(readTheme);
  const [language, setLanguage] = useState(readLanguage);
  const [instructions, setInstructions] = useState(readInstructions);

  return (
    <PageFrame width="sm">
      <PageHeader
        title="Interface & Personalization"
        description="Set theme preferences (Dark, Light, or System default), default language, and custom instructions."
      />
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <fieldset className="grid gap-2">
          <Label>Theme</Label>
          {(["light", "dark", "system"] as const).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm capitalize">
              <input
                type="radio"
                name="theme"
                checked={theme === option}
                onChange={() => {
                  setTheme(option);
                  saveTheme(option);
                }}
              />
              {option === "system" ? "System default" : option}
            </label>
          ))}
        </fieldset>
        <label className="grid gap-1 text-sm">
          <Label>Default language</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="sw">Kiswahili</option>
            <option value="fr">Français</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <Label>Custom instructions</Label>
          <Textarea
            rows={5}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="How this portal should address you, preferred membership class reminders, etc."
          />
        </label>
        <Button
          type="button"
          onClick={() => {
            saveLanguage(language);
            saveInstructions(instructions);
            applyTheme(theme);
            toast.success("Personalization saved.");
          }}
        >
          Save personalization
        </Button>
      </div>
    </PageFrame>
  );
}
