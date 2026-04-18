"use client";

import { FilterBar } from "@/components/FilterBar";
import { GenerateButton } from "@/components/GenerateButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WorkoutCard } from "@/components/WorkoutCard";
import { generateWorkout } from "@/lib/engine";
import type { FilterState, GeneratedWorkout } from "@/lib/types";
import { useState } from "react";

const DEFAULT_FILTERS: FilterState = {
  intensity: "threshold",
  type: "crossfit",
  equipment: "full_gym",
  timeCapMinutes: 20,
};

export default function Page() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [workout, setWorkout] = useState<GeneratedWorkout | null>(null);
  const [loading, setLoading] = useState(false);

  function handleGenerate() {
    setLoading(true);
    // Tiny artificial delay so the loading state is felt — without feeling slow.
    window.setTimeout(() => {
      setWorkout(generateWorkout(filters));
      setLoading(false);
    }, 420);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 pt-6 pb-24">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-base font-semibold tracking-tight">NexusFit</span>
        </div>
        <ThemeToggle />
      </header>

      <section className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tightest leading-tight">
          A workout, composed for you.
        </h1>
        <p className="mt-2 text-ink-muted leading-relaxed">
          Constraint-balanced sessions across CrossFit, HYROX, and S&amp;C. Pick
          the stimulus — we&rsquo;ll handle the structure.
        </p>
      </section>

      <section className="mb-6">
        <FilterBar value={filters} onChange={setFilters} />
      </section>

      <div className="sticky bottom-3 sm:static z-10 mb-8">
        <GenerateButton
          onClick={handleGenerate}
          loading={loading}
          hasResult={!!workout}
        />
      </div>

      {workout && (
        <section>
          <WorkoutCard workout={workout} onWorkoutChange={setWorkout} />
        </section>
      )}

      {!workout && !loading && <Empty />}

      <footer className="mt-12 text-center text-xs text-ink-muted">
        Compose. Train. Repeat.
      </footer>
    </main>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl border border-dashed border-border dark:border-border-dark p-8 text-center text-sm text-ink-muted animate-fade-in">
      Set your filters above and tap{" "}
      <span className="text-ink dark:text-ink-dark font-medium">Generate</span>.
      Each result is balanced — never two heavy pulls back-to-back.
    </div>
  );
}

function Logo() {
  return (
    <span
      aria-hidden
      className="h-7 w-7 rounded-lg bg-ink dark:bg-ink-dark text-bg dark:text-bg-dark grid place-items-center text-[13px] font-bold tracking-tighter"
    >
      N
    </span>
  );
}
