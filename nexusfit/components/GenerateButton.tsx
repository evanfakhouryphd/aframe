"use client";

import { cn } from "@/lib/cn";
import { Loader2, Sparkles } from "lucide-react";

interface Props {
  onClick: () => void;
  loading: boolean;
  hasResult: boolean;
}

export function GenerateButton({ onClick, loading, hasResult }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "w-full h-14 rounded-2xl font-medium text-base inline-flex items-center justify-center gap-2.5",
        "bg-ink text-bg dark:bg-ink-dark dark:text-bg-dark",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_8px_24px_-12px_rgba(0,0,0,0.45)]",
        "transition-all duration-150 active:scale-[0.99] disabled:opacity-80",
        "tracking-tight"
      )}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Composing…</span>
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" />
          <span>{hasResult ? "Generate Another" : "Generate Workout"}</span>
        </>
      )}
    </button>
  );
}
