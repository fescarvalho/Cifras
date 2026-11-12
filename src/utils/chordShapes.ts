/** Frets per string, low E → high e. -1 = muted, 0 = open. */
export type Frets = [number, number, number, number, number, number];

export interface ChordShape {
  name: string;
  frets: Frets;
  /** First fret displayed in the diagram */
  baseFret: number;
  /** Barre across strings [from, to] (0-based) at `fret` */
  barre?: { fret: number; from: number; to: number };
}

const NOTE_INDEX: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

// Open-position chords (keyed by sharp-normalized name)
const OPEN: Record<string, Frets> = {
  C: [-1, 3, 2, 0, 1, 0],
  C7: [-1, 3, 2, 3, 1, 0],
  Cmaj7: [-1, 3, 2, 0, 0, 0],
  D: [-1, -1, 0, 2, 3, 2],
  Dm: [-1, -1, 0, 2, 3, 1],
  D7: [-1, -1, 0, 2, 1, 2],
  Dmaj7: [-1, -1, 0, 2, 2, 2],
  Dsus4: [-1, -1, 0, 2, 3, 3],
  Dsus2: [-1, -1, 0, 2, 3, 0],
  G: [3, 2, 0, 0, 0, 3],
  G7: [3, 2, 0, 0, 0, 1],
  Gmaj7: [3, 2, 0, 0, 0, 2],
  B7: [-1, 2, 1, 2, 0, 2],
  F: [1, 3, 3, 2, 1, 1],
};

// Movable templates — E-shape (root on 6th string) and A-shape (root on 5th)
const E_SHAPES: Record<string, Frets> = {
  "": [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  "7": [0, 2, 0, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
  sus4: [0, 2, 2, 2, 0, 0],
  sus2: [0, 2, 4, 4, 0, 0],
  dim: [0, 1, 2, 0, -1, -1],
  aug: [0, 3, 2, 1, 1, 0],
};

const A_SHAPES: Record<string, Frets> = {
  "": [-1, 0, 2, 2, 2, 0],
  m: [-1, 0, 2, 2, 1, 0],
  "7": [-1, 0, 2, 0, 2, 0],
  m7: [-1, 0, 2, 0, 1, 0],
  maj7: [-1, 0, 2, 1, 2, 0],
  sus4: [-1, 0, 2, 2, 3, 0],
  sus2: [-1, 0, 2, 2, 0, 0],
  dim: [-1, 0, 1, 2, 1, -1],
  aug: [-1, 0, 3, 2, 2, 1],
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function normalizeQuality(raw: string): string {
  if (raw === "") return "";
  if (/^maj7|^M7|^7M/.test(raw)) return "maj7";
  if (/^m7|^min7|^-7/.test(raw)) return "m7";
  if (/^dim|^°/.test(raw)) return "dim";
  if (/^aug|^\+/.test(raw)) return "aug";
  if (/^sus2/.test(raw)) return "sus2";
  if (/^sus/.test(raw)) return "sus4";
  if (/^(m|min|-)(?!aj)/.test(raw)) return "m";
  if (/^(7|9|11|13)/.test(raw)) return "7";
  return "";
}

function build(name: string, frets: Frets, barreFret?: number, barreFrom?: number): ChordShape {
  const positive = frets.filter((f) => f > 0);
  const maxFret = positive.length ? Math.max(...positive) : 0;
  const minFret = positive.length ? Math.min(...positive) : 1;
  const baseFret = maxFret <= 4 ? 1 : minFret;
  return {
    name,
    frets,
    baseFret,
    barre:
      barreFret && barreFret > 0 && barreFrom !== undefined
        ? { fret: barreFret, from: barreFrom, to: 5 }
        : undefined,
  };
}

export function getChordShape(chord: string): ChordShape | null {
  const slashless = chord.split("/")[0];
  const m = slashless.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return null;
  const rootIdx = NOTE_INDEX[m[1]];
  if (rootIdx === undefined) return null;

  const quality = normalizeQuality(m[2]);
  const key = SHARP_NAMES[rootIdx] + quality;
  const open = OPEN[key];
  if (open) return build(chord, open);

  const eFret = (rootIdx - 4 + 12) % 12;
  const aFret = (rootIdx - 9 + 12) % 12;
  const useE = eFret <= aFret;
  const template = (useE ? E_SHAPES : A_SHAPES)[quality] ?? (useE ? E_SHAPES : A_SHAPES)[""];
  const offset = useE ? eFret : aFret;

  const frets = template.map((f) => (f < 0 ? -1 : f + offset)) as Frets;
  return build(chord, frets, offset, useE ? 0 : 1);
}

