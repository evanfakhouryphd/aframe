// Core taxonomy used by every part of the engine.
// Tags drive the constraint-based generator and the swap-by-stimulus feature.

export type Modality = "M" | "G" | "W";
// M = Monostructural / cardio
// G = Gymnastics / bodyweight skill
// W = Weightlifting / loaded movement

export type Pattern =
  | "pull"
  | "push"
  | "squat"
  | "hinge"
  | "lunge"
  | "core"
  | "carry"
  | "locomotion";

export type Region = "upper" | "lower" | "full";

export type Impact = "low" | "moderate" | "high";

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "kettlebell"
  | "pullup_bar"
  | "rings"
  | "rower"
  | "bike_erg"
  | "ski_erg"
  | "airbike"
  | "treadmill"
  | "wallball"
  | "box"
  | "jump_rope"
  | "bodyweight"
  | "rig"
  | "bench";

export type EquipmentSet =
  | "full_gym"
  | "kettlebell_only"
  | "dumbbell_only"
  | "bodyweight_travel"
  | "rower_only"
  | "ski_only"
  | "bike_only"
  | "airbike_only";

export type Intensity =
  | "recovery"
  | "aerobic"
  | "threshold"
  | "max_effort";

export type WorkoutType =
  | "crossfit"
  | "hyrox"
  | "strength_conditioning"
  | "strength";

// Rep schemes used in true strength sessions.
// "3RM" means "working sets at 3-rep-max" = heavy triples.
export type RepScheme =
  | "1RM"
  | "3RM"
  | "5RM"
  | "8RM"
  | "12RM"
  | "20RM"
  | "amrap_set";

export type Format =
  | "amrap"
  | "emom"
  | "for_time"
  | "chipper"
  | "tabata"
  | "ygig"
  | "interval"
  | "strength"
  | "rep_ladder";

export type RepUnit = "reps" | "m" | "cal" | "sec";

export interface Movement {
  id: string;
  name: string;
  modality: Modality;
  pattern: Pattern;
  region: Region;
  impact: Impact;
  skill: 1 | 2 | 3 | 4 | 5;
  equipment: Equipment[];
  // Which equipment-set filters allow this movement
  availableIn: EquipmentSet[];
  // Used in HYROX and conditioning blocks
  hyroxStation?: boolean;
  unit: RepUnit;
  // Intensity-scaled rep windows; engine picks within these.
  repsByIntensity: Record<Intensity, [number, number]>;
  // Loose load suggestion (for display only) — the engine doesn't compute %1RM.
  loadHint?: string;
  // For swap-by-stimulus matching.
  stimulusTags: string[];
}

export interface GeneratedSegment {
  movementId: string;
  movement: Movement;
  reps: number;
  unit: RepUnit;
  loadHint?: string;
  // Optional strength-specific display, e.g. { sets: 5, scheme: "5RM" }.
  // When present, the UI renders "5 × Back Squat @ 5RM" instead of a rep count.
  strengthSet?: { sets: number; scheme: RepScheme; restSec: number };
}

// A single block is a self-contained mini-workout with its own format.
// Workouts are composed of 2–3 blocks with rest between them.
export interface GeneratedBlock {
  id: string;
  // "A", "B", "C"
  label: string;
  // Short human-readable headline, e.g. "AMRAP 8 min", "Main Lift".
  title: string;
  format: Format;
  config: WorkoutConfig;
  segments: GeneratedSegment[];
  // "21-15-9", "5 RFT", etc.
  structure: string;
  // How long this block runs on the timer. For strength blocks this is a
  // soft target; the user can finish early or go over and the next block
  // starts when the timer reaches this mark.
  durationSec: number;
  // Seconds of rest after this block. 0 for the last block.
  restAfterSec: number;
}

export interface GeneratedWorkout {
  id: string;
  title: string;
  type: WorkoutType;
  intensity: Intensity;
  equipmentSets: EquipmentSet[];
  timeCapMinutes: number;
  // Ordered list of blocks. Each has its own format, config, and segments.
  blocks: GeneratedBlock[];
  notes?: string;
}

export type WorkoutConfig =
  | { format: "amrap"; durationSec: number }
  | { format: "for_time"; capSec: number; rounds: number }
  | { format: "chipper"; capSec: number }
  | { format: "emom"; minutes: number; stations: number }
  | { format: "tabata"; rounds: number; workSec: number; restSec: number; movements: number }
  | { format: "ygig"; capSec: number; rounds: number; partners: number }
  | { format: "interval"; rounds: number; workSec: number; restSec: number }
  | {
      format: "strength";
      // Rest target between working sets.
      mainRestSec: number;
      accessoryRestSec: number;
    }
  | {
      format: "rep_ladder";
      // Total cap; ladder is task-priority.
      capSec: number;
      // Reps per round, e.g. [21, 15, 9] or [50, 40, 30, 20, 10].
      reps: number[];
      // Display label, e.g. "21-15-9".
      label: string;
    };

export interface FilterState {
  intensity: Intensity;
  type: WorkoutType;
  equipment: EquipmentSet[];
  timeCapMinutes: number;
}
