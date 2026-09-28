import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useState } from "react";

import { isSuperAdmin, readUser } from "@/lib/auth";
import { listClubCompanies } from "@/services/admin/clubSetup";
import { clearActiveClub, persistActiveClub, readActiveClub, type ActiveClub } from "@/services/activeClub";

function toActiveClub(row: {
  id: number;
  companyCode: string;
  companyName: string;
  slug?: string | null;
}): ActiveClub {
  return {
    companyId: row.id,
    companyCode: row.companyCode,
    companyName: row.companyName,
    slug: row.slug ?? null,
  };
}

export function ActiveClubSwitch({ variant = "bar" }: { variant?: "bar" | "panel" }) {
  const user = readUser();
  const enabled = isSuperAdmin(user);
  const queryClient = useQueryClient();
  const companies = useQuery({
    queryKey: ["club-setup", "companies"],
    queryFn: listClubCompanies,
    enabled,
    staleTime: 60_000,
  });
  const [code, setCode] = useState(() => readActiveClub()?.companyCode ?? "");

  if (!enabled) return null;

  const rows = companies.data ?? [];
  const selected = code || readActiveClub()?.companyCode || "";

  function onChange(next: string) {
    if (!next) {
      clearActiveClub();
      setCode("");
      void queryClient.invalidateQueries();
      return;
    }
    const row = rows.find((item) => item.companyCode.toUpperCase() === next.toUpperCase());
    if (!row) return;
    persistActiveClub(toActiveClub(row));
    setCode(row.companyCode.toUpperCase());
    void queryClient.invalidateQueries();
  }

  const select = (
    <select
      aria-label="Clubs to view"
      className="h-9 min-w-[16rem] rounded-md border border-input bg-background px-3 text-sm font-medium"
      value={selected}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">All clubs</option>
      {rows.map((row) => (
        <option key={row.id} value={row.companyCode}>
          {row.companyName}
        </option>
      ))}
    </select>
  );

  if (variant === "bar") {
    return (
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 className="size-4 text-foreground" />
        <span className="hidden sm:inline">View</span>
        {select}
      </label>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <Building2 className="size-4 shrink-0" />
      <span className="text-sm font-medium">View</span>
      {select}
      <span className="text-sm text-muted-foreground">
        Super Admin is not a member of a club. All clubs shows the whole system. Choosing a club only narrows the lists.
      </span>
    </div>
  );
}
