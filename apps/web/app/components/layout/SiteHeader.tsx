import { Trans } from "@lingui/react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { authClient } from "../../../lib/auth-client";
import { useRBAC } from "../../hooks/useRBAC";
import { RoleGuard } from "../auth/RoleGuard";
import { SearchCommandModal } from "../search/SearchCommandModal";

export function SiteHeader() {
  const [_menuOpen, _setMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const { user, isAdmin, isAuthenticated } = useRBAC();

  return (
    <>
      <header className="border-b border-slate-900/80 mb-12 shrink-0 w-full z-40 bg-[#06080a]">
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-12 text-xs font-mono tracking-widest uppercase">
          {/* Brand Col */}
          <div className="col-span-1 md:col-span-3 border-b md:border-b-0 md:border-r border-slate-900/50 p-6 flex flex-col justify-center">
            <Link to="/" className="text-white font-bold tracking-[0.3em]">
              PREPORA
            </Link>
          </div>

          {/* Main Nav Col */}
          <div className="col-span-1 md:col-span-6 p-6 flex items-center gap-8 md:gap-12 overflow-x-auto border-b md:border-b-0 md:border-r border-slate-900/50">
            <Link
              to="/exams"
              className="text-slate-500 hover:text-white transition-colors shrink-0"
            >
              <Trans id="Exams">Exams</Trans>
            </Link>
            <Link
              to="/contribute"
              className="text-slate-500 hover:text-white transition-colors shrink-0"
            >
              <Trans id="Contribute">Contribute</Trans>
            </Link>
          </div>

          {/* Action Col */}
          <div className="col-span-1 md:col-span-3 p-6 flex items-center justify-between md:justify-end gap-6">
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
                to={"/auth/signin" as any}
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
