import { MOVEMENTS, MOVEMENT_BY_ID, isMainLift, isCardio } from "./movements";
import type {
  EquipmentSet,
  FilterState,
  Format,
  GeneratedBlock,
  GeneratedSegment,
  GeneratedWorkout,
  Intensity,
  Movement,
  RepScheme,
  WorkoutConfig,
  WorkoutType,
} from "./types";

// ─────────────────────────────────────────────────────────────
//  Constraint-based generator — multi-block
// ─────────────────────────────────────────────────────────────
//  Every workout is composed of 2–3 named blocks (A/B/C), each with its
//  own format (AMRAP / EMOM / For Time / etc.) and 3–5 movements. Blocks
//  are separated by a timed rest. Movement uniqueness is preserved across
//  blocks where the pool allows.

const REST_BETWEEN_BLOCKS_SEC = 120;

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
  if (m.unit === "m") return Math.round(v / 10) * 10;
  if (m.unit === "cal") return v;
  if (m.unit === "sec") return Math.round(v / 5) * 5;
  return v;
}

function eligible(
  equipmentSets: EquipmentSet[],
  _type: WorkoutType,
  intensity: Intensity
): Movement[] {
  const sets = equipmentSets.length > 0 ? equipmentSets : ["full_gym"];
  return MOVEMENTS.filter((m) => {
    if (!m.availableIn.some((s) => sets.includes(s))) return false;
    const skillCap =
      intensity === "recovery" ? 2 : intensity === "aerobic" ? 3 : 5;
    if (m.skill > skillCap) return false;
    if (intensity === "recovery" && m.impact === "high") return false;
    return true;
  });
}

function slotsForFormat(format: Format, blockMin: number, rand: () => number): number {
  switch (format) {
    case "amrap":
      // Couplet, triplet, or larger AMRAP.
      return blockMin <= 8 ? pick([2, 3], rand) : blockMin <= 16 ? pick([3, 4], rand) : pick([3, 4, 5], rand);
    case "for_time":
      return blockMin <= 8 ? pick([2, 3], rand) : blockMin <= 15 ? pick([3, 4], rand) : pick([3, 4, 5], rand);
    case "chipper":
      return pick([5, 6, 7], rand);
    case "emom":
      // Often alternating stations: 2-4 movements rotating each minute.
      return pick([2, 3, 4], rand);
    case "tabata":
      return blockMin <= 4 ? 1 : pick([1, 2], rand);
    case "ygig":
      return pick([3, 4], rand);
    case "interval":
      return blockMin <= 10 ? pick([2, 3], rand) : pick([3, 4], rand);
    case "rep_ladder":
      // Couplet (Fran/Diane) or triplet (Elizabeth, Karen+).
      return pick([2, 2, 3], rand);
    case "strength":
      return 0;
  }
}

function fillSlots(
  pool: Movement[],
  slots: number,
  type: WorkoutType,
  rand: () => number
): Movement[] {
  if (pool.length === 0 || slots === 0) return [];
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
    const candidates = shuffled.filter(
      (m) => !chosen.some((c) => c.id === m.id)
    );
    if (candidates.length === 0) break;

    const ranked = candidates
      .map((m) => ({ m, score: scoreCandidate(m, chosen, counts, type) }))
      .sort((a, b) => a.score - b.score);

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
  score += counts[m.modality] * 3;
  score += counts[m.region] * 2;
  if (m.pattern === "push") score += counts.push * 2;
  if (m.pattern === "pull") score += counts.pull * 2;
  const last = chosen[chosen.length - 1];
  if (last && last.pattern === m.pattern) score += 4;
  if (
    last &&
    last.impact === "high" &&
    m.impact === "high" &&
    last.region === m.region
  ) {
    score += 6;
  }
  if (last && last.equipment.some((e) => m.equipment.includes(e))) {
    score += 1;
  }
  if (type === "hyrox" && m.hyroxStation) score -= 4;
  if (type === "strength_conditioning" && m.modality === "W") score -= 2;
  score += Math.random() * 0.5;
  return score;
}

// Classic CrossFit rep ladders. Each is a real-world template.
const LADDER_TEMPLATES: { reps: number[]; label: string }[] = [
  { reps: [21, 15, 9], label: "21-15-9" },
  { reps: [21, 18, 15, 12, 9, 6, 3], label: "21-18...3" },
  { reps: [50, 40, 30, 20, 10], label: "50-40-30-20-10" },
  { reps: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], label: "10 down to 1" },
  { reps: [15, 12, 9, 6, 3], label: "15-12-9-6-3" },
  { reps: [20, 16, 12, 8, 4], label: "20-16-12-8-4" },
  { reps: [30, 20, 10], label: "30-20-10" },
  { reps: [9, 15, 21], label: "9-15-21 (ascending)" },
];

