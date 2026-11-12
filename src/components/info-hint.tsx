"use client";

import { Tooltip } from "@base-ui/react/tooltip";

/**
 * A "?" bubble that explains a field. On Base UI's Tooltip rather than the
 * old CSS group-hover trick, which fired every tooltip in a container at
 * once when two of them were nested.
 */
export function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <span
            tabIndex={0}
            aria-label={text}
            className="inline-flex cursor-help align-middle outline-none"
          />
        }
      >
        <span
          aria-hidden
          className="flex h-4 w-4 items-center justify-center rounded-full border border-on-surface-variant/60 text-[10px] font-bold leading-none text-on-surface-variant transition-colors hover:border-on-surface hover:text-on-surface"
        >
          ?
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={8} className="z-50">
          <Tooltip.Popup className="max-w-72 rounded-sm bg-inverse-surface px-3 py-2 text-xs leading-snug text-inverse-on-surface shadow-e2">
            {text}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
