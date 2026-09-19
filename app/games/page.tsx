import Link from "next/link";
import { getActiveGames } from "@/lib/catalog/queries";

export default async function GamesPage() {
  const games = await getActiveGames();

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">CLUTCHTOPUP</p>
        <h1>Choose a game.</h1>

        {games.length === 0 ? (
          <p className="lead">No games are currently available.</p>
        ) : (
          <div className="catalog-grid">
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/products/${game.slug}`}
                className="catalog-card"
              >
                <h2>{game.name}</h2>
                {game.description && <p>{game.description}</p>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}