import { MOVEMENTS, MOVEMENT_BY_ID } from "./movements";
import type {
  EquipmentSet,
  FilterState,
  Format,
  GeneratedSegment,
  GeneratedWorkout,
  Intensity,
  Movement,
  Pattern,
  WorkoutConfig,
  WorkoutType,
} from "./types";

// ─────────────────────────────────────────────────────────────
//  Constraint-based generator
// ─────────────────────────────────────────────────────────────
//  We don't pick movements at random. We:
//   1. Filter the library by equipment-set and minimum skill.
//   2. Pick a format whose duration matches the time cap + intensity.
//   3. Fill movement slots with constraints:
//        - balance modality (M / G / W)
//        - balance push vs pull, upper vs lower
//        - avoid pairing two same-region high-impact moves back-to-back
//        - bias HYROX-station movements when type === 'hyrox'

function rng(seed?: number) {
  let s = seed ?? Math.floor(Math.random() * 2 ** 31);
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function repsFor(m: Movement, intensity: Intensity, rand: () => number): number {
  const [lo, hi] = m.repsByIntensity[intensity];
  const v = lo + Math.floor(rand() * (hi - lo + 1));
  // Round nicely.
  if (m.unit === "m") return Math.round(v / 10) * 10;
  if (m.unit === "cal") return v;
  if (m.unit === "sec") return Math.round(v / 5) * 5;
  return v;
}

function eligible(
  equipmentSet: EquipmentSet,
  type: WorkoutType,
  intensity: Intensity
): Movement[] {
  return MOVEMENTS.filter((m) => {
    if (!m.availableIn.includes(equipmentSet)) return false;
    // Skill ceiling scales with intensity & type
    const skillCap =
      intensity === "recovery" ? 2 : intensity === "aerobic" ? 3 : 5;
    if (m.skill > skillCap) return false;
    // Recovery sessions skip high-impact.
    if (intensity === "recovery" && m.impact === "high") return false;
    return true;
  });
}

// Pick the right format for the time cap + intensity.
function chooseFormat(
  cap: number,
  intensity: Intensity,
  type: WorkoutType,
  rand: () => number
): Format {
  // HYROX = always intervals/for-time
  if (type === "hyrox") {
    if (cap <= 15) return "for_time";
    if (cap <= 30) return pick<Format>(["interval", "for_time"], rand);
    return pick<Format>(["chipper", "interval"], rand);
  }
  // S&C bias toward EMOM/intervals
  if (type === "strength_conditioning") {
    if (cap <= 10) return pick<Format>(["emom", "tabata"], rand);
    if (cap <= 30) return pick<Format>(["emom", "interval", "for_time"], rand);
    return pick<Format>(["interval", "ygig"], rand);
  }
  // CrossFit: full menu
  if (cap <= 6) return "tabata";
  if (cap <= 12) return pick<Format>(["amrap", "for_time", "emom"], rand);
  if (cap <= 25)
    return pick<Format>(["amrap", "for_time", "emom", "ygig"], rand);
  if (cap <= 40) return pick<Format>(["chipper", "amrap", "ygig"], rand);
  if (intensity === "recovery") return "amrap";
  return "chipper";
}

// How many movement slots fit a given format?
function slotsForFormat(format: Format, cap: number): number {
  switch (format) {
    case "amrap":
      return cap <= 10 ? 3 : cap <= 20 ? 4 : 5;
    case "for_time":
      return cap <= 10 ? 2 : cap <= 20 ? 3 : 4;
    case "chipper":
      return Math.max(5, Math.min(8, Math.round(cap / 6)));
    case "emom":
      return Math.min(4, Math.max(2, Math.round(cap / 5)));
    case "tabata":
      return cap <= 4 ? 1 : 2;
    case "ygig":
      return cap <= 20 ? 3 : 4;
    case "interval":
      return cap <= 20 ? 2 : 3;
  }
}

// The constraint engine. Walk slots and pick movements that improve balance.
function fillSlots(
  pool: Movement[],
  slots: number,
  type: WorkoutType,
  rand: () => number
): Movement[] {
  if (pool.length === 0) return [];
  const chosen: Movement[] = [];
  const counts = {
    M: 0,
    G: 0,
    W: 0,
    push: 0,
    pull: 0,
    upper: 0,
    lower: 0,
    full: 0,
  };

  const shuffled = shuffle(pool, rand);

  for (let i = 0; i < slots; i++) {
    // Score each remaining candidate; lower is better.
    const candidates = shuffled.filter(
      (m) => !chosen.some((c) => c.id === m.id)
    );
    if (candidates.length === 0) break;

    const ranked = candidates
      .map((m) => ({ m, score: scoreCandidate(m, chosen, counts, type) }))
      .sort((a, b) => a.score - b.score);

    // Take from top quartile to keep variety, not always #1.
    const top = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 4)));
    const winner = pick(top, rand).m;
    chosen.push(winner);

    counts[winner.modality]++;
    counts[winner.region]++;
    if (winner.pattern === "push") counts.push++;
    if (winner.pattern === "pull") counts.pull++;
  }
  return chosen;
}

