import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * M3 outlined text field. The tell is the 1px outline that thickens to 2px
 * in the primary colour on focus, rather than a drop-shadow focus ring.
 */
function Input({
  className,
  type,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "m3-body flex h-12 w-full rounded-xs bg-transparent px-4 py-2",
        "border border-outline text-on-surface",
        "placeholder:text-on-surface-variant/70",
        "transition-[border-color,box-shadow] duration-150",
        "outline-none focus:border-primary focus:shadow-[inset_0_0_0_1px_var(--m3-primary)]",
        "disabled:cursor-not-allowed disabled:border-on-surface/12 disabled:text-on-surface/38",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
