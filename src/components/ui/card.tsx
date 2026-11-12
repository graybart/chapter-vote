import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * M3 card. Defaults to the "filled" style — a tonal surface container
 * rather than a white box with a border, which is the single biggest cue
 * that separates a Material surface from a default Tailwind panel.
 */
function Card({
  className,
  variant = "filled",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "filled" | "elevated" | "outlined";
}) {
  return (
    <div
      className={cn(
        "rounded-lg text-on-surface",
        variant === "filled" && "bg-surface-low",
        variant === "elevated" && "bg-surface-lowest shadow-e1",
        variant === "outlined" && "border border-outline-variant bg-surface",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />
  );
}

function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("m3-title-lg text-on-surface", className)} {...props} />;
}

function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("m3-body text-on-surface-variant", className)}
      {...props}
    />
  );
}

function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center p-5 pt-0", className)} {...props} />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
