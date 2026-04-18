"use client";

import { swapMovement, workoutToText } from "@/lib/engine";
import type { GeneratedWorkout } from "@/lib/types";
import { Check, Copy, Repeat } from "lucide-react";
import { useState } from "react";

interface Props {
  workout: GeneratedWorkout;
  onWorkoutChange: (next: GeneratedWorkout) => void;
}

export function WorkoutCard({ workout, onWorkoutChange }: Props) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard
      .writeText(workoutToText(workout))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  }

  function swap(idx: number) {
    const segment = workout.segments[idx];
    const replacement = swapMovement(segment.movementId, workout);
    if (!replacement) return;
    const segments = [...workout.segments];
    segments[idx] = replacement;
    onWorkoutChange({ ...workout, segments });
  }

  return (
    <div className="animate-slide-up">
      <div className="rounded-2xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark overflow-hidden">
        <div className="px-5 sm:px-6 pt-6 pb-5 border-b border-border dark:border-border-dark">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-widest text-ink-muted">
                {workout.format.replace("_", " ")} · {labelType(workout.type)}
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tightest mt-1 truncate">
                {workout.title}
              </h2>
              <div className="mt-1 text-sm text-ink-muted">{workout.structure}</div>
            </div>
            <button
              onClick={copy}
              className="shrink-0 h-9 px-3 rounded-full border border-border dark:border-border-dark text-sm inline-flex items-center gap-1.5 text-ink/80 dark:text-ink-dark/80 hover:text-ink dark:hover:text-ink-dark hover:border-ink/30 dark:hover:border-ink-dark/30 transition-colors"
              aria-label="Copy workout"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <ul className="divide-y divide-border dark:divide-border-dark">
          {workout.segments.map((s, i) => (
            <li
              key={`${s.movementId}-${i}`}
              className="px-5 sm:px-6 py-4 flex items-center justify-between gap-3 group"
            >
              <div className="min-w-0">
                {s.strengthSet ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-semibold tabular-nums tracking-tight">
                        {s.strengthSet.sets} × {s.reps}
                      </span>
                      <span className="text-xs uppercase tracking-widest text-ink-muted">
                        @ {s.strengthSet.scheme}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-base">
                      {s.movement.name}
                      {s.loadHint && (
                        <span className="ml-2 text-sm text-ink-muted">
                          · {s.loadHint}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      Rest {formatRest(s.strengthSet.restSec)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-semibold tabular-nums tracking-tight">
                        {s.reps}
                      </span>
                      <span className="text-xs uppercase tracking-widest text-ink-muted">
                        {unitLabel(s.unit)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-base">
                      {s.movement.name}
                      {s.loadHint && (
                        <span className="ml-2 text-sm text-ink-muted">
                          · {s.loadHint}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => swap(i)}
                className="shrink-0 h-9 w-9 grid place-items-center rounded-full border border-transparent group-hover:border-border dark:group-hover:border-border-dark text-ink-muted hover:text-ink dark:hover:text-ink-dark transition-all"
                aria-label={`Swap ${s.movement.name}`}
                title="Swap for similar stimulus"
              >
                <Repeat className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="px-5 sm:px-6 py-3 border-t border-border dark:border-border-dark text-xs text-ink-muted flex items-center justify-between">
          <span>Time cap · {workout.timeCapMinutes} min</span>
          <span>{labelIntensity(workout.intensity)}</span>
        </div>
      </div>
    </div>
  );
}

function labelType(t: string) {
  if (t === "crossfit") return "CrossFit";
  if (t === "hyrox") return "HYROX";
  if (t === "strength") return "Strength";
  return "Strength & Conditioning";
}

function formatRest(sec: number) {
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return r === 0 ? `${m} min` : `${m}:${r.toString().padStart(2, "0")}`;
  }
  return `${sec}s`;
}

function labelIntensity(i: string) {
  if (i === "recovery") return "Recovery";
  if (i === "aerobic") return "Aerobic Capacity";
  if (i === "threshold") return "Threshold";
  return "Maximum Effort";
}

function unitLabel(u: string) {
  if (u === "m") return "meters";
  if (u === "cal") return "calories";
  if (u === "sec") return "seconds";
  return "reps";
}
