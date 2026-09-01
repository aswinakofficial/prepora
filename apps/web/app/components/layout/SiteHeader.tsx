import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, LogIn, Menu, X } from "lucide-react";
import { SearchCommandModal } from "../search/SearchCommandModal";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo */}
            <Link
              to="/"
              className="flex items-center gap-2 font-bold text-xl tracking-tight text-slate-100 hover:text-blue-400 transition-colors shrink-0"
              aria-label="Prepora home"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-extrabold text-base">
                P
              </div>
              <span>Prepora</span>
            </Link>

            {/* Quick ⌘K Search Trigger (Center) */}
            <button
              onClick={() => setSearchModalOpen(true)}
              className="hidden md:flex items-center gap-3 px-3.5 py-1.5 rounded-xl border border-slate-800 bg-slate-900/60 
                         hover:border-slate-700 hover:bg-slate-900 text-slate-400 text-sm transition-all flex-1 max-w-md"
            >
              <Search className="w-4 h-4 text-slate-400" />
              <span className="text-slate-400 text-xs sm:text-sm">Search exams, questions, topics...</span>
              <kbd className="ml-auto px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400">
                ⌘K
              </kbd>
            </button>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-1" aria-label="Main navigation">
              <NavLink to="/exams">Exams</NavLink>
              <NavLink to="/subjects">Subjects</NavLink>
              <NavLink to="/practice">Practice</NavLink>
            </nav>

            {/* Desktop actions */}
            <div className="hidden md:flex items-center gap-3 shrink-0">
              <Link
                to="/contribute"
                className="text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors px-2.5 py-1.5 rounded-lg"
              >
                Contribute
              </Link>
              <Link
                to={"/auth/signin" as any}
                className="flex items-center gap-1.5 text-sm font-medium px-3.5 py-1.5 rounded-xl 
                           border border-slate-800 bg-slate-900 text-slate-200 hover:border-slate-700 hover:bg-slate-800 hover:text-white transition-all shadow-sm"
              >
                <LogIn className="w-4 h-4 text-slate-400" aria-hidden="true" />
                Sign in
              </Link>
            </div>

            {/* Mobile menu & search toggle */}
            <div className="flex items-center gap-2 md:hidden">
              <button
                onClick={() => setSearchModalOpen(true)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                aria-label="Search"
              >
                <Search className="w-5 h-5" />
              </button>
              <button
                className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-expanded={menuOpen}
                aria-label="Toggle menu"
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          {menuOpen && (
            <nav
              className="md:hidden py-3 border-t border-slate-800 flex flex-col gap-1 animate-fade-up"
              aria-label="Mobile navigation"
            >
              <MobileNavLink to="/exams" onClick={() => setMenuOpen(false)}>Exams</MobileNavLink>
              <MobileNavLink to="/subjects" onClick={() => setMenuOpen(false)}>Subjects</MobileNavLink>
              <MobileNavLink to="/practice" onClick={() => setMenuOpen(false)}>Practice</MobileNavLink>
              <MobileNavLink to="/search" onClick={() => setMenuOpen(false)}>Search</MobileNavLink>
              <MobileNavLink to="/contribute" onClick={() => setMenuOpen(false)}>Contribute</MobileNavLink>
              <MobileNavLink to={"/auth/signin" as any} onClick={() => setMenuOpen(false)}>Sign in</MobileNavLink>
            </nav>
          )}
        </div>
      </header>

      {/* ⌘K Command Modal */}
      <SearchCommandModal isOpen={searchModalOpen} onClose={() => setSearchModalOpen(false)} />
    </>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
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

function MobileNavLink({
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
