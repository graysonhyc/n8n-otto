import type { ReactElement, SVGProps } from "react";

// Zero-dependency icon set (stroke-based, 24px grid). One consistent visual
// weight across the whole app — replaces ad-hoc unicode glyphs.
export type IconName =
  | "shield"
  | "table"
  | "people"
  | "map"
  | "clock"
  | "search"
  | "rescan"
  | "send"
  | "check"
  | "warn"
  | "external"
  | "assign"
  | "diff"
  | "mute"
  | "bell"
  | "chevron"
  | "plus"
  | "sliders"
  | "sort"
  | "flow"
  | "bot"
  | "book"
  | "home"
  | "pulse"
  | "pencil";

const PATHS: Record<IconName, ReactElement> = {
  shield: <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z M9 12l2 2 4-4" />,
  table: <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 9h18 M9 9v12" />,
  people: <path d="M9 8a3.2 3.2 0 1 0 0-.01 M3.5 19a5.5 5.5 0 0 1 11 0 M16 8h5 M16 12h5" />,
  map: <path d="M6 6a2.5 2.5 0 1 0 0-.01 M18 10a2.5 2.5 0 1 0 0-.01 M9 18a2.5 2.5 0 1 0 0-.01 M8 7l8 2 M8 16l8-5" />,
  clock: <path d="M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  search: <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4-4" />,
  rescan: <path d="M4 12a8 8 0 0 1 14-5l2 2 M20 12a8 8 0 0 1-14 5l-2-2 M18 4v5h-5 M6 20v-5h5" />,
  send: <path d="M22 2L11 13 M22 2l-7 20-4-9-9-4z" />,
  check: <path d="M20 6L9 17l-5-5" />,
  warn: <path d="M12 9v4 M12 17h.01 M10.3 3.9l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  external: <path d="M7 17L17 7 M9 7h8v8" />,
  assign: <path d="M9 8a3 3 0 1 0 0-.01 M4 19a5 5 0 0 1 10 0 M17 8v6 M14 11h6" />,
  diff: <path d="M12 3v18 M5 8l-3 4 3 4 M19 8l3 4-3 4" />,
  mute: <path d="M11 5L6 9H2v6h4l5 4z M22 9l-6 6 M16 9l6 6" />,
  bell: <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  plus: <path d="M12 5v14 M5 12h14" />,
  sliders: <path d="M4 6h16 M7 12h10 M10 18h4" />,
  sort: <path d="M8 4v16 M4 8l4-4 4 4 M16 20V4 M12 16l4 4 4-4" />,
  flow: <path d="M5 12a2 2 0 1 0 0-.01 M19 6a2 2 0 1 0 0-.01 M19 18a2 2 0 1 0 0-.01 M7 12h4 M13 8l4-1.5 M13 16l4 1.5" />,
  bot: <path d="M12 3v3 M7 8h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M9 13h.01 M15 13h.01 M2 12v3 M22 12v3" />,
  book: <path d="M4 4h11a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z M17 20h3V6a2 2 0 0 0-2-2h-1" />,
  home: <path d="M3 11l9-8 9 8 M5 10v9h14v-9" />,
  pulse: <path d="M3 12h4l2-5 4 12 2-7h6" />,
  pencil: <path d="M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
};

export function Icon({
  name,
  size = 16,
  ...props
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
