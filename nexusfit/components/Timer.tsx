"use client";

import { cn } from "@/lib/cn";
import type {
  GeneratedBlock,
  GeneratedWorkout,
  WorkoutConfig,
} from "@/lib/types";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  workout: GeneratedWorkout;
  onRunningChange?: (running: boolean) => void;
}

// Multi-block timer. Sequences through blocks A → rest → B → rest → C.
export function Timer({ workout, onRunningChange }: Props) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const onRunningChangeRef = useRef(onRunningChange);
  onRunningChangeRef.current = onRunningChange;

  const totalSec = useMemo(() => totalDurationSec(workout), [workout]);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      if (startRef.current == null) startRef.current = now;
      setElapsed(offsetRef.current + (now - startRef.current) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  useEffect(() => {
    setRunning(false);
    setElapsed(0);
    startRef.current = null;
    offsetRef.current = 0;
    onRunningChangeRef.current?.(false);
  }, [workout.id]);

  const phase = deriveWorkoutPhase(workout, elapsed);

  function toggle() {
    if (running) {
      offsetRef.current = elapsed;
      startRef.current = null;
      setRunning(false);
      onRunningChangeRef.current?.(false);
    } else {
      setRunning(true);
      onRunningChangeRef.current?.(true);
    }
  }

  function reset() {
    setRunning(false);
    setElapsed(0);
    startRef.current = null;
    offsetRef.current = 0;
    onRunningChangeRef.current?.(false);
  }

  function skipToNext() {
    // Jump forward to the start of the next block (or to rest), skipping
    // over the current block if finished early (common for strength).
    const pos = locatePosition(workout, elapsed);
    if (pos.kind === "done") return;
    let target = elapsed;
    if (pos.kind === "block") {
      target = pos.cursor + workout.blocks[pos.idx].durationSec;
    } else if (pos.kind === "rest") {
      target = pos.cursor + workout.blocks[pos.fromIdx].restAfterSec;
    }
    setElapsed(target);
    offsetRef.current = target;
    startRef.current = null;
  }

  return (
    <div className="rounded-2xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div
            className={cn(
              "text-[11px] uppercase tracking-widest",
              phase.accent === "work"
                ? "text-red-500 dark:text-red-400"
                : phase.accent === "rest"
                  ? "text-sky-500 dark:text-sky-400"
                  : "text-ink-muted"
            )}
          >
            {phase.label}
          </div>
          <div className="text-[64px] sm:text-[80px] leading-none font-semibold tabular-nums tracking-tightest mt-1">
            {phase.display}
          </div>
        </div>
        <div className="text-right text-xs text-ink-muted shrink-0">
          <div>Session left</div>
          <div className="text-base font-medium tabular-nums text-ink dark:text-ink-dark">
            {fmt(Math.max(0, totalSec - elapsed))}
          </div>
        </div>
      </div>

      {phase.subline && (
        <div className="mt-3 text-sm text-ink-muted">{phase.subline}</div>
      )}

      {phase.stats && phase.stats.length > 0 && (
        <div
          className={cn(
            "mt-4 grid gap-3",
            phase.stats.length === 2 ? "grid-cols-2" : "grid-cols-3"
          )}
        >
          {phase.stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border dark:border-border-dark px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-widest text-ink-muted">
                {s.label}
              </div>
              <div className="text-base font-medium tabular-nums text-ink dark:text-ink-dark mt-0.5 truncate">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={toggle}
          className={cn(
            "h-12 px-5 rounded-full inline-flex items-center gap-2 font-medium transition-all",
            running
              ? "bg-surface dark:bg-surface-dark border border-border dark:border-border-dark text-ink dark:text-ink-dark"
              : "bg-ink text-bg dark:bg-ink-dark dark:text-bg-dark"
          )}
        >
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? "Pause" : elapsed > 0 ? "Resume" : "Start"}
        </button>
        {workout.blocks.length > 1 && (
          <button
            onClick={skipToNext}
            className="h-12 px-4 rounded-full border border-border dark:border-border-dark text-sm text-ink-muted hover:text-ink dark:hover:text-ink-dark inline-flex items-center gap-2 transition-colors"
            aria-label="Skip to next phase"
            title="Skip to next phase"
          >
            <SkipForward className="h-4 w-4" />
            Skip
          </button>
        )}
        <button
          onClick={reset}
          className="h-12 w-12 grid place-items-center rounded-full border border-border dark:border-border-dark text-ink-muted hover:text-ink dark:hover:text-ink-dark transition-colors ml-auto"
          aria-label="Reset"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function totalDurationSec(w: GeneratedWorkout): number {
  return w.blocks.reduce((a, b) => a + b.durationSec + b.restAfterSec, 0);
}

type Position =
  | { kind: "block"; idx: number; cursor: number; blockElapsed: number }
  | { kind: "rest"; fromIdx: number; cursor: number; restElapsed: number }
  | { kind: "done" };

function locatePosition(w: GeneratedWorkout, elapsed: number): Position {
  let cursor = 0;
  for (let i = 0; i < w.blocks.length; i++) {
    const b = w.blocks[i];
    if (elapsed < cursor + b.durationSec) {
      return { kind: "block", idx: i, cursor, blockElapsed: elapsed - cursor };
    }
    cursor += b.durationSec;
    if (b.restAfterSec > 0) {
      if (elapsed < cursor + b.restAfterSec) {
        return {
          kind: "rest",
          fromIdx: i,
          cursor,
          restElapsed: elapsed - cursor,
        };
      }
      cursor += b.restAfterSec;
    }
  }
  return { kind: "done" };
}

interface Phase {
  label: string;
  display: string;
  subline?: string;
  stats?: { label: string; value: string }[];
  accent?: "work" | "rest" | "neutral";
}

function deriveWorkoutPhase(w: GeneratedWorkout, elapsed: number): Phase {
  const pos = locatePosition(w, elapsed);
  if (pos.kind === "done") {
    return { label: "Session complete", display: "0:00", subline: "Time." };
  }
  if (pos.kind === "rest") {
    const from = w.blocks[pos.fromIdx];
    const next = w.blocks[pos.fromIdx + 1];
    const remaining = Math.max(0, from.restAfterSec - pos.restElapsed);
    return {
      label: `REST — Block ${from.label} → ${next?.label ?? "—"}`,
      display: fmt(remaining),
      subline: next ? `Up next: ${next.title}` : undefined,
      accent: "rest",
      stats: [
        { label: "Coming", value: next?.title ?? "—" },
        { label: "Exercises", value: `${next?.segments.length ?? 0}` },
      ],
    };
  }

  const block = w.blocks[pos.idx];
  const inner = derivePhaseForBlock(block, pos.blockElapsed);
  const blockTag = `Block ${block.label}`;
  const blockProgress = `${pos.idx + 1}/${w.blocks.length}`;
  const label = inner.label
    ? `${blockTag} · ${inner.label}`
    : `${blockTag} · ${block.title}`;

  // Prepend a Block stat, then keep up to 2 of the inner stats so we stay
  // within three cells.
  const innerStats = inner.stats ?? [];
  const stats: { label: string; value: string }[] = [
    { label: "Block", value: `${block.label} · ${blockProgress}` },
    ...innerStats.slice(0, 2),
  ];

  return {
    ...inner,
    label,
    stats,
  };
}

function derivePhaseForBlock(block: GeneratedBlock, elapsed: number): Phase {
  return derivePhase(block.config, elapsed, block);
}

function derivePhase(
  config: WorkoutConfig,
  elapsed: number,
  block: GeneratedBlock
): Phase {
  const blockLeft = Math.max(0, block.durationSec - elapsed);
  switch (config.format) {
    case "amrap": {
      const remaining = Math.max(0, config.durationSec - elapsed);
      return {
        label: `AMRAP ${config.durationSec / 60}`,
        display: fmt(remaining),
        subline: remaining === 0 ? "Time." : "Score = rounds + reps",
        stats: [{ label: "Block left", value: fmt(blockLeft) }],
      };
    }
    case "for_time":
    case "chipper": {
      const cap = config.capSec;
      return {
        label: cap ? `Cap ${cap / 60} min` : "For Time",
        display: fmt(elapsed),
        subline:
          cap && elapsed >= cap
            ? "Cap reached."
            : "Score = elapsed time to finish",
        stats: cap ? [{ label: "Cap left", value: fmt(Math.max(0, cap - elapsed)) }] : undefined,
      };
    }
    case "emom": {
      const total = config.minutes * 60;
      const minute = Math.min(config.minutes, Math.floor(elapsed / 60) + 1);
      const inMinute = elapsed % 60;
      const remainingInMin = Math.max(0, 60 - inMinute);
      const station = ((minute - 1) % config.stations) + 1;
      const done = elapsed >= total;
      return {
        label: done ? "EMOM Complete" : `EMOM · Min ${minute}/${config.minutes}`,
        display: done ? "0:00" : fmt(remainingInMin),
        subline: done ? "Time." : `Station ${station} of ${config.stations}`,
        stats: done
          ? undefined
          : [
              { label: "Round", value: `${minute}/${config.minutes}` },
              { label: "Station", value: `${station}/${config.stations}` },
            ],
      };
    }
    case "tabata": {
      const cycle = config.workSec + config.restSec;
      const totalCycles = config.rounds * config.movements;
      const cycleIdx = Math.floor(elapsed / cycle);
      const inCycle = elapsed % cycle;
      const isWork = inCycle < config.workSec;
      const remaining = isWork
        ? config.workSec - inCycle
        : cycle - inCycle;
      const done = cycleIdx >= totalCycles;
      const round = Math.floor(cycleIdx / config.movements) + 1;
      const movementIdx = (cycleIdx % config.movements) + 1;
      return {
        label: done
          ? "Tabata Complete"
          : isWork
            ? `WORK · Rd ${round}/${config.rounds}`
            : "REST",
        display: done ? "0:00" : Math.ceil(remaining).toString(),
        subline: done
          ? "Time."
          : config.movements > 1
            ? `Movement ${movementIdx} of ${config.movements}`
            : undefined,
        accent: done ? "neutral" : isWork ? "work" : "rest",
        stats: done
          ? undefined
          : [
              { label: "Round", value: `${round}/${config.rounds}` },
              {
                label: "Movement",
                value: `${movementIdx}/${config.movements}`,
              },
            ],
      };
    }
    case "ygig": {
      const cap = config.capSec;
      return {
        label: `YGIG · ${config.rounds} rds`,
        display: fmt(elapsed),
        subline:
          cap && elapsed >= cap ? "Cap reached." : "Alternate full rounds",
        stats: [
          { label: "Target", value: `${config.rounds} rds` },
          { label: "Cap left", value: fmt(Math.max(0, cap - elapsed)) },
        ],
      };
    }
    case "interval": {
      const cycle = config.workSec + config.restSec;
      const totalSec = cycle * config.rounds;
      const round = Math.min(config.rounds, Math.floor(elapsed / cycle) + 1);
      const inCycle = elapsed % cycle;
      const isWork = inCycle < config.workSec;
      const remaining = isWork
        ? config.workSec - inCycle
        : cycle - inCycle;
      const done = elapsed >= totalSec;
      return {
        label: done
          ? "Intervals Complete"
          : isWork
            ? `WORK · Rd ${round}/${config.rounds}`
            : `REST · Rd ${round}/${config.rounds}`,
        display: done ? "0:00" : fmt(Math.ceil(remaining)),
        accent: done ? "neutral" : isWork ? "work" : "rest",
        stats: done
          ? undefined
          : [
              { label: "Round", value: `${round}/${config.rounds}` },
              { label: "Phase", value: isWork ? "Work" : "Rest" },
            ],
      };
    }
    case "strength": {
      const restLabel =
        config.mainRestSec >= 60
          ? `${Math.round(config.mainRestSec / 60)} min`
          : `${config.mainRestSec}s`;
      return {
        label: "Strength",
        display: fmt(blockLeft),
        subline: "Work your sets — skip when done.",
        stats: [
          { label: "Rest target", value: restLabel },
          { label: "Block left", value: fmt(blockLeft) },
        ],
      };
    }
    case "rep_ladder": {
      const cap = config.capSec;
      const remaining = Math.max(0, cap - elapsed);
      return {
        label: `${config.label}`,
        display: fmt(elapsed),
        subline:
          elapsed >= cap
            ? "Cap reached."
            : "Score = elapsed time to finish",
        stats: [
          { label: "Rounds", value: `${config.reps.length}` },
          { label: "Cap left", value: fmt(remaining) },
        ],
      };
    }
  }
}
