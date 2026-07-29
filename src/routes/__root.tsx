import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { AuthProvider } from "@/hooks/use-auth";
import { useGuestMigration } from "@/hooks/use-guest-migration";
import { useSessionTracking } from "@/hooks/use-session-tracking";
import {
  MODULE_RECOVERY_QUERY_KEY,
  MODULE_RECOVERY_SCRIPT,
  MODULE_RECOVERY_STORAGE_KEY,
} from "@/lib/module-recovery";
import { registerAppServiceWorker } from "@/lib/pwa-register";
import { useEffect } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";

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
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

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
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
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
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#F7F3EB" },
      { title: "TAP — know which card to tap before you pay." },
      {
        name: "description",
        content:
          "TAP gives you one clear card recommendation before checkout, with the math attached.",
      },
      { property: "og:title", content: "TAP — know which card to tap before you pay." },
      {
        property: "og:description",
        content: "One clear card recommendation before checkout, with the math attached.",
      },
      { property: "og:site_name", content: "TAP" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "TAP — know which card to tap before you pay." },
      {
        name: "twitter:description",
        content: "One clear card recommendation before checkout, with the math attached.",
      },
      { property: "og:url", content: "https://tapknows.com/" },
      { name: "twitter:url", content: "https://tapknows.com/" },
      {
        property: "og:image",
        content: "https://tapknows.com/og-tap.png",
      },
      {
        name: "twitter:image",
        content: "https://tapknows.com/og-tap.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: MODULE_RECOVERY_SCRIPT }} />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HydrationMarker />
        <GuestMigrationMount />
        <SessionTrackingMount />
        <Outlet />
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.tapHydrated = "true";
    sessionStorage.removeItem(MODULE_RECOVERY_STORAGE_KEY);
    const url = new URL(window.location.href);
    if (url.searchParams.has(MODULE_RECOVERY_QUERY_KEY)) {
      url.searchParams.delete(MODULE_RECOVERY_QUERY_KEY);
      window.history.replaceState(window.history.state, "", url);
    }
    return () => {
      delete document.documentElement.dataset.tapHydrated;
    };
  }, []);
  return null;
}

function GuestMigrationMount() {
  useGuestMigration();
  return null;
}

function SessionTrackingMount() {
  useSessionTracking();
  useEffect(() => {
    registerAppServiceWorker();
  }, []);
  return null;
}
