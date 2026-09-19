import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminCatalogOptions } from "@/lib/catalog/admin";

export default async function AdminPage() {
  const user = await requireAdmin();
  const options = await getAdminCatalogOptions();

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">CLUTCHTOPUP ADMIN</p>
          <h1>Dashboard</h1>
        </div>

        <Link href="/account">Account</Link>
      </header>

      <section className="admin-grid">
        <Link href="/admin/catalog" className="admin-card">
          <p className="eyebrow">CATALOG</p>
          <h2>Catalog sync</h2>
          <p>
            Inspect provider catalogs, map provider products, and
            apply approved changes.
          </p>
          <span>Open catalog →</span>
        </Link>

        <article className="admin-card">
          <p className="eyebrow">SYSTEM</p>
          <h2>Current state</h2>

          <div className="admin-stat">
            <span>Active games</span>
            <strong>{options.games.length}</strong>
          </div>

          <div className="admin-stat">
            <span>Active providers</span>
            <strong>{options.providers.length}</strong>
          </div>

          <div className="admin-stat">
            <span>Registered adapters</span>
            <strong>{options.registeredProviders.length}</strong>
          </div>
        </article>
      </section>
    </main>
  );
}
