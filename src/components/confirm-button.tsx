"use client";

import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Submit button that asks for confirmation before letting the surrounding
 * <form action={serverAction}> fire. Usable inside server components.
 */
export function ConfirmButton({
  confirmMessage,
  onClick,
  ...props
}: ButtonProps & { confirmMessage: string }) {
  return (
    <Button
      {...props}
      onClick={(e) => {
        if (!confirm(confirmMessage)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    />
  );
}
