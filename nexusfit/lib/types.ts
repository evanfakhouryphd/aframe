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
  | "sc_couplet";

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

export interface GeneratedWorkout {
  id: string;
  title: string;
  format: Format;
  type: WorkoutType;
  intensity: Intensity;
  equipmentSet: EquipmentSet;
  timeCapMinutes: number;
  // Format-specific config used by the timer.
  config: WorkoutConfig;
  // Ordered movement list for display.
  segments: GeneratedSegment[];
  // Human-readable structure string ("21-15-9", "5 RFT", etc.)
  structure: string;
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
      // Rest target between working sets of the main lift.
      mainRestSec: number;
      // Rest target between accessory supersets.
      accessoryRestSec: number;
    }
  | {
      format: "sc_couplet";
      // Total session cap. Strength block runs first, then conditioning.
      capSec: number;
      strengthMinutes: number;
      conditioningMinutes: number;
    };

export interface FilterState {
  intensity: Intensity;
  type: WorkoutType;
  equipment: EquipmentSet;
  timeCapMinutes: number;
}
