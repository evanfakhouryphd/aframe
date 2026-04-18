"use client";

import { cn } from "@/lib/cn";
import type { GeneratedWorkout, WorkoutConfig } from "@/lib/types";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  workout: GeneratedWorkout;
}

// Per-format timer. The data model already encodes everything we need.
export function Timer({ workout }: Props) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const offsetRef = useRef(0);

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

  // Reset on workout change
  useEffect(() => {
    setRunning(false);
    setElapsed(0);
    startRef.current = null;
    offsetRef.current = 0;
  }, [workout.id]);

  const phase = derivePhase(workout.config, elapsed);

  function toggle() {
    if (running) {
      offsetRef.current = elapsed;
      startRef.current = null;
      setRunning(false);
    } else {
      setRunning(true);
    }
  }

  function reset() {
    setRunning(false);
    setElapsed(0);
    startRef.current = null;
    offsetRef.current = 0;
  }

  return (
    <div className="rounded-2xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark p-5 sm:p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-muted">
            {phase.label}
          </div>
          <div className="text-[64px] sm:text-[80px] leading-none font-semibold tabular-nums tracking-tightest mt-1">
            {phase.display}
          </div>
        </div>
        <div className="text-right text-xs text-ink-muted">
          <div>Elapsed</div>
          <div className="text-base font-medium tabular-nums text-ink dark:text-ink-dark">
            {fmt(elapsed)}
          </div>
        </div>
      </div>

      {phase.subline && (
        <div className="mt-3 text-sm text-ink-muted">{phase.subline}</div>
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
        <button
          onClick={reset}
          className="h-12 w-12 grid place-items-center rounded-full border border-border dark:border-border-dark text-ink-muted hover:text-ink dark:hover:text-ink-dark transition-colors"
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

interface Phase {
  label: string;
  display: string;
  subline?: string;
}

function derivePhase(config: WorkoutConfig, elapsed: number): Phase {
  switch (config.format) {
    case "amrap": {
      const remaining = Math.max(0, config.durationSec - elapsed);
      return {
        label: `AMRAP — ${config.durationSec / 60} min`,
        display: fmt(remaining),
        subline: remaining === 0 ? "Time." : "Score = total rounds + reps",
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
        label: done ? "EMOM Complete" : `EMOM — Min ${minute} of ${config.minutes}`,
        display: done ? "0:00" : fmt(remainingInMin),
        subline: done ? "Time." : `Station ${station} of ${config.stations}`,
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
      const movementIdx = (cycleIdx % config.movements) + 1;
      return {
        label: done
          ? "Tabata Complete"
          : isWork
            ? `WORK — Round ${Math.floor(cycleIdx / config.movements) + 1}/${config.rounds}`
            : "REST",
        display: done ? "0:00" : Math.ceil(remaining).toString(),
        subline: done
          ? "Time."
          : config.movements > 1
            ? `Movement ${movementIdx} of ${config.movements}`
            : undefined,
      };
    }
    case "ygig": {
      const cap = config.capSec;
      return {
        label: `YGIG — ${config.rounds} rounds, ${config.partners}-person`,
        display: fmt(elapsed),
        subline:
          cap && elapsed >= cap ? "Cap reached." : "Alternate full rounds",
      };
    }
    case "interval": {
      const cycle = config.workSec + config.restSec;
      const round = Math.min(config.rounds, Math.floor(elapsed / cycle) + 1);
      const inCycle = elapsed % cycle;
      const isWork = inCycle < config.workSec;
      const remaining = isWork
        ? config.workSec - inCycle
        : cycle - inCycle;
      const done = elapsed >= cycle * config.rounds;
      return {
        label: done
          ? "Intervals Complete"
          : isWork
            ? `WORK — Round ${round}/${config.rounds}`
            : `REST — Round ${round}/${config.rounds}`,
        display: done ? "0:00" : fmt(Math.ceil(remaining)),
      };
    }
  }
}
