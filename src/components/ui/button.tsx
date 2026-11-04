import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // For an action the user still needs to take — e.g. unsaved edits.
        warning: "bg-amber-500 text-white hover:bg-amber-600",
        // For resuming / going — e.g. letting voting continue.
        success: "bg-emerald-600 text-white hover:bg-emerald-700",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Why this button is unavailable. When the button is disabled this is
   * shown as a tooltip on hover/focus — a disabled <button> doesn't emit
   * mouse events, so the hint lives on a wrapper span instead.
   */
  disabledReason?: string;
  /** Tooltip shown while the button *is* clickable. */
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
  const tooltip = props.disabled ? disabledReason : hint;

  const button = (
    <button
      className={cn(
        buttonVariants({ variant, size, className }),
        blocked && "pointer-events-none",
      )}
      {...props}
    />
  );

  if (!tooltip) return button;

  return (
    <span
      className={cn(
        "group relative inline-flex",
        blocked && "cursor-not-allowed",
      )}
      tabIndex={blocked ? 0 : undefined}
      title={tooltip}
      aria-label={blocked ? tooltip : undefined}
    >
      {button}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 hidden w-max max-w-[16rem] -translate-x-1/2 whitespace-normal rounded-md bg-primary px-2.5 py-1.5 text-xs font-normal leading-snug text-primary-foreground shadow-lg group-hover:block group-focus-within:block group-focus:block"
      >
        {tooltip}
      </span>
    </span>
  );
}

export { Button, buttonVariants };
