import { useState } from "react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearChatAndLocalContext, exportLocalData, readPrivacy, savePrivacy } from "@/lib/userPreferences";

export function PrivacySettingsPage() {
  const [privacy, setPrivacy] = useState(readPrivacy);

  return (
    <PageFrame width="sm">
      <PageHeader
        title="Privacy & Data Controls"
        description="Manage conversation history retention, toggle search or personal context permissions, and export or clear your data."
      />
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <label className="grid gap-1 text-sm">
          <Label>History retention (days)</Label>
          <Input
            type="number"
            min={7}
            max={730}
            value={privacy.retentionDays}
            onChange={(e) => setPrivacy({ ...privacy, retentionDays: Number(e.target.value) || 90 })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={privacy.allowSearch}
            onChange={(e) => setPrivacy({ ...privacy, allowSearch: e.target.checked })}
          />
          Allow search of my club activity
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={privacy.personalContext}
            onChange={(e) => setPrivacy({ ...privacy, personalContext: e.target.checked })}
          />
          Use personal context to tailor this portal
        </label>
        <Button
          type="button"
          onClick={() => {
            savePrivacy(privacy);
            toast.success("Privacy settings saved.");
          }}
        >
          Save privacy
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const blob = new Blob([JSON.stringify(exportLocalData(), null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "acea-data-export.json";
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Export downloaded.");
          }}
        >
          Export data
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            clearChatAndLocalContext();
            toast.success("Local portal data cleared.");
          }}
        >
          Clear local data
        </Button>
      </div>
    </PageFrame>
  );
}
