import { GameCard } from "@/components/storefront/GameCard";
import { SiteFooter } from "@/components/storefront/SiteFooter";
import { SiteHeader } from "@/components/storefront/SiteHeader";
import { getActiveGames } from "@/lib/catalog/queries";

export default async function GamesPage() {
  const games = await getActiveGames();

  return (
    <main>
      <SiteHeader />

      <div className="storefront-shell">
        <section className="page-intro">
          <p className="eyebrow">CLUTCHTOPUP / GAMES</p>
          <h1>Choose a game.</h1>
          <p className="lead">
            Select a game to see the available top-ups.
          </p>
        </section>

        {games.length === 0 ? (
          <div className="empty-state">
            <p>No games are currently available.</p>
          </div>
        ) : (
          <section className="game-grid game-grid-large">
            {games.map((game) => (
              <GameCard
                key={game.id}
                name={game.name}
                slug={game.slug}
                description={game.description}
                imageUrl={game.image_url}
              />
            ))}
          </section>
        )}

        <SiteFooter />
      </div>
    </main>
  );
}