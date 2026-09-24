import Link from "next/link";
import { GameCard } from "@/components/storefront/GameCard";
import { SiteFooter } from "@/components/storefront/SiteFooter";
import { SiteHeader } from "@/components/storefront/SiteHeader";
import { getActiveGames } from "@/lib/catalog/queries";

export default async function HomePage() {
  const games = await getActiveGames();

  return (
    <main>
      <SiteHeader />

      <div className="storefront-shell">
        <section className="home-landing">
          <div className="landing-copy">
            <p className="eyebrow">GAME TOP-UPS</p>

            <h1>
              Choose your
              <br />
              game.
            </h1>

            <p className="lead">
              Pick a game, enter your Player ID, and get back in.
            </p>
          </div>

          <Link href="/games" className="primary-action">
            Browse games
            <span aria-hidden="true">→</span>
          </Link>
        </section>

        <section className="storefront-section" aria-labelledby="games-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">AVAILABLE NOW</p>
              <h2 id="games-heading">Choose your game.</h2>
            </div>

            <Link href="/games" className="section-link">
              View all →
            </Link>
          </div>

          {games.length === 0 ? (
            <div className="empty-state">
              <p>No games are currently available.</p>
            </div>
          ) : (
            <div className="game-grid">
              {games.slice(0, 4).map((game) => (
                <GameCard
                  key={game.id}
                  name={game.name}
                  slug={game.slug}
                  description={game.description}
                  imageUrl={game.image_url}
                />
              ))}
            </div>
          )}
        </section>

        <section className="storefront-section" aria-labelledby="flow-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">THE PROCESS</p>
              <h2 id="flow-heading">Back in the game.</h2>
            </div>
          </div>

          <div className="flow-grid">
            <article className="flow-card">
              <span>01</span>
              <h3>Choose</h3>
              <p>Select your game and top-up.</p>
            </article>

            <article className="flow-card">
              <span>02</span>
              <h3>Identify</h3>
              <p>Enter the player information required.</p>
            </article>

            <article className="flow-card">
              <span>03</span>
              <h3>Pay</h3>
              <p>Complete payment and let fulfillment run.</p>
            </article>
          </div>
        </section>

        <section className="track-prompt">
          <div>
            <p className="eyebrow">ALREADY ORDERED?</p>
            <h2>Check your order.</h2>
          </div>

          <p>
            Order tracking is coming next. Your purchase flow will remain
            accessible from your order confirmation.
          </p>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}