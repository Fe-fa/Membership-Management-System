import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Menu, Plane } from "lucide-react";

import { AppBreadcrumb } from "@/components/layout/AppBreadcrumb";
import { isNavActive, navForUser, type AppNavGroup } from "@/components/layout/nav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  canSwitchDashboard,
  clearSession,
  homePathForUser,
  readPortalMode,
  setPortalMode,
  type AuthUser,
  type PortalMode,
} from "@/lib/auth";
import { useMemberDashboard } from "@/services/member/dashboard";
import { applyTheme } from "@/lib/userPreferences";
import { tenantDisplayName, useCurrentTenant } from "@/services/tenant";
import { cn } from "@/utils/cn";

function BrandMark({ homeTo = "/" }: { homeTo?: "/" | "/admin" | "/reception" }) {
  const tenant = useCurrentTenant();
  const name = tenantDisplayName(tenant.data);
  return (
    <Link to={homeTo} className="flex items-center gap-2.5 px-2">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Plane className="size-4 -rotate-45" />
      </span>
      <span className="text-sm font-semibold tracking-tight text-foreground">{name}</span>
    </Link>
  );
}

function userInitials(name?: string | null) {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function ProfileMenu({
  name,
  onRequestLogout,
}: {
  name?: string | null;
  onRequestLogout: () => void;
}) {
  const initials = userInitials(name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-2 shadow-sm transition-colors hover:bg-secondary/60"
        >
          <span className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-semibold text-accent">
            {initials}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuItem
          className="cursor-pointer gap-2"
          onSelect={(event) => {
            event.preventDefault();
            onRequestLogout();
          }}
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LogoutConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <AlertDialogHeader className="space-y-3 px-6 pb-2 pt-8 text-center sm:text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
            <LogOut className="size-6" />
          </div>
          <AlertDialogTitle className="text-2xl font-semibold tracking-tight">
            Logout
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base text-foreground">
            Are you sure you want to logout?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="border-t border-border px-6 py-5 sm:justify-center">
          <AlertDialogAction className="w-full sm:w-auto sm:min-w-[10rem]" onClick={onConfirm}>
            Logout
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function NavItems({
  group,
  pathname,
  search,
  onNavigate,
}: {
  group: AppNavGroup;
  pathname: string;
  search: unknown;
  onNavigate?: () => void;
}) {
  return (
    <div className="mt-2 space-y-1">
      {group.items.map((item) => {
        const { label, to, icon: Icon, search: itemSearch, disabled } = item;
        const active = !disabled && isNavActive(pathname, search, item);
        const className = cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          disabled
            ? "cursor-not-allowed text-muted-foreground/50"
            : active
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
        );
        if (disabled) {
          return (
            <span key={label} className={className} aria-disabled="true">
              <Icon className="size-4" />
              <span>{label}</span>
            </span>
          );
        }
        return (
          <Link
            key={`${to}-${itemSearch?.tab ?? itemSearch?.view ?? itemSearch?.section ?? ""}`}
            to={to}
            search={(itemSearch ?? {}) as never}
            onClick={onNavigate}
            className={className}
          >
            <Icon className="size-4" />
            <span>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function NavGroupBlock({
  group,
  pathname,
  search,
  onNavigate,
}: {
  group: AppNavGroup;
  pathname: string;
  search: unknown;
  onNavigate?: () => void;
}) {
  const childActive = group.items.some((item) => isNavActive(pathname, search, item));
  const [open, setOpen] = useState(childActive || !group.collapsible);

  if (!group.collapsible) {
    return (
      <div>
        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {group.label}
        </p>
        <NavItems group={group} pathname={pathname} search={search} onNavigate={onNavigate} />
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      >
        {group.label}
        <ChevronDown className={cn("size-4 transition-transform", open ? "rotate-0" : "-rotate-90")} />
      </button>
      {open ? <NavItems group={group} pathname={pathname} search={search} onNavigate={onNavigate} /> : null}
    </div>
  );
}

function NavList({
  pathname,
  search,
  onNavigate,
  user,
}: {
  pathname: string;
  search: unknown;
  onNavigate?: () => void;
  user: AuthUser | null;
}) {
  const member = useMemberDashboard();
  const groups = useMemo(
    () => navForUser(user, pathname, member.data ?? null, search),
    [user, pathname, search, member.data],
  );
  return (
    <nav className="space-y-4">
      {groups.map((group) => (
        <NavGroupBlock
          key={group.label}
          group={group}
          pathname={pathname}
          search={search}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

export const SidebarShell = memo(function SidebarShell({
  children,
  user,
  showSidebar = true,
}: {
  children: ReactNode;
  user?: AuthUser | null;
  showSidebar?: boolean;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const currentUser = user ?? null;
  const homeTo = homePathForUser(currentUser);

  useEffect(() => {
    applyTheme();
  }, []);
  const portalMode = readPortalMode(currentUser);
  const canSwitch = canSwitchDashboard(currentUser);
  const onMainDashboard =
    (portalMode === "admin" && (pathname === "/admin" || pathname === homeTo)) ||
    (portalMode !== "admin" && pathname === "/");
  // Switch returns from a module/card to that portal's main dashboard.
  const showSwitch = Boolean(currentUser) && !onMainDashboard;

  function goToMainDashboard() {
    void navigate({ to: homeTo });
  }

  function switchPortal(next: PortalMode) {
    if (!canSwitchDashboard(currentUser)) return;
    setPortalMode(next);
    if (next === "admin") {
      void navigate({ to: "/admin" });
      return;
    }
    void navigate({ to: "/" });
  }

  function confirmLogout() {
    clearSession();
    queryClient.clear();
    setLogoutOpen(false);
    // Client navigate (no window.location) — avoids Permissions-Policy "unload" noise.
    void navigate({ to: "/", replace: true });
  }

  return (
    <div className={cn("min-h-screen", showSidebar ? "bg-background" : "bg-slate-50")}>
      <div className="mx-auto flex w-full max-w-[1440px]">
        {showSidebar ? (
          <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-r border-border bg-sidebar px-4 py-6 lg:block">
            <BrandMark homeTo={homeTo} />
            <div className="mt-8">
              <NavList pathname={pathname} search={search} user={currentUser} />
            </div>
          </aside>
        ) : null}

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header
            className={cn(
              "sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8",
              showSidebar
                ? "border-b border-border/70 bg-background/90 backdrop-blur"
                : "border-b border-slate-200/80 bg-white/90 backdrop-blur",
            )}
          >
            <div className="flex items-center gap-2 justify-self-start">
              {showSidebar ? (
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open menu">
                      <Menu className="size-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-72 p-0">
                    <SheetHeader className="border-b border-border px-4 py-4 text-left">
                      <SheetTitle className="sr-only">Navigation</SheetTitle>
                      <BrandMark homeTo={homeTo} />
                    </SheetHeader>
                    <div className="px-3 py-5">
                      <NavList
                        pathname={pathname}
                        search={search}
                        user={currentUser}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              ) : null}
              <div className={showSidebar ? "lg:hidden" : undefined}>
                <BrandMark homeTo={homeTo} />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5 justify-self-center">
              {showSwitch ? (
                <Button type="button" size="sm" variant="default" onClick={goToMainDashboard}>
                  Switch
                </Button>
              ) : null}
              {canSwitch ? (
                <>
                  {(
                    [
                      { id: "admin", label: "Admin" },
                      { id: "member", label: "Member" },
                      { id: "applicant", label: "Applicant" },
                    ] as const
                  ).map((option) => (
                    <Button
                      key={option.id}
                      type="button"
                      size="sm"
                      variant={portalMode === option.id ? "secondary" : "outline"}
                      onClick={() => switchPortal(option.id)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 justify-self-end">
              {currentUser ? (
                <ProfileMenu
                  name={currentUser.fullName}
                  onRequestLogout={() => setLogoutOpen(true)}
                />
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link to="/">Sign in</Link>
                </Button>
              )}
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <AppBreadcrumb />
            {children}
          </main>
        </div>
      </div>

      <LogoutConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        onConfirm={confirmLogout}
      />
    </div>
  );
});