function scoreCandidate(
  m: Movement,
  chosen: Movement[],
  counts: {
    M: number;
    G: number;
    W: number;
    push: number;
    pull: number;
    upper: number;
    lower: number;
    full: number;
  },
  type: WorkoutType
): number {
  let score = 0;
  // Penalise stacking the same modality.
  score += counts[m.modality] * 3;
  // Penalise stacking same region.
  score += counts[m.region] * 2;
  // Push/pull balance.
  if (m.pattern === "push") score += counts.push * 2;
  if (m.pattern === "pull") score += counts.pull * 2;
  // Avoid back-to-back same pattern.
  const last = chosen[chosen.length - 1];
  if (last && last.pattern === m.pattern) score += 4;
  // Avoid two high-impact lower-body moves in a row (knees!).
  if (
    last &&
    last.impact === "high" &&
    m.impact === "high" &&
    last.region === m.region
  ) {
    score += 6;
  }
  // Avoid duplicate equipment back-to-back when possible.
  if (last && last.equipment.some((e) => m.equipment.includes(e))) {
    score += 1;
  }
  // HYROX bias.
  if (type === "hyrox" && m.hyroxStation) score -= 4;
  // S&C: prefer loaded movements.
  if (type === "strength_conditioning" && m.modality === "W") score -= 2;
  // Tiny noise so ties don't always resolve the same way.
  score += Math.random() * 0.5;
  return score;
}

// Build the format-specific config (used by the timer).
function buildConfig(format: Format, capMinutes: number): WorkoutConfig {
  const capSec = capMinutes * 60;
  switch (format) {
    case "amrap":
      return { format: "amrap", durationSec: capSec };
    case "for_time": {
      const rounds = capMinutes <= 10 ? 3 : capMinutes <= 20 ? 5 : 7;
      return { format: "for_time", capSec, rounds };
    }
    case "chipper":
      return { format: "chipper", capSec };
    case "emom":
      return {
        format: "emom",
        minutes: capMinutes,
        stations: Math.min(4, Math.max(2, Math.round(capMinutes / 5))),
      };
    case "tabata":
      return {
        format: "tabata",
        rounds: 8,
        workSec: 20,
        restSec: 10,
        movements: capMinutes <= 4 ? 1 : 2,
      };
    case "ygig":
      return {
        format: "ygig",
        capSec,
        partners: 2,
        rounds: capMinutes <= 20 ? 5 : 8,
      };
    case "interval": {
      const rounds = Math.max(4, Math.round(capMinutes / 4));
      return {
        format: "interval",
        rounds,
        workSec: 90,
        restSec: 60,
      };
    }
  }
}

// Compose the structure description.
function buildStructure(
  format: Format,
  capMinutes: number,
  config: WorkoutConfig,
  movements: Movement[]
): string {
  switch (format) {
    case "amrap":
      return `AMRAP — ${capMinutes} min`;
    case "for_time":
      return `${(config as { rounds: number }).rounds} Rounds For Time — ${capMinutes} min cap`;
    case "chipper":
      return `Chipper — One round, ${capMinutes} min cap`;
    case "emom":
      return `EMOM ${capMinutes} — ${(config as { stations: number }).stations} stations rotating`;
    case "tabata":
      return `Tabata — 8 × (20s on / 10s off)`;
    case "ygig":
      return `You-Go-I-Go — ${(config as { rounds: number }).rounds} rounds, partner alternates`;
    case "interval":
      return `Intervals — ${(config as { rounds: number }).rounds} × (90s on / 60s off)`;
  }
}

// Reps differ by format: chippers are bigger sets, EMOMs are smaller.
function adjustRepsForFormat(
  base: number,
  format: Format,
  unit: "reps" | "m" | "cal" | "sec"
): number {
  if (unit === "sec") return base;
  let mult = 1;
  if (format === "chipper") mult = 2.4;
  else if (format === "amrap") mult = 0.7;
  else if (format === "emom") mult = 0.55;
  else if (format === "tabata") mult = 0.5;
  else if (format === "interval") mult = 0.9;
  const v = Math.max(1, Math.round(base * mult));
  if (unit === "m") return Math.max(50, Math.round(v / 50) * 50);
  return v;
}

