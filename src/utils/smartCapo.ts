const SEMITONE_BY_NOTE: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

// Open, easy shapes: C, A, G, E, D
const OPEN_SHAPES: ReadonlyArray<{ name: string; semitone: number }> = [
  { name: "C", semitone: 0 },
  { name: "D", semitone: 2 },
  { name: "E", semitone: 4 },
  { name: "G", semitone: 7 },
  { name: "A", semitone: 9 },
];

export interface SmartCapoResult {
  /** Capo fret (0 = no capo) */
  capo: number;
  /** Open shape to play, keeping minor suffix when present (e.g. "Dm") */
  shape: string;
}

/**
 * Finds the capo fret that lets the player use the closest open shape
 * located at or below the target key. Eb → capo 1 / shape D.
 */
export function calculateSmartCapo(targetKey: string): SmartCapoResult | null {
  const match = targetKey.trim().match(/^([A-G][#b]?)(.*)$/);
  if (!match) return null;
  const root = SEMITONE_BY_NOTE[match[1]];
  if (root === undefined) return null;
  const suffix = /^m(?!aj)/.test(match[2]) ? "m" : "";

  let best: SmartCapoResult | null = null;
  for (const shape of OPEN_SHAPES) {
    const distance = (root - shape.semitone + 12) % 12;
    if (best === null || distance < best.capo) {
      best = { capo: distance, shape: shape.name + suffix };
    }
  }
  return best;
}

export function formatCapo(result: SmartCapoResult): string {
  return result.capo === 0
    ? `Sem capo | Tocar em ${result.shape}`
    : `Capo: ${result.capo}ª Casa | Tocar em ${result.shape}`;
}

