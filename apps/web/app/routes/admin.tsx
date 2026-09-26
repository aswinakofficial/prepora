import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  CheckSquare,
  ChevronRight,
  Globe,
  LayoutDashboard,
  Settings,
  Tags,
  Users,
} from "lucide-react";
import { getWebRequest } from "vinxi/http";
import { requireAdmin } from "../../lib/auth";

export const verifyAdminFn = createServerFn({ method: "GET" }).handler(async () => {
  const req = getWebRequest();
  if (!req) return { ok: false, status: 500, reason: "No web request" };

  // Explicitly reconstruct Headers to ensure compatibility with Better Auth
  const headers = new Headers(req.headers as any);

  console.log("[verifyAdminFn] Cookie header:", headers.get("cookie"));

  // We can manually fake an event object with the correct headers instance
  const eventParams = { request: { headers } };
  const result = await requireAdmin(eventParams);

  if (!result.authorized) {
    console.error(`[ADMIN CHECK FAILED] Reason: ${result.reason}`);
    return { ok: false, status: 403, reason: result.reason };
  }

  return { ok: true, user: result.user };
});

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const auth = await verifyAdminFn();
    if (!auth.ok) {
      console.error("[ADMIN ROUTER] Server rejected beforeLoad. Reason:", auth.reason);
      throw new Error(auth.reason || "Unknown Authorization Failure");
    }
  },
  component: AdminLayout,
  errorComponent: ({ error }) => {
    return (
      <div className="min-h-screen bg-[#06080a] flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full border-[0.5px] border-red-500/30 bg-red-950/20 p-12">
          <h1 className="font-mono text-2xl tracking-widest text-red-500 mb-6 uppercase">
            403 Forbidden
          </h1>
          <p className="font-mono text-[10px] text-red-500/70 tracking-widest uppercase leading-loose mb-12">
            Access Denied. You do not possess the required clearance to access administrative
            systems.
            <br />
            <br />
            <span className="text-red-400 font-bold border border-red-900 px-2 py-1 bg-red-900/40">
              {error?.message || "Unknown Error"}
            </span>
          </p>
          <Link
            to="/"
            className="font-mono text-[10px] uppercase text-slate-400 hover:text-white border-b border-slate-700 pb-1"
          >
            Return to Grid
          </Link>
        </div>
      </div>
    );
  },
});

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const dashboardItem: NavItem = {
  to: "/admin",
  label: "Dashboard",
  icon: LayoutDashboard,
  exact: true,
};

// docs/roadmap/engineering-roadmap.md item 21: grouped into Content/Pipeline/Review, matching the
// documented admin information architecture — replaces a flat list of eleven destinations, six of
// which had no route at all. Only real, working routes are listed; a section with no working
// destination yet is omitted rather than shown with dead links, until its own roadmap item builds
// it — Insights/Analytics was the one deferred this way, and now has a real route (item 27).
const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: "Content",
    items: [
      { to: "/admin/contributions", label: "Contributions", icon: Users },
      { to: "/admin/exam-types", label: "Exam Categories", icon: Tags },
    ],
  },
  {
    label: "Pipeline",
    items: [{ to: "/admin/scraping", label: "Web Scraper Engine", icon: Globe }],
  },
  {
    label: "Review",
    items: [{ to: "/admin/review", label: "Scrape Review Queue", icon: CheckSquare }],
  },
  {
    label: "Insights",
    items: [{ to: "/admin/analytics", label: "Product Analytics", icon: BarChart2 }],
  },
];

const settingsItem: NavItem = { to: "/admin/settings", label: "Settings", icon: Settings };

function NavListItem({ item: { to, label, icon: Icon, exact } }: { item: NavItem }) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center justify-between px-8 py-3 border-l-2 border-transparent text-[10px] font-mono tracking-widest uppercase text-slate-500 hover:text-white transition-colors group [&.active]:border-white [&.active]:text-white [&.active]:bg-slate-900/40"
        activeProps={{ className: "active" }}
        activeOptions={exact ? { exact: true } : {}}
      >
        <div className="flex items-center gap-4">
          <Icon className="w-3.5 h-3.5 text-slate-600 group-[.active]:text-white transition-colors" />
          {label}
        </div>
        <ChevronRight className="w-3 h-3 text-slate-800 group-hover:text-slate-500 group-[.active]:text-white transition-colors" />
      </Link>
    </li>
  );
}

function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white">
      {/* Editorial Sidebar Matrix */}
      <aside className="w-72 flex-shrink-0 border-r border-slate-900 bg-[#06080a] hidden lg:flex flex-col">
        <div className="px-8 py-10 border-b border-slate-900 flex flex-col">
          <span className="font-mono text-xs tracking-[0.3em] font-bold text-white uppercase mb-2">
            SYSTEM.ADMIN
          </span>
          <span className="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
            ACCESS PROTOCOL ACTIVE
          </span>
        </div>
        <nav className="flex-1 py-8 overflow-y-auto scrollbar-hide">
          <ul className="space-y-0.5">
            <NavListItem item={dashboardItem} />
          </ul>

          {navSections.map((section) => (
            <div key={section.label} className="mt-8">
              <div className="px-8 pb-2 font-mono text-[10px] tracking-[0.25em] text-slate-700 uppercase">
                {section.label}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <NavListItem key={item.to} item={item} />
                ))}
              </ul>
            </div>
          ))}

          <ul className="mt-8 space-y-0.5">
            <NavListItem item={settingsItem} />
          </ul>
        </nav>

        {/* Connection Diagnostics */}
        <div className="p-8 border-t border-slate-900">
          <div className="flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-slate-600 border-b border-slate-900/50 pb-2 mb-2">
            <span>Data Stream</span>
            <span className="text-emerald-500">LIVE</span>
          </div>
          <div className="flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-slate-600">
            <span>Ping</span>
            <span>14ms</span>
          </div>
        </div>
      </aside>

      {/* Main Execution Content */}
      <div className="flex-1 relative overflow-auto border-l border-slate-900 bg-[#06080a]">
        <Outlet />
      </div>
    </div>
  );
}
