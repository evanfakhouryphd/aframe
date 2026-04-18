"use client";

import { cn } from "@/lib/cn";
import type {
  EquipmentSet,
  FilterState,
  Intensity,
  WorkoutType,
} from "@/lib/types";
import {
  Activity,
  Bike,
  Clock,
  Dumbbell,
  Flame,
  Footprints,
  Mountain,
  Target,
  Waves,
  Weight,
  Wind,
  Zap,
  Plane,
} from "lucide-react";

interface Props {
  value: FilterState;
  onChange: (next: FilterState) => void;
}

const INTENSITIES: { id: Intensity; label: string; sub: string; icon: React.ReactNode }[] = [
  { id: "recovery", label: "Recovery", sub: "Z1–Z2 / breathe", icon: <Activity className="h-4 w-4" /> },
  { id: "aerobic", label: "Aerobic", sub: "Z2 / capacity", icon: <Bike className="h-4 w-4" /> },
  { id: "threshold", label: "Threshold", sub: "Z3 / sustain", icon: <Target className="h-4 w-4" /> },
  { id: "max_effort", label: "Max Effort", sub: "Z4–Z5 / send", icon: <Flame className="h-4 w-4" /> },
];

const TYPES: { id: WorkoutType; label: string; icon: React.ReactNode }[] = [
  { id: "crossfit", label: "CrossFit", icon: <Zap className="h-4 w-4" /> },
  { id: "hyrox", label: "HYROX", icon: <Footprints className="h-4 w-4" /> },
  { id: "strength_conditioning", label: "S & C", icon: <Mountain className="h-4 w-4" /> },
  { id: "strength", label: "Strength", icon: <Weight className="h-4 w-4" /> },
];

const EQUIPMENT: { id: EquipmentSet; label: string; icon: React.ReactNode }[] = [
  { id: "full_gym", label: "Full Gym", icon: <Dumbbell className="h-4 w-4" /> },
  { id: "kettlebell_only", label: "Kettlebell", icon: <Dumbbell className="h-4 w-4" /> },
  { id: "dumbbell_only", label: "Dumbbell", icon: <Dumbbell className="h-4 w-4" /> },
  { id: "bodyweight_travel", label: "Travel / BW", icon: <Plane className="h-4 w-4" /> },
  { id: "rower_only", label: "Rower", icon: <Waves className="h-4 w-4" /> },
  { id: "ski_only", label: "Ski Erg", icon: <Activity className="h-4 w-4" /> },
  { id: "bike_only", label: "Bike Erg", icon: <Bike className="h-4 w-4" /> },
  { id: "airbike_only", label: "Air Bike", icon: <Wind className="h-4 w-4" /> },
];

const TIME_CAPS = [5, 10, 15, 20, 30, 45, 60];

export function FilterBar({ value, onChange }: Props) {
  return (
    <div className="space-y-6">
      <Group label="Intensity">
        <PillRow>
          {INTENSITIES.map((i) => (
            <Pill
              key={i.id}
              active={value.intensity === i.id}
              onClick={() => onChange({ ...value, intensity: i.id })}
            >
              <span className="flex items-center gap-2">
                {i.icon}
                <span>
                  <span className="block text-sm font-medium leading-tight">{i.label}</span>
                  <span className="block text-[11px] text-ink-muted leading-tight">{i.sub}</span>
                </span>
              </span>
            </Pill>
          ))}
        </PillRow>
      </Group>

      <Group label="Type">
        <PillRow>
          {TYPES.map((t) => (
            <Pill
              key={t.id}
              active={value.type === t.id}
              onClick={() => onChange({ ...value, type: t.id })}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {t.icon}
                {t.label}
              </span>
            </Pill>
          ))}
        </PillRow>
      </Group>

      <Group label="Equipment">
        <PillRow>
          {EQUIPMENT.map((e) => (
            <Pill
              key={e.id}
              active={value.equipment.includes(e.id)}
              onClick={() => {
                const has = value.equipment.includes(e.id);
                const next = has
                  ? value.equipment.filter((x) => x !== e.id)
                  : [...value.equipment, e.id];
                if (next.length === 0) return;
                onChange({ ...value, equipment: next });
              }}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {e.icon}
                {e.label}
              </span>
            </Pill>
          ))}
        </PillRow>
        <div className="px-1 mt-2 text-[11px] text-ink-muted">
          {value.equipment.length} selected · tap to toggle
        </div>
      </Group>

      <Group label="Time Cap">
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 text-ink-muted shrink-0" />
          <PillRow>
            {TIME_CAPS.map((m) => (
              <Pill
                key={m}
                active={value.timeCapMinutes === m}
                onClick={() => onChange({ ...value, timeCapMinutes: m })}
              >
                <span className="text-sm font-medium tabular-nums">{m === 60 ? "60+" : m} min</span>
              </Pill>
            ))}
          </PillRow>
        </div>
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-1 text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

function PillRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
      {children}
    </div>
  );
}

function Pill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-2 transition-all duration-150",
        "active:scale-[0.98]",
        active
          ? "bg-ink text-bg border-ink dark:bg-ink-dark dark:text-bg-dark dark:border-ink-dark"
          : "bg-surface dark:bg-surface-dark border-border dark:border-border-dark text-ink/80 dark:text-ink-dark/80 hover:border-ink/30 dark:hover:border-ink-dark/30"
      )}
    >
      {children}
    </button>
  );
}
