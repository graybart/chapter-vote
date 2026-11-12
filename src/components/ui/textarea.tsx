import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "m3-body flex min-h-[60px] w-full rounded-xs bg-transparent px-4 py-3",
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

export { Textarea };
