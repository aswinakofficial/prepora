import React from "react";
import { createRootRoute, Outlet, Link, HeadContent, Scripts } from "@tanstack/react-router";
import globalsCss from "../styles/globals.css?url";

export const Route = createRootRoute({
  head: () => ({
    links: [
      { rel: "stylesheet", href: globalsCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }
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

function RootLayout() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white">
        <main id="main-content">
          <Outlet />
        </main>
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <h1 className="text-4xl font-mono font-light text-white">404</h1>
      <p className="font-mono text-sm tracking-widest text-slate-500 uppercase">
        Signal lost
      </p>
      <Link to="/" className="mt-8 font-mono text-sm tracking-widest uppercase border-b pb-1 text-slate-500 border-slate-700 hover:text-white hover:border-white transition-colors">
        Return
      </Link>
    </div>
  );
}
