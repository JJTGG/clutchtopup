import Link from "next/link";

type GameCardProps = {
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
};

export function GameCard({
  name,
  slug,
  description,
  imageUrl,
}: GameCardProps) {
  return (
    <Link
      href={`/games/${slug}`}
      className="game-card"
      style={
        imageUrl
          ? {
              backgroundImage: `linear-gradient(
                180deg,
                rgba(8, 9, 11, 0.05) 0%,
                rgba(8, 9, 11, 0.28) 45%,
                rgba(8, 9, 11, 0.96) 100%
              ), url("${imageUrl}")`,
            }
          : undefined
      }
    >
      <div className="game-card-content">
        <div>
          <p className="game-card-kicker">GAME</p>
          <h2>{name}</h2>

          {description && <p>{description}</p>}
        </div>

        <span className="game-card-action" aria-hidden="true">
          →
        </span>
      </div>
    </Link>
  );
}