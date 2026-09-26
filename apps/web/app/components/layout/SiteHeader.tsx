import { Trans } from "@lingui/react";
import { Link } from "@tanstack/react-router";
import { Menu, Search, ShieldCheck, X } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { authClient } from "../../../lib/auth-client";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { useRBAC } from "../../hooks/useRBAC";
import { RoleGuard } from "../auth/RoleGuard";
import { SearchCommandModal } from "../search/SearchCommandModal";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const { user, isAdmin, isAuthenticated } = useRBAC();
  const { enabled: contributeEnabled } = useFeatureFlag("contribute");

  return (
    <>
      <header className="border-b border-slate-900/80 mb-6 md:mb-12 shrink-0 w-full z-40 bg-[#06080a]">
        {/* Mobile: one compact row — brand, search, menu. The desktop grid below used to stack
            into three full-width rows here, taking a quarter of a phone screen. */}
        <div className="md:hidden flex items-center justify-between px-4 py-4 text-xs font-mono tracking-widest uppercase">
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="text-white font-bold tracking-[0.3em]"
          >
            PREPORA
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              aria-label="Search"
              className="p-2.5 text-slate-400 hover:text-white transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="p-2.5 text-slate-400 hover:text-white transition-colors"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav
            id="mobile-menu"
            className="md:hidden border-t border-slate-900/80 px-4 pb-4 flex flex-col text-xs font-mono tracking-widest uppercase"
          >
            {[
              { to: "/exams", label: <Trans id="Exams">Exams</Trans> },
              ...(contributeEnabled
                ? [{ to: "/contribute", label: <Trans id="Contribute">Contribute</Trans> }]
                : []),
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="py-3 border-b border-slate-900/60 text-slate-300 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
            <RoleGuard requireAdmin>
              <Link
                to="/admin"
                onClick={() => setMenuOpen(false)}
                className="py-3 border-b border-slate-900/60 text-emerald-400 flex items-center gap-2"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Dashboard
              </Link>
            </RoleGuard>
            {isAuthenticated ? (
              <div className="py-3 flex items-center justify-between gap-4">
                <span className="text-[10px] text-slate-500 normal-case tracking-normal truncate">
                  {user?.email}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    setMenuOpen(false);
                    await authClient.signOut();
                  }}
                  className="text-slate-400 hover:text-white uppercase tracking-widest shrink-0"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/auth/signin"
                onClick={() => setMenuOpen(false)}
                className="py-3 text-slate-300 hover:text-white"
              >
                Sign In
              </Link>
            )}
          </nav>
        )}

        <div className="hidden max-w-[1400px] mx-auto md:grid md:grid-cols-12 text-xs font-mono tracking-widest uppercase">
          {/* Brand Col */}
          <div className="md:col-span-3 md:border-r border-slate-900/50 p-6 flex flex-col justify-center">
            <Link to="/" className="text-white font-bold tracking-[0.3em]">
              PREPORA
            </Link>
          </div>

          {/* Main Nav Col */}
          <div className="md:col-span-6 p-6 flex items-center gap-12 overflow-x-auto md:border-r border-slate-900/50">
            <Link
              to="/exams"
              className="text-slate-500 hover:text-white transition-colors shrink-0"
            >
              <Trans id="Exams">Exams</Trans>
            </Link>
            {contributeEnabled && (
              <Link
                to="/contribute"
                className="text-slate-500 hover:text-white transition-colors shrink-0"
              >
                <Trans id="Contribute">Contribute</Trans>
              </Link>
            )}
          </div>

          {/* Action Col */}
          <div className="md:col-span-3 p-6 flex items-center justify-end gap-6">
            <RoleGuard requireAdmin>
              <Link
                to="/admin"
                className="text-emerald-400 font-bold hover:text-emerald-300 transition-colors shrink-0 flex items-center gap-1.5 border border-emerald-950 bg-emerald-950/30 px-2.5 py-1 rounded-sm"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Dashboard
              </Link>
            </RoleGuard>

            {isAuthenticated ? (
              <div className="flex items-center gap-4">
                {!isAdmin && (
                  <span className="hidden sm:inline font-mono text-[10px] text-slate-500 tracking-wider truncate max-w-[120px]">
                    {user?.email}
                  </span>
                )}
                <button
                  type="button"
                  onClick={async () => await authClient.signOut()}
                  className="text-slate-500 hover:text-white transition-colors shrink-0 font-mono uppercase tracking-widest text-xs"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/auth/signin"
                className="text-slate-500 hover:text-white transition-colors shrink-0"
              >
                Sign In
              </Link>
            )}
            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              className="text-slate-500 hover:text-white transition-colors flex items-center gap-2 shrink-0 group"
            >
              Scan{" "}
              <kbd className="text-[9px] px-1.5 py-0.5 border border-slate-800 text-slate-600 group-hover:border-slate-500 transition-colors">
                ⌘K
              </kbd>
            </button>
          </div>
        </div>
      </header>

      <SearchCommandModal isOpen={searchModalOpen} onClose={() => setSearchModalOpen(false)} />
    </>
  );
}

function _NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-3 py-2 text-sm font-medium rounded-lg text-[var(--muted-foreground)] 
                 hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
      activeProps={{ className: "text-[var(--primary)] bg-[var(--secondary)]" }}
    >
      {children}
    </Link>
  );
}

function _MobileNavLink({
  to,
  children,
  onClick,
}: {
  to: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="px-3 py-2.5 text-sm font-medium rounded-lg text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
      activeProps={{ className: "text-[var(--primary)] bg-[var(--secondary)]" }}
    >
      {children}
    </Link>
  );
}
