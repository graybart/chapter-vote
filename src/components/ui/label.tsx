import * as React from "react";
import { cn } from "@/lib/utils";

function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("m3-label text-on-surface-variant", className)}
      {...props}
    />
  );
}

export { Label };
