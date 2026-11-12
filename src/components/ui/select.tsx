"use client";

import * as React from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * M3 outlined select, on Base UI. Replaces the native <select>, which
 * couldn't be styled consistently and rendered as a tiny system menu on
 * phones — this is a proper listbox with keyboard navigation.
 *
 * Still posts a real value: Base UI renders a hidden input named `name`,
 * so the surrounding server-action <form> works unchanged.
 */
export function Select({
  name,
  options,
  placeholder = "Select…",
  defaultValue,
  value,
  onValueChange,
  disabled,
  required,
  title,
  className,
  triggerClassName,
}: {
  name?: string;
  options: SelectOption[];
  placeholder?: string;
  defaultValue?: string | null;
  value?: string | null;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  title?: string;
  className?: string;
  triggerClassName?: string;
}) {
  return (
    <BaseSelect.Root
      name={name}
      defaultValue={defaultValue ?? undefined}
      value={value ?? undefined}
      onValueChange={(v) => onValueChange?.(String(v ?? ""))}
      disabled={disabled}
      required={required}
    >
      <BaseSelect.Trigger
        title={title}
        className={cn(
          "m3-body flex h-12 w-full items-center justify-between gap-2 rounded-xs px-4",
          "border border-outline bg-transparent text-left text-on-surface",
          "transition-[border-color,box-shadow] duration-150",
          "outline-none focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--m3-primary)]",
          "data-[disabled]:cursor-not-allowed data-[disabled]:border-on-surface/12 data-[disabled]:text-on-surface/38",
          className,
          triggerClassName,
        )}
      >
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon className="shrink-0 text-on-surface-variant">
          <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden>
            <path
              d="M1 1.5 6 6.5 11 1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className="z-50">
          <BaseSelect.Popup
            className={cn(
              "max-h-[min(24rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto",
              "rounded-sm bg-surface-high p-2 text-on-surface shadow-e2",
              "outline outline-1 outline-outline-variant",
            )}
          >
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  className={cn(
                    "m3-body relative flex cursor-default items-center gap-2 rounded-xs py-2.5 pl-3 pr-8",
                    "select-none outline-none",
                    "data-[highlighted]:bg-on-surface/8",
                    "data-[selected]:bg-secondary-container data-[selected]:text-on-secondary-container",
                  )}
                >
                  <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="absolute right-3">
                    <svg width="14" height="11" viewBox="0 0 14 11" aria-hidden>
                      <path
                        d="M1 5.5 5 9.5 13 1.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
