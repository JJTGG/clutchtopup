import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <span className="footer-brand">CLUTCHTOPUP</span>
        <span>Digital gaming top-ups.</span>
      </div>

      <nav aria-label="Footer navigation">
        <Link href="/games">Games</Link>
        <Link href="/auth/login">Log in</Link>
        <Link href="/auth/signup">Register</Link>
      </nav>
    </footer>
  );
}