function pickLadder(blockMin: number, rand: () => number): { reps: number[]; label: string } {
  // Bias toward shorter ladders for short blocks, longer for long blocks.
  const candidates =
    blockMin <= 8
      ? LADDER_TEMPLATES.filter((t) => t.reps.length <= 5)
      : blockMin <= 15
        ? LADDER_TEMPLATES.filter((t) => t.reps.length <= 7)
        : LADDER_TEMPLATES;
  return pick(candidates, rand);
}

function buildConfig(
  format: Format,
  blockMin: number,
  intensity: Intensity,
  rand: () => number
): WorkoutConfig {
  const capSec = blockMin * 60;
  switch (format) {
    case "amrap":
      return { format: "amrap", durationSec: capSec };
    case "for_time": {
      const rounds = pick(
        blockMin <= 8 ? [3, 4] : blockMin <= 15 ? [4, 5] : [5, 6, 7],
        rand
      );
      return { format: "for_time", capSec, rounds };
    }
    case "chipper":
      return { format: "chipper", capSec };
    case "emom":
      return {
        format: "emom",
        minutes: blockMin,
        stations: pick([2, 3, 4], rand),
      };
    case "tabata":
      return {
        format: "tabata",
        rounds: 8,
        workSec: 20,
        restSec: 10,
        movements: blockMin <= 4 ? 1 : pick([1, 2], rand),
      };
    case "ygig":
      return {
        format: "ygig",
        capSec,
        partners: 2,
        rounds: pick(blockMin <= 15 ? [4, 5] : [6, 8, 10], rand),
      };
    case "interval": {
      const profile = pick(
        [
          { workSec: 60, restSec: 30 },
          { workSec: 90, restSec: 30 },
          { workSec: 30, restSec: 30 },
          { workSec: 45, restSec: 15 },
        ],
        rand
      );
      const rounds = Math.max(
        4,
        Math.floor((blockMin * 60) / (profile.workSec + profile.restSec))
      );
      return {
        format: "interval",
        rounds,
        workSec: profile.workSec,
        restSec: profile.restSec,
      };
    }
    case "rep_ladder": {
      const { reps, label } = pickLadder(blockMin, rand);
      return { format: "rep_ladder", capSec, reps, label };
    }
    case "strength":
      return {
        format: "strength",
        mainRestSec: restForIntensity(intensity),
        accessoryRestSec: 60,
      };
  }
}

function restForIntensity(intensity: Intensity): number {
  switch (intensity) {
    case "recovery":
      return 60;
    case "aerobic":
      return 90;
    case "threshold":
      return 180;
    case "max_effort":
      return 240;
  }
}

function buildStructure(
  format: Format,
  blockMin: number,
  config: WorkoutConfig
): string {
  switch (format) {
    case "amrap":
      return `AMRAP ${blockMin} min`;
    case "for_time":
      return `${(config as { rounds: number }).rounds} Rounds For Time · ${blockMin} min cap`;
    case "chipper":
      return `Chipper — one round, ${blockMin} min cap`;
    case "emom":
      return `EMOM ${blockMin} — ${(config as { stations: number }).stations} stations`;
    case "tabata":
      return `Tabata — 8 × (20s on / 10s off)`;
    case "ygig":
      return `YGIG — ${(config as { rounds: number }).rounds} rounds, 2-person`;
    case "interval": {
      const c = config as { rounds: number; workSec: number; restSec: number };
      return `Intervals — ${c.rounds} × (${c.workSec}s on / ${c.restSec}s off)`;
    }
    case "rep_ladder": {
      const c = config as { label: string };
      return `${c.label} reps for time · ${blockMin} min cap`;
    }
    case "strength":
      return `Strength`;
  }
}

