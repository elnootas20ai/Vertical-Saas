"use client";

import * as React from "react";
import { cn } from "./utils";

/** Badge sutil y fintech para mostrar el periodo de tiempo en gráficas (s, d, m, y) */
export function PeriodBadge({
  period,
  variant = "default",
  className,
}: {
  period: string;
  variant?: "default" | "minimal" | "glass";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono text-[10px] tracking-[0.18em] uppercase font-medium",
        "select-none pointer-events-none",
        variant === "default" &&
          "text-gray-400/70 dark:text-gray-500/80 bg-gray-100/60 dark:bg-gray-800/50 px-2 py-0.5 rounded-md border border-gray-200/40 dark:border-gray-700/40",
        variant === "minimal" &&
          "text-gray-400/60 dark:text-gray-500/70",
        variant === "glass" &&
          "text-gray-500/75 dark:text-gray-400/75 bg-white/50 dark:bg-gray-800/60 backdrop-blur-md px-2.5 py-0.5 rounded-md border border-gray-200/50 dark:border-gray-600/40 shadow-sm",
        className
      )}
    >
      {period}
    </span>
  );
}
