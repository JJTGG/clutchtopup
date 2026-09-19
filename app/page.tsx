import Link from "next/link";
import { getActiveGames } from "@/lib/catalog/queries";

export default async function HomePage() {
  const games = await getActiveGames();

  return (
    <main className="shell">
      <header className="site-header">
        <Link href="/" className="brand">
          CLUTCHTOPUP
        </Link>

        <nav className="site-nav">
          <Link href="/games">Games</Link>
          <Link href="/auth/login">Log in</Link>
        </nav>
      </header>

      <section className="hero home-hero">
        <p className="eyebrow">DIGITAL GAMING TOP-UP</p>

        <h1>Top up your game.<br />Get back in.</h1>

        <p className="lead">
          Fast, straightforward game top-ups with a simple order and
          fulfillment process.
        </p>

        <div className="hero-actions">
          <Link href="/games" className="primary-action">
            Browse games
          </Link>

          <Link href="/auth/signup" className="secondary-action">
            Create account
          </Link>
        </div>
      </section>

      <section className="home-games">
        <div className="section-heading">
          <div>
            <p className="eyebrow">AVAILABLE GAMES</p>
            <h2>Choose your game.</h2>
          </div>

          <Link href="/games">View all</Link>
        </div>

        {games.length === 0 ? (
          <p className="lead">No games are currently available.</p>
        ) : (
          <div className="catalog-grid">
            {games.slice(0, 5).map((game) => (
              <Link
                key={game.id}
                href={`/products/${game.slug}`}
                className="catalog-card"
              >
                <h3>{game.name}</h3>

                {game.description && (
                  <p>{game.description}</p>
                )}

                <span>View products →</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="home-flow">
        <p className="eyebrow">HOW IT WORKS</p>

        <div className="flow-grid">
          <article>
            <span>01</span>
            <h3>Choose</h3>
            <p>Select a game and the top-up you want.</p>
          </article>

          <article>
            <span>02</span>
            <h3>Order</h3>
            <p>Enter the player information required for fulfillment.</p>
          </article>

          <article>
            <span>03</span>
            <h3>Top up</h3>
            <p>Complete payment and let the fulfillment process run.</p>
          </article>
        </div>
      </section>

      <footer className="site-footer">
        <span>© ClutchTopUp</span>

        <div>
          <Link href="/games">Games</Link>
          <Link href="/auth/login">Log in</Link>
          <Link href="/auth/signup">Register</Link>
        </div>
      </footer>
    </main>
  );
}