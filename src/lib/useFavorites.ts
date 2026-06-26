import { useCallback, useEffect, useState } from "react";

const KEY = "wc26_favorites";

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...favorites]));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [favorites]);

  const toggle = useCallback((teamId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setFavorites(new Set()), []);

  const isFavorite = useCallback((id: string | null) => !!id && favorites.has(id), [favorites]);

  return { favorites, toggle, clear, isFavorite };
}
