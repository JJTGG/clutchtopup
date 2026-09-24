import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAnonymous = user?.is_anonymous === true;

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link
          href="/"
          className="brand"
          aria-label="ClutchTopUp home"
        >
          CLUTCHTOPUP
        </Link>

        <nav
          className="site-nav"
          aria-label="Main navigation"
        >
          <Link href="/games">
            Games
          </Link>

          {user && !isAnonymous ? (
            <Link href="/account">
              Account
            </Link>
          ) : (
            <Link href="/auth/login">
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}