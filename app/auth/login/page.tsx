import Link from "next/link";
import { login } from "@/app/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    registered?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">CLUTCHTOPUP</p>
        <h1>Log in</h1>

        {params.registered && (
          <p className="notice">Account created. You can now log in.</p>
        )}

        {params.error && (
          <p className="error">Unable to log in. Check your details.</p>
        )}

        <form action={login} className="auth-form">
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>

          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>

          <button type="submit">Log in</button>
        </form>

        <p className="auth-footer">
          No account? <Link href="/auth/signup">Create one</Link>
        </p>
      </section>
    </main>
  );
}