function buildTitle(format: Format, type: WorkoutType, rand: () => number) {
  const adj = pick(
    [
      "Iron",
      "Atlas",
      "Ridge",
      "Cinder",
      "Echo",
      "Kestrel",
      "Onyx",
      "Vector",
      "Halcyon",
      "Mercury",
      "Atlas",
      "Beacon",
    ],
    rand
  );
  const noun = pick(
    [
      "Drift",
      "Forge",
      "Cycle",
      "Engine",
      "Ladder",
      "Loop",
      "Stack",
      "Trail",
      "Pulse",
      "Hour",
    ],
    rand
  );
  return `${adj} ${noun}`;
}

export function generateWorkout(
  filters: FilterState,
  seed?: number
): GeneratedWorkout {
  const rand = rng(seed);
  const pool = eligible(filters.equipment, filters.type, filters.intensity);
  const format = chooseFormat(
    filters.timeCapMinutes,
    filters.intensity,
    filters.type,
    rand
  );
  const slots = slotsForFormat(format, filters.timeCapMinutes);
  const movements = fillSlots(pool, slots, filters.type, rand);

  const config = buildConfig(format, filters.timeCapMinutes);

  const segments: GeneratedSegment[] = movements.map((m) => {
    const baseReps = repsFor(m, filters.intensity, rand);
    const reps = adjustRepsForFormat(baseReps, format, m.unit);
    return {
      movementId: m.id,
      movement: m,
      reps,
      unit: m.unit,
      loadHint: m.loadHint,
    };
  });

  return {
    id: `wk_${Date.now()}_${Math.floor(rand() * 1e6)}`,
    title: buildTitle(format, filters.type, rand),
    format,
    type: filters.type,
    intensity: filters.intensity,
    equipmentSet: filters.equipment,
    timeCapMinutes: filters.timeCapMinutes,
    config,
    segments,
    structure: buildStructure(format, filters.timeCapMinutes, config, movements),
  };
}

// ─────────────────────────────────────────────────────────────
//  Swap-by-stimulus
// ─────────────────────────────────────────────────────────────
//  Find another movement with the most overlapping stimulus tags
//  and the same primary pattern, restricted to the same equipment-set.

export function swapMovement(
  currentId: string,
  workout: GeneratedWorkout,
  rand: () => number = Math.random
): GeneratedSegment | null {
  const current = MOVEMENT_BY_ID[currentId];
  if (!current) return null;
  const taken = new Set(workout.segments.map((s) => s.movementId));
  const pool = eligible(workout.equipmentSet, workout.type, workout.intensity)
    .filter((m) => m.id !== currentId && !taken.has(m.id))
    .map((m) => ({
      m,
      score: stimulusOverlap(m, current),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (pool.length === 0) return null;
  const top = pool.slice(0, Math.min(4, pool.length));
  const replacement = top[Math.floor(rand() * top.length)].m;
  const baseReps =
    replacement.repsByIntensity[workout.intensity][0] +
    Math.floor(
      rand() *
        (replacement.repsByIntensity[workout.intensity][1] -
          replacement.repsByIntensity[workout.intensity][0])
    );
  const reps = adjustRepsForFormat(baseReps, workout.format, replacement.unit);
  return {
    movementId: replacement.id,
    movement: replacement,
    reps,
    unit: replacement.unit,
    loadHint: replacement.loadHint,
  };
}

function stimulusOverlap(a: Movement, b: Movement): number {
  let score = 0;
  if (a.pattern === b.pattern) score += 4;
  if (a.region === b.region) score += 2;
  if (a.modality === b.modality) score += 1;
  for (const t of a.stimulusTags) if (b.stimulusTags.includes(t)) score += 2;
  return score;
}

// ─────────────────────────────────────────────────────────────
//  Clipboard formatting
// ─────────────────────────────────────────────────────────────

export function workoutToText(w: GeneratedWorkout): string {
  const lines: string[] = [];
  lines.push(`NEXUSFIT — ${w.title}`);
  lines.push(w.structure);
  lines.push("");
  for (const s of w.segments) {
    const repsLabel =
      s.unit === "m"
        ? `${s.reps} m`
        : s.unit === "cal"
          ? `${s.reps} cal`
          : s.unit === "sec"
            ? `${s.reps} s`
            : `${s.reps}`;
    lines.push(
      `• ${repsLabel}  ${s.movement.name}${s.loadHint ? `  (${s.loadHint})` : ""}`
    );
  }
  lines.push("");
  lines.push(`Time Cap: ${w.timeCapMinutes} min`);
  return lines.join("\n");
}
