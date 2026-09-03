import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import heroImage from "@/assets/acea-hero.jpg";
import { AdminPortalCard } from "@/components/card/AdminPortalCard";
import { ADMIN_MODULES } from "@/services/admin/modules";
import { hasAnyRole, isReceptionistOnly, isStaff, readUser } from "@/lib/auth";

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const user = readUser();

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

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {ADMIN_MODULES.filter((module) => !module.roles || hasAnyRole(user, module.roles)).map((module) => (
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
    </div>
  );
}