function adjustRepsForFormat(
  base: number,
  format: Format,
  unit: "reps" | "m" | "cal" | "sec"
): number {
  // Rep-ladder reps come from the ladder template, not the segment reps field.
  if (format === "rep_ladder") return 0;
  if (unit === "sec") return base;
  let mult = 1;
  if (format === "chipper") mult = 2.4;
  else if (format === "amrap") mult = 0.75;
  else if (format === "emom") mult = 0.6;
  else if (format === "tabata") mult = 0.5;
  else if (format === "interval") mult = 0.9;
  // Add ±15 % jitter so the same intensity doesn't always land on the same number.
  const jitter = 0.85 + Math.random() * 0.3;
  const v = Math.max(1, Math.round(base * mult * jitter));
  if (unit === "m") return Math.max(50, Math.round(v / 50) * 50);
  if (unit === "cal") return Math.max(3, v);
  return v;
}

function buildTitle(_type: WorkoutType, rand: () => number) {
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
      "Beacon",
      "Tempest",
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
      "Lift",
      "Circuit",
    ],
    rand
  );
  return `${adj} ${noun}`;
}

// ─────────────────────────────────────────────────────────────
//  Block composition
// ─────────────────────────────────────────────────────────────

const BLOCK_LABELS = ["A", "B", "C", "D"];

function blockCount(capMin: number, type: WorkoutType, rand: () => number): number {
  // Strength sessions are always 3 blocks (main / accessory / finisher) when
  // there's room.
  if (type === "strength" || type === "strength_conditioning") {
    return capMin >= 25 ? 3 : 2;
  }
  // CrossFit / HYROX: vary so it doesn't always feel the same.
  if (capMin <= 8) return 1; // sprint / benchmark
  if (capMin <= 14) return pick([1, 2], rand);
  if (capMin <= 22) return pick([2, 2, 3], rand);
  if (capMin <= 40) return pick([2, 3, 3], rand);
  return pick([3, 3, 4], rand);
}

function blockFormatPlan(
  type: WorkoutType,
  count: number,
  capMin: number,
  rand: () => number
): Format[] {
  if (type === "strength") {
    const finisher = pick<Format>(["amrap", "interval", "emom", "rep_ladder"], rand);
    return count >= 3 ? ["strength", "strength", finisher] : ["strength", "strength"];
  }

  if (type === "strength_conditioning") {
    const second = pick<Format>(["amrap", "rep_ladder", "for_time"], rand);
    const third = pick<Format>(["interval", "for_time", "emom"], rand);
    return count >= 3 ? ["strength", second, third] : ["strength", second];
  }

  if (type === "hyrox") {
    // HYROX rotates run-style intervals + station for-time + station chipper.
    const pool: Format[] = ["interval", "for_time", "chipper", "emom"];
    return shuffle(pool, rand).slice(0, count);
  }

  // CrossFit — wide format pool, biased to mix across blocks.
  if (capMin <= 6) return ["tabata"];

  // For 1-block workouts, prefer benchmark-style structures (rep ladders or
  // single AMRAP/For Time).
  if (count === 1) {
    return [
      pick<Format>(
        capMin <= 10
          ? ["rep_ladder", "for_time", "amrap"]
          : ["rep_ladder", "amrap", "for_time", "chipper"],
        rand
      ),
    ];
  }

  const pool: Format[] = ["amrap", "emom", "for_time", "interval", "rep_ladder"];
  if (capMin <= 14) pool.push("tabata");
  if (capMin >= 25) pool.push("chipper");
  return shuffle(pool, rand).slice(0, count);
}

type BlockRole = "main" | "accessory" | "generic" | "finisher";

interface BuildBlockArgs {
  label: string;
  format: Format;
  role: BlockRole;
  filters: FilterState;
  pool: Movement[];
  fullPool: Movement[];
  blockMin: number;
  rand: () => number;
}

function buildStrengthMainBlock(args: BuildBlockArgs): GeneratedBlock {
  const { filters, pool, fullPool, blockMin, rand, label } = args;
  const mainLift =
    pickMainLift(pool, rand) ?? pickMainLift(fullPool, rand);
  const { scheme, sets, reps } = schemeForIntensity(filters.intensity);
  const mainRest = restForIntensity(filters.intensity);

  const segments: GeneratedSegment[] = [];
  if (mainLift) {
    segments.push({
      movementId: mainLift.id,
      movement: mainLift,
      reps,
      unit: mainLift.unit,
      loadHint: mainLift.loadHint,
      strengthSet: { sets, scheme, restSec: mainRest },
    });
  }

  const config = buildConfig("strength", blockMin, filters.intensity, rand);
  const durationSec = blockMin * 60;
  return {
    id: `blk_${label}_${Math.floor(rand() * 1e6)}`,
    label,
    title: "Main Lift",
    format: "strength",
    config,
    segments,
    structure: mainLift
      ? `${sets} × ${reps} @ ${scheme} · ${mainLift.name}`
      : "Strength — main lift",
    durationSec,
    restAfterSec: 0,
  };
}

