import { redirect } from "next/navigation";

import { logout } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    redirect("/auth/login");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">
          ACCOUNT
        </p>

        <h1>
          Welcome.
        </h1>

        <p className="lead">
          {user.email}
        </p>

        <form action={logout}>
          <button type="submit">
            Log out
          </button>
        </form>
      </section>
    </main>
  );
}