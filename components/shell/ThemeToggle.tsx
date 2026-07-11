"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

type Theme = "light" | "dark";

// Inline script (runs before paint, in <head>) that applies the saved/OS theme
// so there's no flash of the wrong palette. Exported for the root layout.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('otto-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

function current(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  // Sync from the DOM after mount (the init script set it pre-paint), and arm
  // color transitions only now so the first paint doesn't animate.
  useEffect(() => {
    setTheme(current());
    document.documentElement.classList.add("theme-ready");
  }, []);

  function toggle() {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("otto-theme", next);
    } catch {}
    setTheme(next);
  }

  const nextLabel = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${nextLabel} mode`}
      title={`Switch to ${nextLabel} mode`}
      className="grid h-[34px] w-[34px] place-items-center rounded-md border border-line-2 bg-panel-2 text-muted transition-colors hover:bg-panel-3 hover:text-ink"
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
    </button>
  );
}
