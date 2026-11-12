/** Frets per string, 6th string (low E) → 1st string (high e). -1 = muted (X), 0 = open (O). */
export type Frets = [number, number, number, number, number, number];

export interface ChordShape {
  name: string;
  frets: Frets;
  /** First fret displayed in the diagram (1 = nut visible) */
  baseFret: number;
  /** Optional barre across strings [from, to] (0 = 6th string, 5 = 1st string) at `fret` */
  barre?: { fret: number; from: number; to: number };
}

const NOTE_INDEX: Record<string, number> = {
  C: 0, "C#": 1, Db: 1,
  D: 2, "D#": 3, Eb: 3,
  E: 4, Fb: 4, "E#": 5,
  F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8,
  A: 9, "A#": 10, Bb: 10,
  B: 11, Cb: 11, "B#": 0,
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const STRING_OPEN_PITCH = [4, 9, 2, 7, 11, 4]; // E2, A2, D3, G3, B3, E4

/**
 * Curated dictionary of authentic acoustic guitar voicings used in Brazilian cifras.
 * Keyed by canonical sharp root + normalized quality (or slash chord).
 */
const VOICINGS: Record<string, { frets: Frets; barre?: { fret: number; from: number; to: number } }> = {
  // ── C family ──
  C:      { frets: [-1, 3, 2, 0, 1, 0] },
  Cm:     { frets: [-1, 3, 5, 5, 4, 3], barre: { fret: 3, from: 1, to: 5 } },
  C7:     { frets: [-1, 3, 2, 3, 1, 0] },
  Cm7:    { frets: [-1, 3, 5, 3, 4, 3], barre: { fret: 3, from: 1, to: 5 } },
  Cmaj7:  { frets: [-1, 3, 2, 0, 0, 0] },
  C9:     { frets: [-1, 3, 2, 0, 3, 3] },
  Cadd9:  { frets: [-1, 3, 2, 0, 3, 3] },
  Csus4:  { frets: [-1, 3, 3, 0, 1, 1] },
  Csus2:  { frets: [-1, 3, 0, 0, 1, 3] },
  C6:     { frets: [-1, 3, 2, 2, 1, 0] },
  Cm6:    { frets: [-1, 3, 1, 2, 1, 3] },
  Cdim:   { frets: [-1, 3, 4, 2, 4, -1] },
  Cm7b5:  { frets: [-1, 3, 4, 3, 4, -1] },
  Caug:   { frets: [-1, 3, 2, 1, 1, 0] },
  "C7sus4": { frets: [-1, 3, 3, 3, 1, 1] },

  // ── C# / Db family ──
  "C#":     { frets: [-1, 4, 6, 6, 6, 4], barre: { fret: 4, from: 1, to: 5 } },
  "C#m":    { frets: [-1, 4, 6, 6, 5, 4], barre: { fret: 4, from: 1, to: 5 } },
  "C#7":    { frets: [-1, 4, 6, 4, 6, 4], barre: { fret: 4, from: 1, to: 5 } },
  "C#m7":   { frets: [-1, 4, 6, 4, 5, 4], barre: { fret: 4, from: 1, to: 5 } },
  "C#maj7": { frets: [-1, 4, 6, 5, 6, 4], barre: { fret: 4, from: 1, to: 5 } },
  "C#9":    { frets: [-1, 4, 3, 4, 4, 4] },
  "C#add9": { frets: [-1, 4, 6, 6, 4, 4], barre: { fret: 4, from: 1, to: 5 } },
  "C#sus4": { frets: [-1, 4, 6, 6, 7, 4], barre: { fret: 4, from: 1, to: 5 } },
  "C#sus2": { frets: [-1, 4, 6, 6, 4, 4], barre: { fret: 4, from: 1, to: 5 } },
  "C#dim":  { frets: [-1, 4, 5, 3, 5, -1] },
  "C#m7b5": { frets: [-1, 4, 5, 4, 5, -1] },

  // ── D family ──
  D:      { frets: [-1, -1, 0, 2, 3, 2] },
  Dm:     { frets: [-1, -1, 0, 2, 3, 1] },
  D7:     { frets: [-1, -1, 0, 2, 1, 2] },
  Dm7:    { frets: [-1, -1, 0, 2, 1, 1], barre: { fret: 1, from: 4, to: 5 } },
  Dmaj7:  { frets: [-1, -1, 0, 2, 2, 2], barre: { fret: 2, from: 3, to: 5 } },
  D9:     { frets: [-1, -1, 0, 2, 3, 0] },
  Dadd9:  { frets: [-1, -1, 0, 2, 3, 0] },
  Dsus4:  { frets: [-1, -1, 0, 2, 3, 3] },
  Dsus2:  { frets: [-1, -1, 0, 2, 3, 0] },
  D6:     { frets: [-1, -1, 0, 2, 0, 2] },
  Dm6:    { frets: [-1, -1, 0, 2, 0, 1] },
  Ddim:   { frets: [-1, -1, 0, 1, 3, 1] },
  Dm7b5:  { frets: [-1, -1, 0, 1, 1, 1], barre: { fret: 1, from: 3, to: 5 } },
  Daug:   { frets: [-1, -1, 0, 3, 3, 2] },
  "D7sus4": { frets: [-1, -1, 0, 2, 1, 3] },

  // ── D# / Eb family ──
  "D#":     { frets: [-1, 6, 8, 8, 8, 6], barre: { fret: 6, from: 1, to: 5 } },
  "D#m":    { frets: [-1, 6, 8, 8, 7, 6], barre: { fret: 6, from: 1, to: 5 } },
  "D#7":    { frets: [-1, 6, 8, 6, 8, 6], barre: { fret: 6, from: 1, to: 5 } },
  "D#m7":   { frets: [-1, 6, 8, 6, 7, 6], barre: { fret: 6, from: 1, to: 5 } },
  "D#maj7": { frets: [-1, 6, 8, 7, 8, 6], barre: { fret: 6, from: 1, to: 5 } },
  "D#9":    { frets: [-1, 6, 5, 6, 6, 6] },
  "D#dim":  { frets: [-1, -1, 1, 2, 4, 2] },
  "D#m7b5": { frets: [-1, -1, 1, 2, 2, 2], barre: { fret: 2, from: 3, to: 5 } },

  // ── E family ──
  E:      { frets: [0, 2, 2, 1, 0, 0] },
  Em:     { frets: [0, 2, 2, 0, 0, 0] },
  E7:     { frets: [0, 2, 0, 1, 0, 0] },
  Em7:    { frets: [0, 2, 2, 0, 3, 0] },
  Emaj7:  { frets: [0, 2, 1, 1, 0, 0] },
  E9:     { frets: [0, 2, 2, 1, 0, 2] },
  Eadd9:  { frets: [0, 2, 2, 1, 0, 2] },
  Esus4:  { frets: [0, 2, 2, 2, 0, 0] },
  Esus2:  { frets: [0, 2, 4, 4, 0, 0] },
  E6:     { frets: [0, 2, 2, 1, 2, 0] },
  Em6:    { frets: [0, 2, 2, 0, 2, 0] },
  Edim:   { frets: [0, 1, 2, 0, -1, -1] },
  Em7b5:  { frets: [0, 1, 2, 0, 3, 0] },
  Eaug:   { frets: [0, 3, 2, 1, 1, 0] },
  "E7sus4": { frets: [0, 2, 0, 2, 0, 0] },

  // ── F family ──
  F:      { frets: [1, 3, 3, 2, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  Fm:     { frets: [1, 3, 3, 1, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  F7:     { frets: [1, 3, 1, 2, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  Fm7:    { frets: [1, 3, 1, 1, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  Fmaj7:  { frets: [-1, -1, 3, 2, 1, 0] },
  F9:     { frets: [1, 3, 3, 0, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  Fadd9:  { frets: [-1, -1, 3, 2, 1, 3] },
  Fsus4:  { frets: [1, 3, 3, 3, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  Fsus2:  { frets: [-1, -1, 3, 0, 1, 1], barre: { fret: 1, from: 4, to: 5 } },
  F6:     { frets: [-1, -1, 3, 2, 3, 1] },
  Fm6:    { frets: [-1, -1, 3, 1, 3, 1] },
  Fdim:   { frets: [-1, -1, 3, 4, 3, 4] },
  Fm7b5:  { frets: [1, 2, 1, 1, -1, -1] },

  // ── F# / Gb family ──
  "F#":     { frets: [2, 4, 4, 3, 2, 2], barre: { fret: 2, from: 0, to: 5 } },
  "F#m":    { frets: [2, 4, 4, 2, 2, 2], barre: { fret: 2, from: 0, to: 5 } },
  "F#7":    { frets: [2, 4, 2, 3, 2, 2], barre: { fret: 2, from: 0, to: 5 } },
  "F#m7":   { frets: [2, 4, 2, 2, 2, 2], barre: { fret: 2, from: 0, to: 5 } },
  "F#maj7": { frets: [2, 4, 3, 3, 2, 2], barre: { fret: 2, from: 0, to: 5 } },
  "F#sus4": { frets: [2, 4, 4, 4, 2, 2], barre: { fret: 2, from: 0, to: 5 } },
  "F#dim":  { frets: [2, 3, 4, 2, -1, -1] },
  "F#m7b5": { frets: [2, 0, 2, 2, 1, 0] },

  // ── G family ──
  G:      { frets: [3, 2, 0, 0, 3, 3] },
  Gm:     { frets: [3, 5, 5, 3, 3, 3], barre: { fret: 3, from: 0, to: 5 } },
  G7:     { frets: [3, 2, 0, 0, 0, 1] },
  Gm7:    { frets: [3, 5, 3, 3, 3, 3], barre: { fret: 3, from: 0, to: 5 } },
  Gmaj7:  { frets: [3, 2, 0, 0, 0, 2] },
  G9:     { frets: [3, 0, 0, 2, 0, 3] },
  Gadd9:  { frets: [3, 0, 0, 2, 0, 3] },
  Gsus4:  { frets: [3, 3, 0, 0, 1, 3] },
  Gsus2:  { frets: [3, 0, 0, 0, 3, 3] },
  G6:     { frets: [3, 2, 0, 0, 0, 0] },
  Gm6:    { frets: [3, 5, 5, 3, 5, 3], barre: { fret: 3, from: 0, to: 5 } },
  Gdim:   { frets: [3, 4, 5, 3, -1, -1] },
  Gm7b5:  { frets: [3, 4, 3, 3, -1, -1] },
  Gaug:   { frets: [3, 2, 1, 0, 0, 3] },
  "G7sus4": { frets: [3, 3, 0, 0, 1, 1] },

  // ── G# / Ab family ──
  "G#":     { frets: [4, 6, 6, 5, 4, 4], barre: { fret: 4, from: 0, to: 5 } },
  "G#m":    { frets: [4, 6, 6, 4, 4, 4], barre: { fret: 4, from: 0, to: 5 } },
  "G#7":    { frets: [4, 6, 4, 5, 4, 4], barre: { fret: 4, from: 0, to: 5 } },
  "G#m7":   { frets: [4, 6, 4, 4, 4, 4], barre: { fret: 4, from: 0, to: 5 } },
  "G#maj7": { frets: [4, 6, 5, 5, 4, 4], barre: { fret: 4, from: 0, to: 5 } },
  "G#dim":  { frets: [4, 5, 6, 4, -1, -1] },
  "G#m7b5": { frets: [4, 5, 4, 4, -1, -1] },

  // ── A family ──
  A:      { frets: [-1, 0, 2, 2, 2, 0] },
  Am:     { frets: [-1, 0, 2, 2, 1, 0] },
  A7:     { frets: [-1, 0, 2, 0, 2, 0] },
  Am7:    { frets: [-1, 0, 2, 0, 1, 0] },
  Amaj7:  { frets: [-1, 0, 2, 1, 2, 0] },
  A9:     { frets: [-1, 0, 2, 2, 0, 0] },
  Aadd9:  { frets: [-1, 0, 2, 2, 0, 0] },
  Asus4:  { frets: [-1, 0, 2, 2, 3, 0] },
  Asus2:  { frets: [-1, 0, 2, 2, 0, 0] },
  A6:     { frets: [-1, 0, 2, 2, 2, 2], barre: { fret: 2, from: 2, to: 5 } },
  Am6:    { frets: [-1, 0, 2, 2, 1, 2] },
  Adim:   { frets: [-1, 0, 1, 2, 1, -1] },
  Am7b5:  { frets: [-1, 0, 1, 0, 1, -1] },
  Aaug:   { frets: [-1, 0, 3, 2, 2, 1] },
  "A7sus4": { frets: [-1, 0, 2, 0, 3, 0] },

  // ── A# / Bb family ──
  "A#":     { frets: [-1, 1, 3, 3, 3, 1], barre: { fret: 1, from: 1, to: 5 } },
  "A#m":    { frets: [-1, 1, 3, 3, 2, 1], barre: { fret: 1, from: 1, to: 5 } },
  "A#7":    { frets: [-1, 1, 3, 1, 3, 1], barre: { fret: 1, from: 1, to: 5 } },
  "A#m7":   { frets: [-1, 1, 3, 1, 2, 1], barre: { fret: 1, from: 1, to: 5 } },
  "A#maj7": { frets: [-1, 1, 3, 2, 3, 1], barre: { fret: 1, from: 1, to: 5 } },
  "A#9":    { frets: [-1, 1, 3, 3, 1, 1], barre: { fret: 1, from: 1, to: 5 } },
  "A#sus4": { frets: [-1, 1, 3, 3, 4, 1], barre: { fret: 1, from: 1, to: 5 } },
  "A#sus2": { frets: [-1, 1, 3, 3, 1, 1], barre: { fret: 1, from: 1, to: 5 } },
  "A#dim":  { frets: [-1, 1, 2, 3, 2, -1] },
  "A#m7b5": { frets: [-1, 1, 2, 1, 2, -1] },

  // ── B family ──
  B:      { frets: [-1, 2, 4, 4, 4, 2], barre: { fret: 2, from: 1, to: 5 } },
  Bm:     { frets: [-1, 2, 4, 4, 3, 2], barre: { fret: 2, from: 1, to: 5 } },
  B7:     { frets: [-1, 2, 1, 2, 0, 2] },
  Bm7:    { frets: [-1, 2, 4, 2, 3, 2], barre: { fret: 2, from: 1, to: 5 } },
  Bmaj7:  { frets: [-1, 2, 4, 3, 4, 2], barre: { fret: 2, from: 1, to: 5 } },
  B9:     { frets: [-1, 2, 4, 4, 2, 2], barre: { fret: 2, from: 1, to: 5 } },
  Badd9:  { frets: [-1, 2, 4, 4, 2, 2], barre: { fret: 2, from: 1, to: 5 } },
  Bsus4:  { frets: [-1, 2, 4, 4, 5, 2], barre: { fret: 2, from: 1, to: 5 } },
  Bsus2:  { frets: [-1, 2, 4, 4, 2, 2], barre: { fret: 2, from: 1, to: 5 } },
  Bdim:   { frets: [-1, 2, 3, 4, 3, -1] },
  Bm7b5:  { frets: [-1, 2, 3, 2, 3, -1] },
  "B7sus4": { frets: [-1, 2, 4, 2, 5, 2], barre: { fret: 2, from: 1, to: 5 } },

  // ── Common Slash Chords (Baixo Invertido) ──
  "D/F#":   { frets: [2, 0, 0, 2, 3, 2] },
  "D9/F#":  { frets: [2, 0, 0, 2, 3, 0] },
  "G/B":    { frets: [-1, 2, 0, 0, 3, 3] },
  "G/D":    { frets: [-1, -1, 0, 0, 3, 3] },
  "G/F#":   { frets: [2, 2, 0, 0, 3, 3] },
  "C/E":    { frets: [0, 3, 2, 0, 1, 0] },
  "C/G":    { frets: [3, 3, 2, 0, 1, 0] },
  "C/B":    { frets: [-1, 2, 2, 0, 1, 0] },
  "C9/E":   { frets: [0, 3, 2, 0, 3, 3] },
  "Am/G":   { frets: [3, 0, 2, 2, 1, 0] },
  "Am7/G":  { frets: [3, 0, 2, 0, 1, 0] },
  "Am/E":   { frets: [0, 0, 2, 2, 1, 0] },
  "Am/F#":  { frets: [2, 0, 2, 2, 1, 0] },
  "A/C#":   { frets: [-1, 4, 2, 2, 2, 0] },
  "A/E":    { frets: [0, 0, 2, 2, 2, 0] },
  "E/G#":   { frets: [4, 2, 2, 1, 0, 0] },
  "E/B":    { frets: [-1, 2, 2, 1, 0, 0] },
  "Em/D":   { frets: [-1, -1, 0, 0, 0, 0] },
  "Em/B":   { frets: [-1, 2, 2, 0, 0, 0] },
  "F/A":    { frets: [-1, 0, 3, 2, 1, 1], barre: { fret: 1, from: 4, to: 5 } },
  "F/C":    { frets: [-1, 3, 3, 2, 1, 1], barre: { fret: 1, from: 4, to: 5 } },
  "F/G":    { frets: [3, -1, 3, 2, 1, 1], barre: { fret: 1, from: 4, to: 5 } },
  "Dm/C":   { frets: [-1, 3, 0, 2, 3, 1] },
  "Dm/A":   { frets: [-1, 0, 0, 2, 3, 1] },
  "A#/D":   { frets: [-1, -1, 0, 3, 3, 1] },
  "B/D#":   { frets: [-1, -1, 1, 4, 4, 2] },
};

function normalizeQuality(raw: string): string {
  const q = raw.replace(/[()]/g, "").trim();
  if (q === "" || q === "5") return "";
  if (/^(maj|M|Δ)(7|9|11|13)?/.test(q) || /^7M/.test(q)) return "maj7";
  if (/^(m|min|-)7b5/.test(q) || /^ø/.test(q) || /^m7-5/.test(q)) return "m7b5";
  if (/^(m|min|-)(7|9|11|13)/.test(q)) return "m7";
  if (/^(m|min|-)6/.test(q)) return "m6";
  if (/^(dim|°)/.test(q)) return "dim";
  if (/^(aug|\+|7\+)/.test(q)) return "aug";
  if (/^7(sus4|sus|4)/.test(q)) return "7sus4";
  if (/^sus2|^2$/.test(q)) return "sus2";
  if (/^(sus4|sus|4)/.test(q)) return "sus4";
  if (/^(m|min|-)(?!aj)/.test(q)) return "m";
  if (/^(add9|add2|9)/.test(q)) return "9";
  if (/^6/.test(q)) return "6";
  if (/^(7|11|13)/.test(q)) return "7";
  return "";
}

function finalizeShape(
  name: string,
  frets: Frets,
  barre?: { fret: number; from: number; to: number }
): ChordShape {
  const positive = frets.filter((f) => f > 0);
  const maxFret = positive.length ? Math.max(...positive) : 0;
  const minFret = positive.length ? Math.min(...positive) : 1;
  // Keep nut visible if chord fits in first 4 frets
  const baseFret = maxFret <= 4 ? 1 : minFret;
  return { name, frets, baseFret, barre };
}

export function getChordShape(chord: string): ChordShape | null {
  const cleaned = chord.trim();
  if (!cleaned) return null;

  const [mainPart, bassPart] = cleaned.split("/");
  const m = mainPart.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return null;

  const rootIdx = NOTE_INDEX[m[1]];
  if (rootIdx === undefined) return null;

  const canonicalRoot = SHARP_NAMES[rootIdx];
  const quality = normalizeQuality(m[2]);

  // 1. Check exact slash chord match first (e.g. D/F#, G/B, C/E)
  if (bassPart) {
    const bassMatch = bassPart.match(/^([A-G][#b]?)/);
    const bassIdx = bassMatch ? NOTE_INDEX[bassMatch[1]] : undefined;
    if (bassIdx !== undefined) {
      const canonicalBass = SHARP_NAMES[bassIdx];
      const slashKey = `${canonicalRoot}${quality}/${canonicalBass}`;
      if (VOICINGS[slashKey]) {
        const v = VOICINGS[slashKey];
        return finalizeShape(cleaned, [...v.frets] as Frets, v.barre);
      }
      const simpleSlashKey = `${canonicalRoot}/${canonicalBass}`;
      if (VOICINGS[simpleSlashKey] && (quality === "" || quality === "9")) {
        const v = VOICINGS[simpleSlashKey];
        return finalizeShape(cleaned, [...v.frets] as Frets, v.barre);
      }
    }
  }

  // 2. Check canonical root + quality in curated dictionary
  const key = `${canonicalRoot}${quality}`;
  const found = VOICINGS[key] ?? VOICINGS[canonicalRoot];
  if (!found) return null;

  const frets: Frets = [...found.frets] as Frets;
  let barre = found.barre;

  // 3. If there is a custom bass note not in the slash table, try to place it on 6th or 5th string if reachable
  if (bassPart && !barre) {
    const bassMatch = bassPart.match(/^([A-G][#b]?)/);
    const bassIdx = bassMatch ? NOTE_INDEX[bassMatch[1]] : undefined;
    if (bassIdx !== undefined) {
      const fret6 = (bassIdx - STRING_OPEN_PITCH[0] + 12) % 12;
      const fret5 = (bassIdx - STRING_OPEN_PITCH[1] + 12) % 12;
      if (fret6 <= 4) {
        frets[0] = fret6;
      } else if (fret5 <= 4) {
        frets[0] = -1;
        frets[1] = fret5;
      }
    }
  }

  return finalizeShape(cleaned, frets, barre);
}
