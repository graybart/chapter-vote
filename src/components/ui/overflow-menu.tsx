"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

/**
 * The "More" menu on a contest row.
 *
 * Base UI's Popover rather than the old <details>: this closes on outside
 * click and Escape, traps focus properly, and flips when it would run off
 * the bottom of the screen — none of which <details> did.
 *
 * Children are rendered by the server component that owns the row, so the
 * settings forms inside keep working as plain server-action <form>s.
 */
export function OverflowMenu({
  label = "More",
  title,
  children,
  className,
}: {
  label?: string;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "m3-label inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3",
          "border border-outline bg-transparent text-on-surface-variant",
          "transition-colors hover:bg-on-surface/8 data-[popup-open]:bg-on-surface/12",
          "outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40",
          className,
        )}
      >
        {label}
        <svg width="10" height="7" viewBox="0 0 12 8" aria-hidden>
          <path
            d="M1 1.5 6 6.5 11 1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={6}
          className="z-50"
        >
          <Popover.Popup
            className={cn(
              "w-72 max-h-[min(28rem,var(--available-height))] overflow-y-auto",
              "rounded-md bg-surface-high p-4 text-left text-on-surface shadow-e3",
              "outline outline-1 outline-outline-variant",
            )}
          >
            {title && (
              <Popover.Title className="m3-label-sm mb-3 text-on-surface-variant">
                {title}
              </Popover.Title>
            )}
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