function buildStrengthAccessoryBlock(args: BuildBlockArgs): GeneratedBlock {
  const { filters, pool, fullPool, blockMin, rand, label } = args;
  const count = blockMin >= 12 ? 4 : 3;
  const workingPool = pool.length >= count ? pool : fullPool;
  const picks = fillSlots(workingPool, count, filters.type, rand);

  const accessoryRest = 60;
  const segments: GeneratedSegment[] = picks.map((m) => {
    const isReps = m.unit === "reps";
    const accessoryReps = isReps ? 10 : repsFor(m, "aerobic", rand);
    return {
      movementId: m.id,
      movement: m,
      reps: accessoryReps,
      unit: m.unit,
      loadHint: m.loadHint,
      strengthSet: { sets: 3, scheme: "12RM", restSec: accessoryRest },
    };
  });

  return {
    id: `blk_${label}_${Math.floor(rand() * 1e6)}`,
    label,
    title: "Accessory superset",
    format: "strength",
    config: buildConfig("strength", blockMin, filters.intensity, rand),
    segments,
    structure: `3 × 8–12 · ${count} movements`,
    durationSec: blockMin * 60,
    restAfterSec: 0,
  };
}

function buildConditioningBlock(args: BuildBlockArgs): GeneratedBlock {
  const { format, filters, pool, fullPool, blockMin, rand, label, role } = args;
  const rawSlots = slotsForFormat(format, blockMin, rand);
  const slots = Math.max(format === "rep_ladder" ? 2 : 2, Math.min(7, rawSlots));

  let workingPool = pool;
  if (workingPool.length < slots) workingPool = fullPool;

  // Force a cardio piece for HYROX, S&C conditioning, and most CrossFit
  // blocks (a couplet without a cardio anchor feels like an accessory).
  const forceCardio =
    (role === "generic" || role === "finisher") &&
    (filters.type === "strength_conditioning" ||
      filters.type === "hyrox" ||
      (filters.type === "crossfit" && format !== "emom" && format !== "rep_ladder"));

  let movements: Movement[];
  if (forceCardio) {
    const cardio = workingPool.filter(isCardio);
    const other = workingPool.filter((m) => !isCardio(m));
    const cardioPick =
      cardio.length > 0 ? fillSlots(cardio, 1, filters.type, rand) : [];
    const others = fillSlots(other, Math.max(0, slots - cardioPick.length), filters.type, rand);
    movements = [...cardioPick, ...others];
    if (movements.length < slots) {
      const more = fillSlots(
        workingPool.filter((m) => !movements.some((x) => x.id === m.id)),
        slots - movements.length,
        filters.type,
        rand
      );
      movements = [...movements, ...more];
    }
  } else if (format === "rep_ladder" && slots === 2) {
    // Classic couplet: bias toward push/pull or lift/cardio combos.
    movements = pickCouplet(workingPool, filters.type, rand);
  } else {
    movements = fillSlots(workingPool, slots, filters.type, rand);
  }

  const config = buildConfig(format, blockMin, filters.intensity, rand);
  const segments: GeneratedSegment[] = movements.map((m) => {
    const base = repsFor(m, filters.intensity, rand);
    const reps = adjustRepsForFormat(base, format, m.unit);
    return {
      movementId: m.id,
      movement: m,
      reps,
      unit: m.unit,
      loadHint: m.loadHint,
    };
  });

  return {
    id: `blk_${label}_${Math.floor(rand() * 1e6)}`,
    label,
    title: titleForFormat(format, blockMin, config),
    format,
    config,
    segments,
    structure: buildStructure(format, blockMin, config),
    durationSec: blockMin * 60,
    restAfterSec: 0,
  };
}

