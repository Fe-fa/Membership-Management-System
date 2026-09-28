import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import heroImage from "@/assets/acea-hero.jpg";
import { ActiveClubSwitch } from "@/components/admin/ActiveClubSwitch";
import { AdminPortalCard } from "@/components/card/AdminPortalCard";
import { PageDataGate } from "@/components/layout/PageLoading";
import { ADMIN_MODULE_CATEGORIES, ADMIN_MODULES, adminModuleCategory } from "@/services/admin/modules";
import { canViewModule, useMyOfficePermissions } from "@/services/admin/officePermissions";
import { hasAnyRole, isReceptionistOnly, isStaff, isSuperAdmin, readUser } from "@/lib/auth";

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const user = readUser();
  const superAdmin = isSuperAdmin(user);
  const [category, setCategory] = useState<(typeof ADMIN_MODULE_CATEGORIES)[number]>("All");
  const permissions = useMyOfficePermissions(Boolean(user && isStaff(user)));

  useEffect(() => {
    if (!user) {
      void navigate({ to: "/" });
      return;
    }
    if (!isStaff(user)) {
      void navigate({ to: "/" });
      return;
    }
    if (isReceptionistOnly(user)) {
      void navigate({ to: "/reception" });
    }
  }, [user, navigate]);

  if (!user || !isStaff(user) || isReceptionistOnly(user)) return null;

  const visibleModules = ADMIN_MODULES.filter((module) => {
    if (superAdmin && category !== "All" && adminModuleCategory(module.id) !== category) return false;
    if (permissions.data) {
      const inMatrix = permissions.data.modules.some((row) => row.moduleId === module.id);
      if (inMatrix) return canViewModule(permissions.data, module.id, user.roles);
    }
    // Fallback if API is unavailable or the catalog has a new module not yet stored.
    return !module.roles || hasAnyRole(user, module.roles);
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <section className="relative overflow-hidden rounded-2xl">
        <img
          src={heroImage}
          alt=""
          width={1600}
          height={900}
          className="h-48 w-full object-cover sm:h-56 lg:h-64"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/80 via-primary/40 to-transparent" />
        <h1 className="absolute inset-0 flex items-center px-6 font-sans text-2xl font-semibold tracking-tight text-white sm:px-8 sm:text-3xl">
          Admin dashboard
        </h1>
      </section>

      {superAdmin ? (
        <div className="space-y-3">
          <ActiveClubSwitch variant="panel" />
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Module categories">
            {ADMIN_MODULE_CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={category === item}
                className={
                  category === item
                    ? "rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                    : "rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50"
                }
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <PageDataGate
        loading={permissions.isLoading}
        label="Loading modules…"
        minHeightClassName="min-h-[16rem]"
      >
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleModules.map((module) => (
            <AdminPortalCard
              key={module.id}
              title={module.title}
              description={module.description}
              icon={module.icon}
              to={module.to}
              search={module.search}
              tone={module.tone}
              locked={module.locked}
            />
          ))}
        </section>
      </PageDataGate>
    </div>
  );
}
