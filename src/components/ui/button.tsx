"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

/**
 * Material 3 button, in the Delta Chi palette.
 *
 * Variants follow M3's emphasis ladder — filled for the main action in a
 * group, tonal just below it, outlined and text for everything else. The
 * `::after` pseudo-element is M3's state layer: hover and press tint the
 * button with its own foreground colour rather than swapping backgrounds.
 */
const buttonVariants = cva(
  [
    "relative isolate inline-flex items-center justify-center gap-2 overflow-hidden",
    "rounded-full whitespace-nowrap select-none",
    "font-sans font-semibold tracking-[0.006em]",
    "transition-[box-shadow,background-color,color,border-color] duration-150",
    "outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40",
    "disabled:pointer-events-none",
    // M3 state layer
    "after:absolute after:inset-0 after:-z-10 after:rounded-full",
    "after:bg-current after:opacity-0 after:transition-opacity after:duration-150",
    "hover:after:opacity-[0.08] active:after:opacity-[0.10]",
  ],
  {
    variants: {
      variant: {
        filled:
          "bg-primary text-on-primary shadow-none hover:shadow-e1 disabled:bg-on-surface/12 disabled:text-on-surface/38 disabled:shadow-none",
        tonal:
          "bg-secondary-container text-on-secondary-container hover:shadow-e1 disabled:bg-on-surface/12 disabled:text-on-surface/38 disabled:shadow-none",
        outlined:
          "border border-outline bg-transparent text-primary disabled:border-on-surface/12 disabled:text-on-surface/38",
        text: "bg-transparent text-primary disabled:text-on-surface/38",
        /** Destructive. Red is reserved for this — nothing else uses it. */
        destructive:
          "bg-error text-on-error hover:shadow-e1 disabled:bg-on-surface/12 disabled:text-on-surface/38 disabled:shadow-none",
        /** An action the user still needs to take, e.g. unsaved edits. */
        warning:
          "bg-brand-buff text-[#221a00] hover:shadow-e1 disabled:bg-on-surface/12 disabled:text-on-surface/38 disabled:shadow-none",
        success:
          "bg-tertiary text-on-tertiary hover:shadow-e1 disabled:bg-on-surface/12 disabled:text-on-surface/38 disabled:shadow-none",

        /* Aliases for the pre-M3 names, so existing call sites keep working
           and the visual change stays reviewable in one place. */
        default:
          "bg-primary text-on-primary shadow-none hover:shadow-e1 disabled:bg-on-surface/12 disabled:text-on-surface/38 disabled:shadow-none",
        secondary:
          "bg-secondary-container text-on-secondary-container hover:shadow-e1 disabled:bg-on-surface/12 disabled:text-on-surface/38 disabled:shadow-none",
        outline:
          "border border-outline bg-transparent text-primary disabled:border-on-surface/12 disabled:text-on-surface/38",
        ghost:
          "bg-transparent text-on-surface-variant disabled:text-on-surface/38",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-6 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "h-10 w-10 px-0",
        default: "h-10 px-6 text-sm",
      },
    },
    defaultVariants: { variant: "filled", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Why this button is unavailable; shown as a tooltip while disabled. */
  disabledReason?: string;
  /** Tooltip shown while the button IS clickable. */
  hint?: string;
}

function Button({
  className,
  variant,
  size,
  disabledReason,
  hint,
  ...props
}: ButtonProps) {
  const blocked = !!props.disabled && !!disabledReason;
  const tip = props.disabled ? disabledReason : hint;

  const button = (
    <button
      className={cn(
        buttonVariants({ variant, size, className }),
        blocked && "pointer-events-none",
      )}
      {...props}
    />
  );

  if (!tip) return button;

  // A disabled <button> emits no pointer events, so the tooltip trigger has
  // to be a wrapper around it rather than the button itself.
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <span
            className={cn(
              "inline-flex",
              blocked && "cursor-not-allowed",
            )}
            tabIndex={blocked ? 0 : undefined}
            aria-label={blocked ? tip : undefined}
          />
        }
      >
        {button}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="bottom" sideOffset={8}>
          <Tooltip.Popup className="max-w-64 rounded-sm bg-inverse-surface px-3 py-2 text-xs leading-snug text-inverse-on-surface shadow-e2">
            {tip}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export { Button, buttonVariants };
