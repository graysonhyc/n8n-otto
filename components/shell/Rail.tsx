// The narrow icon rail on the far left — evokes the n8n app frame.
export function Rail() {
  return (
    <nav
      aria-label="n8n"
      className="flex w-[52px] flex-col items-center gap-4 border-r border-line bg-[#0e0e13] py-3.5"
    >
      <div className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-accent text-sm font-extrabold text-accent-ink">
        n
      </div>
      {["⌂", "⚙", "◷"].map((g, i) => (
        <span
          key={i}
          className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-[#191921] text-[13px] text-faint"
        >
          {g}
        </span>
      ))}
      <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-accent-dim text-[13px] text-accent">
        ◎
      </span>
    </nav>
  );
}
