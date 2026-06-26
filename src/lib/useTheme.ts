import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

type Theme = "light" | "dark";

function initial(): Theme {
  const stored = sessionStorage.getItem("wc26_theme");
  if (stored === "light" || stored === "dark") return stored;
  const h = new Date().getHours();
  if (h >= 19 || h < 6) return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    sessionStorage.setItem("wc26_theme", theme);
  }, [theme]);

  return {
    theme,
    toggle: () => {
      const next: Theme = theme === "dark" ? "light" : "dark";
      // View Transitions cross-fades the whole page in one GPU pass — far
      // smoother than animating colors on every node. Fallback: instant swap.
      const start = (document as Document & {
        startViewTransition?: (cb: () => void) => void;
      }).startViewTransition?.bind(document);
      if (start && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        // flushSync forces the DOM (data-theme attribute) to update inside the
        // callback so the API snapshots the new theme, not the stale one.
        start(() => flushSync(() => setTheme(next)));
      } else {
        setTheme(next);
      }
    },
  };
}
