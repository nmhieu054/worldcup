import { useCallback, useEffect, useState } from "react";

const KEY = "wc26-fav-matches";

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/** Favorite *matches* (by match id), separate from favorite teams. */
export function useFavoriteMatches() {
  const [favoriteMatches, setFavoriteMatches] = useState<Set<string>>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...favoriteMatches]));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [favoriteMatches]);

  const toggleMatch = useCallback((matchId: string) => {
    setFavoriteMatches((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  }, []);

  const clearMatches = useCallback(() => setFavoriteMatches(new Set()), []);

  const isFavoriteMatch = useCallback(
    (id: string | null) => !!id && favoriteMatches.has(id),
    [favoriteMatches]
  );

  return { favoriteMatches, toggleMatch, clearMatches, isFavoriteMatch };
}
