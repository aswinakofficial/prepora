import * as Avatar from "@radix-ui/react-avatar";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link } from "@tanstack/react-router";
import { LogOut, ShieldCheck } from "lucide-react";
import { authClient } from "../../../lib/auth-client";
import { useRBAC } from "../../hooks/useRBAC";
import { RoleGuard } from "./RoleGuard";

// The signed-in account in the site header: an avatar that opens a small menu saying who is signed
// in (full name and email — the header itself never shows the email) plus the account actions. On
// mobile the header's menu already is the popup, so MobileAccountSection renders the same identity
// inline there instead of a second dropdown.

interface AccountUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

/** "Aswin A K" → "AK", "Prepora" → "P"; falls back to the email's first letter. */
export function initialsFor(name?: string | null, email?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  if (words.length === 1) return words[0][0].toUpperCase();
  return (email?.trim()[0] ?? "?").toUpperCase();
}

export function UserAvatar({ user, size = 28 }: { user: AccountUser; size?: number }) {
  return (
    <Avatar.Root
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-800 bg-slate-900 align-middle"
      style={{ width: size, height: size }}
    >
      {user.image && (
        <Avatar.Image
          src={user.image}
          alt=""
          // Google profile-photo URLs can refuse requests that carry a referrer.
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      )}
      {/* Shown until the photo loads, and instead of it when there is none or it fails. */}
      <Avatar.Fallback
        className="font-mono font-semibold text-slate-300 tracking-normal"
        style={{ fontSize: Math.round(size * 0.38) }}
      >
        {initialsFor(user.name, user.email)}
      </Avatar.Fallback>
    </Avatar.Root>
  );
}

function AccountIdentity({ user, isAdmin }: { user: AccountUser; isAdmin: boolean }) {
  return (
    <div className="flex items-start gap-3 normal-case tracking-normal">
      <UserAvatar user={user} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {user.name && (
            <span className="truncate font-sans text-sm font-medium text-white">{user.name}</span>
          )}
          {isAdmin && (
            <span className="shrink-0 border border-emerald-900 bg-emerald-950/40 px-1.5 py-px font-mono text-[9px] uppercase tracking-widest text-emerald-400">
              Admin
            </span>
          )}
        </div>
        {/* Full address, wrapped — never truncated. */}
        <p className="mt-0.5 break-all font-mono text-[11px] text-slate-400">{user.email}</p>
      </div>
    </div>
  );
}

const MENU_ITEM =
  "flex cursor-pointer select-none items-center gap-2.5 px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest outline-none transition-colors data-[highlighted]:bg-slate-900";

/** Desktop header: the avatar button and its account menu. Renders nothing when signed out. */
export function UserMenu() {
  const { user, isAdmin, isAuthenticated } = useRBAC();
  if (!isAuthenticated || !user) return null;

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label="Account menu"
        className="shrink-0 rounded-full outline-none ring-offset-2 ring-offset-[#06080a] transition-shadow hover:ring-1 hover:ring-slate-600 focus-visible:ring-1 focus-visible:ring-slate-400"
      >
        <UserAvatar user={user} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="z-50 w-72 border border-slate-800 bg-[#06080a] shadow-2xl shadow-black/60"
        >
          <div className="px-4 py-4">
            <AccountIdentity user={user} isAdmin={isAdmin} />
          </div>
          <RoleGuard requireAdmin>
            <DropdownMenu.Separator className="h-px bg-slate-900" />
            <DropdownMenu.Item asChild className={`${MENU_ITEM} text-emerald-400`}>
              <Link to="/admin">
                <ShieldCheck className="h-3.5 w-3.5" /> Admin dashboard
              </Link>
            </DropdownMenu.Item>
          </RoleGuard>
          <DropdownMenu.Separator className="h-px bg-slate-900" />
          <DropdownMenu.Item
            className={`${MENU_ITEM} text-slate-300 hover:text-white`}
            onSelect={() => {
              void authClient.signOut();
            }}
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Mobile menu: who is signed in, and Sign out. Renders nothing when signed out. */
export function MobileAccountSection({ onNavigate }: { onNavigate: () => void }) {
  const { user, isAdmin, isAuthenticated } = useRBAC();
  if (!isAuthenticated || !user) return null;

  return (
    <div className="pt-4">
      <AccountIdentity user={user} isAdmin={isAdmin} />
      <button
        type="button"
        onClick={async () => {
          onNavigate();
          await authClient.signOut();
        }}
        className="mt-4 flex items-center gap-2 py-2 text-slate-400 uppercase tracking-widest hover:text-white"
      >
        <LogOut className="h-3.5 w-3.5" /> Sign out
      </button>
    </div>
  );
}
