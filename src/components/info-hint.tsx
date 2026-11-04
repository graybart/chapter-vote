/**
 * A small "?" bubble that explains a field on hover or keyboard focus.
 * Pure CSS, so it works inside server components.
 */
export function InfoHint({ text }: { text: string }) {
  return (
    <span
      className="group relative inline-flex cursor-help align-middle"
      tabIndex={0}
      title={text}
      aria-label={text}
    >
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/50 text-[10px] font-bold leading-none text-muted-foreground"
      >
        ?
      </span>
      <span
        role="tooltip"
        /* Anchored left rather than centred so a hint near the edge of a
           card can't be clipped off-screen on a narrow window. */
        className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 hidden w-max max-w-[18rem] whitespace-normal rounded-md bg-primary px-2.5 py-1.5 text-xs font-normal leading-snug text-primary-foreground shadow-lg group-hover:block group-focus:block"
      >
        {text}
      </span>
    </span>
  );
}
