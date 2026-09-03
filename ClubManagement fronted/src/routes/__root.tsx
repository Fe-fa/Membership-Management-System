import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { SidebarShell } from "@/components/layout/SidebarShell";
import appCss from "../styles/index.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { isAuthenticated, isClubMember, readPortalMode, readUser, subscribeAuthChanged, canVisitPath, homePathForUser, type AuthUser } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/", "/login", "/register", "/set-password"]);

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname);
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ACEA Member Dashboard" },
      {
        name: "description",
        content: "Aero Club of East Africa member dashboard and membership application portal.",
      },
      { name: "author", content: "Aero Club of East Africa" },
      { property: "og:title", content: "ACEA Member Dashboard" },
      {
        property: "og:description",
        content: "Aero Club of East Africa member dashboard and membership application portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en-KE">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const router = useRouter();
  // Start identical on server + client; hydrate auth only after mount.
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const sync = () => {
      setUser(readUser());
      setAuthed(isAuthenticated());
      setReady(true);
    };
    sync();
    return subscribeAuthChanged(sync);
  }, [pathname]);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated() && !isPublicPath(pathname)) {
      void router.navigate({ to: "/" });
      return;
    }
    if (isAuthenticated() && !canVisitPath(readUser(), pathname)) {
      void router.navigate({ to: homePathForUser(readUser()), replace: true });
    }
  }, [pathname, ready, router, authed]);

  const mode = readPortalMode(user);
  // Until client auth is ready, keep a bare shell so SSR HTML matches hydration.
  const bare =
    !ready ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/set-password" ||
    (pathname === "/" && !authed);

  const portalHome =
    pathname === "/admin" ||
    (pathname === "/" &&
      authed &&
      (mode === "member" || (mode !== "applicant" && isClubMember(user))));

  return (
    <QueryClientProvider client={queryClient}>
      {bare ? (
        <Outlet />
      ) : (
        <SidebarShell user={user} showSidebar={!portalHome}>
          <Outlet />
        </SidebarShell>
      )}
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