// Couplet picker — biases toward classic CrossFit pairings (push+pull,
// lift+cardio, squat+gymnastic).
function pickCouplet(
  pool: Movement[],
  type: WorkoutType,
  rand: () => number
): Movement[] {
  const first = fillSlots(pool, 1, type, rand)[0];
  if (!first) return [];
  const remainder = pool.filter((m) => m.id !== first.id);
  // Score "complement" — opposite pattern / different modality / different region.
  const ranked = remainder
    .map((m) => {
      let score = 0;
      if (m.pattern !== first.pattern) score += 3;
      if (m.modality !== first.modality) score += 2;
      if (m.region !== first.region) score += 1;
      // Classic Fran/Diane shape: push paired with pull.
      if (
        (first.pattern === "push" && m.pattern === "pull") ||
        (first.pattern === "pull" && m.pattern === "push")
      ) {
        score += 4;
      }
      // Lift + cardio.
      if (first.modality === "W" && m.modality === "M") score += 2;
      if (first.modality === "M" && m.modality === "W") score += 2;
      return { m, score };
    })
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return [first];
  const top = ranked.slice(0, Math.min(5, ranked.length));
  const second = pick(top, rand).m;
  return [first, second];
}

function titleForFormat(
  format: Format,
  blockMin: number,
  config: WorkoutConfig
): string {
  switch (format) {
    case "amrap":
      return `AMRAP ${blockMin} min`;
    case "for_time":
      return `${(config as { rounds: number }).rounds} RFT · ${blockMin} min cap`;
    case "chipper":
      return `Chipper · ${blockMin} min`;
    case "emom":
      return `EMOM ${blockMin}`;
    case "tabata":
      return `Tabata`;
    case "ygig":
      return `YGIG · ${blockMin} min`;
    case "interval":
      return `${(config as { rounds: number }).rounds} Intervals`;
    case "rep_ladder":
      return `${(config as { label: string }).label}`;
    case "strength":
      return "Strength";
  }
}

// ─────────────────────────────────────────────────────────────
//  Strength helpers
// ─────────────────────────────────────────────────────────────

function schemeForIntensity(intensity: Intensity): {
  scheme: RepScheme;
  sets: number;
  reps: number;
} {
  switch (intensity) {
    case "recovery":
      return { scheme: "20RM", sets: 3, reps: 20 };
    case "aerobic":
      return { scheme: "12RM", sets: 3, reps: 12 };
    case "threshold":
      return { scheme: "5RM", sets: 5, reps: 5 };
    case "max_effort":
      return { scheme: Math.random() < 0.5 ? "3RM" : "1RM", sets: 5, reps: 3 };
  }
}

function pickMainLift(pool: Movement[], rand: () => number): Movement | null {
  const main = pool.filter(isMainLift);
  if (main.length === 0) return null;
  const priority = (m: Movement) => {
    if (m.equipment.includes("barbell")) return 0;
    if (m.equipment.includes("kettlebell")) return 1;
    if (m.equipment.includes("dumbbell")) return 2;
    return 3;
  };
  const sorted = [...main].sort((a, b) => priority(a) - priority(b));
  const best = priority(sorted[0]);
  const top = sorted.filter((m) => priority(m) === best);
  return pick(top, rand);
}

// ─────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────

export function generateWorkout(
  filters: FilterState,
  seed?: number
): GeneratedWorkout {
  const rand = rng(seed);
  const fullPool = eligible(filters.equipment, filters.type, filters.intensity);

  const count = blockCount(filters.timeCapMinutes, filters.type, rand);
  const totalRest = (count - 1) * REST_BETWEEN_BLOCKS_SEC;
  const workSec = Math.max(
    60 * 6,
    filters.timeCapMinutes * 60 - totalRest
  );
  const perBlockSec = Math.floor(workSec / count);
  const perBlockMin = Math.max(4, Math.round(perBlockSec / 60));

  const formats = blockFormatPlan(
    filters.type,
    count,
    filters.timeCapMinutes,
    rand
  );

  const taken = new Set<string>();
  const blocks: GeneratedBlock[] = [];

  for (let i = 0; i < count; i++) {
    const format = formats[i] ?? formats[formats.length - 1];
    const availablePool = fullPool.filter((m) => !taken.has(m.id));
    const usingFallback = availablePool.length < 3;
    const pool = usingFallback ? fullPool : availablePool;

    let role: BlockRole = "generic";
    if (filters.type === "strength") {
      role = i === 0 ? "main" : i === 1 ? "accessory" : "finisher";
    } else if (filters.type === "strength_conditioning") {
      role = i === 0 ? "main" : i === count - 1 ? "finisher" : "generic";
    } else if (i === count - 1) {
      role = "finisher";
    }

    const args: BuildBlockArgs = {
      label: BLOCK_LABELS[i],
      format,
      role,
      filters,
      pool,
      fullPool,
      blockMin: perBlockMin,
      rand,
    };

    let block: GeneratedBlock;
    if (role === "main" && format === "strength") {
      block = buildStrengthMainBlock(args);
    } else if (role === "accessory" && format === "strength") {
      block = buildStrengthAccessoryBlock(args);
    } else {
      block = buildConditioningBlock(args);
    }

    for (const s of block.segments) taken.add(s.movementId);

    block.restAfterSec =
      i < count - 1 ? REST_BETWEEN_BLOCKS_SEC : 0;
    blocks.push(block);
  }

  return {
    id: `wk_${Date.now()}_${Math.floor(rand() * 1e6)}`,
    title: buildTitle(filters.type, rand),
    type: filters.type,
    intensity: filters.intensity,
    equipmentSets: filters.equipment,
    timeCapMinutes: filters.timeCapMinutes,
    blocks,
  };
}

