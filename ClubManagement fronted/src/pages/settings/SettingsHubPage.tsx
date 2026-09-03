import {
  CalendarClock,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserRound,
} from "lucide-react";

import { AdminPortalCard } from "@/components/card/AdminPortalCard";
import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { hasAnyRole, readPortalMode, readUser } from "@/lib/auth";

export function SettingsHubPage() {
  const user = readUser();
  const mode = readPortalMode(user);
  const adminDesk = mode === "admin";
  const canRbac = hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"]);

  return (
    <PageFrame>
      <PageHeader
        title="Settings"
        description={
          adminDesk
            ? "Assign System_role values to User_account through User_role, and manage club preferences."
            : "Manage your account, privacy, appearance, and scheduled actions."
        }
      />
      {adminDesk ? (
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <AdminPortalCard
            title="Role-Based Access Control"
            description="Assign and revoke System_role for each User_account."
            icon={ShieldCheck}
            to="/settings/rbac"
            tone="violet"
            locked={!canRbac}
          />
          <AdminPortalCard
            title="User accounts"
            description="Create staff accounts, reset passwords, and set status."
            icon={UserCog}
            to="/user-management"
            tone="sky"
            locked={!canRbac}
          />
          <AdminPortalCard
            title="Club preferences"
            description="Tenant name and portal defaults for this club."
            icon={SlidersHorizontal}
            to="/settings/club"
            tone="slate"
            locked={!canRbac}
          />
        </section>
      ) : (
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <AdminPortalCard
            title="Account & Profile"
            description="View or update your account email, display name, profile photo, and password."
            icon={UserRound}
            to="/settings/account"
            tone="sky"
          />
          <AdminPortalCard
            title="Privacy & Data Controls"
            description="Manage history retention, search or personal context, and export or clear data."
            icon={ShieldCheck}
            to="/settings/privacy"
            tone="violet"
          />
          <AdminPortalCard
            title="Interface & Personalization"
            description="Theme (Dark, Light, or System), language, and custom instructions."
            icon={Palette}
            to="/settings/appearance"
            tone="amber"
          />
          <AdminPortalCard
            title="Automations & Schedules"
            description="View and manage background automations and scheduled actions."
            icon={CalendarClock}
            to="/settings/automations"
            tone="emerald"
          />
        </section>
      )}
    </PageFrame>
  );
}
