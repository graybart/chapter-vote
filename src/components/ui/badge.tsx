import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * M3 assist chip. Tonal container colours rather than saturated pills —
 * these sit next to a contest title and shouldn't shout over it.
 */
const badgeVariants = cva(
  "m3-label-sm inline-flex items-center rounded-sm px-2 py-1 whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-primary-container text-on-primary-container",
        secondary: "bg-surface-highest text-on-surface-variant",
        success: "bg-tertiary-container text-on-tertiary-container",
        warning: "bg-secondary-container text-on-secondary-container",
        destructive: "bg-error-container text-on-error-container",
        outline: "border border-outline text-on-surface-variant",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