// ─────────────────────────────────────────────────────────────
//  Swap-by-stimulus — works across blocks
// ─────────────────────────────────────────────────────────────

export function swapMovement(
  currentId: string,
  workout: GeneratedWorkout,
  rand: () => number = Math.random
): { blockId: string; segment: GeneratedSegment } | null {
  const current = MOVEMENT_BY_ID[currentId];
  if (!current) return null;

  // Find which block + segment holds the current movement.
  let blockId: string | null = null;
  let existing: GeneratedSegment | null = null;
  let currentBlockFormat: Format = "amrap";
  for (const b of workout.blocks) {
    const hit = b.segments.find((s) => s.movementId === currentId);
    if (hit) {
      blockId = b.id;
      existing = hit;
      currentBlockFormat = b.format;
      break;
    }
  }
  if (!blockId || !existing) return null;

  const taken = new Set<string>();
  for (const b of workout.blocks) for (const s of b.segments) taken.add(s.movementId);

  const pool = eligible(workout.equipmentSets, workout.type, workout.intensity)
    .filter((m) => m.id !== currentId && !taken.has(m.id))
    .map((m) => ({ m, score: stimulusOverlap(m, current) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (pool.length === 0) return null;

  const top = pool.slice(0, Math.min(4, pool.length));
  const replacement = top[Math.floor(rand() * top.length)].m;

  if (existing.strengthSet) {
    const { sets, scheme, restSec } = existing.strengthSet;
    return {
      blockId,
      segment: {
        movementId: replacement.id,
        movement: replacement,
        reps: existing.reps,
        unit: replacement.unit,
        loadHint: replacement.loadHint,
        strengthSet: { sets, scheme, restSec },
      },
    };
  }

  const baseReps =
    replacement.repsByIntensity[workout.intensity][0] +
    Math.floor(
      rand() *
        (replacement.repsByIntensity[workout.intensity][1] -
          replacement.repsByIntensity[workout.intensity][0])
    );
  const reps = adjustRepsForFormat(baseReps, currentBlockFormat, replacement.unit);
  return {
    blockId,
    segment: {
      movementId: replacement.id,
      movement: replacement,
      reps,
      unit: replacement.unit,
      loadHint: replacement.loadHint,
    },
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

function fmtRest(sec: number): string {
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return r === 0 ? `${m} min` : `${m}:${r.toString().padStart(2, "0")}`;
  }
  return `${sec}s`;
}

export function workoutToText(w: GeneratedWorkout): string {
  const lines: string[] = [];
  lines.push(`NEXUSFIT — ${w.title}`);
  lines.push(`Time cap: ${w.timeCapMinutes} min`);
  lines.push("");
  for (let i = 0; i < w.blocks.length; i++) {
    const b = w.blocks[i];
    lines.push(`── Block ${b.label} · ${b.title} ──`);
    lines.push(b.structure);
    if (b.format === "rep_ladder") {
      const ladder = (b.config as { reps: number[]; label: string }).reps.join("-");
      for (const s of b.segments) {
        lines.push(
          `• ${ladder}  ${s.movement.name}${s.loadHint ? `  (${s.loadHint})` : ""}`
        );
      }
    } else {
      for (const s of b.segments) {
        if (s.strengthSet) {
          const { sets, scheme, restSec } = s.strengthSet;
          lines.push(
            `• ${sets} × ${s.reps} @ ${scheme}  ${s.movement.name}${
              s.loadHint ? `  (${s.loadHint})` : ""
            }  — rest ${fmtRest(restSec)}`
          );
          continue;
        }
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
    }
    if (b.restAfterSec > 0) {
      lines.push("");
      lines.push(`-- REST ${fmtRest(b.restAfterSec)} --`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
