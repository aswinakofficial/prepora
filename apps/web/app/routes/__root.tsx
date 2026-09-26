import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { trackEvent } from "../../lib/analytics";
import { SiteHeader } from "../components/layout/SiteHeader";
import globalsCss from "../styles/globals.css?url";

export const Route = createRootRoute({
  head: () => ({
    links: [
      { rel: "stylesheet", href: globalsCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#06080a" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Prepora" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@preporaindia" },
    ],
  }),
  component: RootLayout,
  notFoundComponent: NotFound,
});

import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { i18n } from "../../lib/i18n";

// Ideally queryClient is instantiated per request in SSR, but simplified here for SPA/Client Hydration
const queryClient = new QueryClient();

// docs/roadmap/engineering-roadmap.md item 27: fires one page_view per route change. Lives in its
// own component (rather than inline in RootLayout) so the pathname selector only re-renders this
// tiny tracker, not the whole layout, on every navigation.
function PageViewTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    trackEvent("page_view", { entityType: "route", entityId: pathname });
  }, [pathname]);

  return null;
}

function RootLayout() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white">
        <I18nProvider i18n={i18n}>
          <QueryClientProvider client={queryClient}>
            <PageViewTracker />
            <SiteHeader />
            <main id="main-content">
              <Outlet />
            </main>
          </QueryClientProvider>
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <h1 className="text-4xl font-mono font-light text-white">404</h1>
      <p className="font-mono text-sm tracking-widest text-slate-500 uppercase">Signal lost</p>
      <Link
        to="/"
        className="mt-8 font-mono text-sm tracking-widest uppercase border-b pb-1 text-slate-500 border-slate-700 hover:text-white hover:border-white transition-colors"
      >
        Return
      </Link>
    </div>
  );
}
