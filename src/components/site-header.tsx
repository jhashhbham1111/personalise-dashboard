import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";
import { unreadNotificationCount } from "@/lib/notify";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";
import { ButtonLink } from "./ui/button";

const NAV = [
  { href: "/instructors", label: "Instructors" },
  { href: "/classes", label: "Classes" },
  { href: "/videos", label: "Videos" },
];

/**
 * `homeHref` and `showPublicNav` let each role-scoped layout (studio,
 * dashboard, admin) anchor the wordmark to that person's own home instead of
 * the public marketplace. Without this, an instructor clicking the logo from
 * inside Studio landed on the general "/" homepage — the same browse-everyone
 * view a signed-out visitor or student sees — which read as if their own
 * account had reset to a student view. Marketing pages (and anyone signed
 * out) keep the default: logo → "/", full public nav.
 */
export async function SiteHeader({
  homeHref = "/",
  showPublicNav = true,
}: {
  homeHref?: string;
  showPublicNav?: boolean;
} = {}) {
  const user = await getCurrentUser();
  const unread = user ? await unreadNotificationCount(user.id) : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6 md:gap-6">
        {/* Phones get a real menu button; the wide nav below takes over at md. */}
        {showPublicNav ? <MobileNav items={NAV} /> : null}

        <Link href={homeHref} aria-label="Personalise home">
          <Logo />
        </Link>

        {showPublicNav ? (
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <UserMenu user={user} unreadCount={unread} />
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/signup" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
