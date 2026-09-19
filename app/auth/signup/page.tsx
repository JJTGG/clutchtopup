import Link from "next/link";
import { signup } from "@/app/actions/auth";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">CLUTCHTOPUP</p>
        <h1>Create account</h1>

        {params.error && (
          <p className="error">
            Account creation failed. Use a valid email and a password of at
            least 8 characters.
          </p>
        )}

        <form action={signup} className="auth-form">
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>

          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </label>

          <button type="submit">Create account</button>
        </form>

        <p className="auth-footer">
          Already registered? <Link href="/auth/login">Log in</Link>
        </p>
      </section>
    </main>
  );
}