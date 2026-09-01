import React from "react";
import { Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] mt-16" role="contentinfo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-2 font-bold text-lg mb-3">
              <GraduationCap className="w-6 h-6 text-[var(--primary)]" aria-hidden="true" />
              Prepora
            </Link>
            <p className="text-sm text-[var(--muted-foreground)] leading-relaxed max-w-xs">
              Prepare smarter with previous-year questions and detailed explanations.
              Free, open, and community-driven.
            </p>
          </div>

          {/* Explore */}
          <div>
            <h3 className="font-semibold text-sm mb-3">Explore</h3>
            <ul className="space-y-2">
              {[
                { to: "/exams", label: "Exams" },
                { to: "/subjects", label: "Subjects" },
                { to: "/practice", label: "Practice" },
                { to: "/search", label: "Search" },
              ].map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <h3 className="font-semibold text-sm mb-3">Community</h3>
            <ul className="space-y-2">
              {[
                { to: "/contribute", label: "Contribute" },
                { to: "/auth/signup", label: "Sign up" },
                { to: "/auth/signin", label: "Sign in" },
              ].map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[var(--border)] flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            © {new Date().getFullYear()} Prepora. Built for students, by contributors.
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Content is for educational purposes. Always verify with official sources.
          </p>
        </div>
      </div>
    </footer>
  );
}
