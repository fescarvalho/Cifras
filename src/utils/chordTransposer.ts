// Chromatic scales
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Map to get semitone values (0-11)
const NOTE_TO_SEMITONE: { [key: string]: number } = {
  'C': 0, 'C#': 1, 'Db': 1,
  'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4,
  'F': 5, 'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8,
  'A': 9, 'A#': 10, 'Bb': 10,
  'B': 11
};

/**
 * Robust chord regex supporting:
 * - Roots: A-G with # or b accidentals
 * - Qualities: m, M, maj, min, dim, aug, sus, sus2, sus4
 * - Extensions: 4, 5, 6, 7, 9, 11, 13, add9, add11, add13
 * - Altered tones: b5, #5, b9, #9, #11, b13
 * - Parenthesised modifiers: (9), (b5), etc.
 * - Slash / inverted bass: /A, /F#, /Cb
 */
const CHORD_REGEX =
  /^\(?[A-G](?:#|b)?(?:(?:maj|min|aug|dim|sus|add)(?:\d{1,2})?|[mMº°\+])?(?:\d{1,2}(?:M|\+?)?)?(?:(?:b|#)(?:5|9|11|13))*(?:\([^)]{1,10}\))?(?:\/[A-G](?:#|b)?)?\)?$/;

/** Tokens that are structural separators and do not count as chords or invalid words. */
const STRUCTURAL_RE = /^[|:\-\[\]()+\/]+$/;

/**
 * Sanitizes raw text extracted from a PDF, removing common formatting artefacts
 * like stray dollar signs, backslashes, and non-printable characters that corrupt chord names.
 *
 * Examples:
 *   "$E/G\#$"  → "E/G#"
 *   "A\m"      → "Am"
 */
export function sanitizePdfText(text: string): string {
  if (!text) return '';
  return (
    text
      // Remove LaTeX-style math delimiters and stray $
      .replace(/\$/g, '')
      // Remove backslash before # (\# → #) and before letters (\m → m)
      .replace(/\\(#|b|[A-Za-z])/g, '$1')
      // Remove lone backslashes
      .replace(/\\/g, '')
      // Normalize en-dashes (–) and em-dashes (—) to standard hyphens
      .replace(/[\u2013\u2014]/g, '-')
      // Normalize non-breaking spaces to regular spaces
      .replace(/[\u00A0\u202F\u2009]/g, ' ')
  );
}

/**
 * Checks if a single string token is a valid chord or structural chord-line token.
 */
export function isChordToken(token: string): boolean {
  const clean = token.trim();
  if (!clean) return false;
  if (STRUCTURAL_RE.test(clean)) return true;
  return CHORD_REGEX.test(clean);
}

/**
 * Checks if a line is a chord line using a strict, infalível heuristic:
 *
 *  1. trim() — if empty → false
 *  2. Remove all structural punctuation allowed in chord lines:
 *       spaces, hyphens, pipes (|), parentheses, colons, dots
 *  3. Split remaining text into tokens on whitespace
 *  4. The line is a chord line if and only if:
 *       - There is at least one token, AND
 *       - EVERY token matches CHORD_REGEX
 *
 *  This means "   G/B   -   C9  " is correctly identified:
 *    after stripping structural chars → ["G/B", "C9"] → both match → true
 *
 *  And "Aleluia" or "Glória a Deus" → no match → false
 */
export function isChordLine(line: string): boolean {
  const trimmed = line?.trim();
  if (!trimmed) return false;

  // Remove all structural separators so they don't pollute the token list
  // Keeps letters, digits, #, b, +, (, ) — the core chord characters
  // Included en-dash (–) and em-dash (—) commonly found in copy-pasted texts.
  const stripped = trimmed.replace(/[\s|\-–—:.]+/g, ' ').trim();
  if (!stripped) return false;

  const tokens = stripped.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  // Check if the line starts with "intro" (case insensitive)
  const firstToken = tokens[0].toLowerCase();
  const isIntro = firstToken === 'intro' || firstToken === 'introdução' || firstToken === 'introducao';
  
  const chordTokens = isIntro ? tokens.slice(1) : tokens;

  // If the line is ONLY "Intro", consider it a chord line so it gets highlighted
  if (isIntro && chordTokens.length === 0) return true;

  // Every single remaining token must be a valid chord
  return chordTokens.every((token) => CHORD_REGEX.test(token));
}

/**
 * Auto-detects the original key from the first valid chord line in the content.
 * It focuses on the base note (e.g. F#m7 -> F#m, C/E -> C).
 * If no valid chord is found, it falls back to "C".
 */
export function autoDetectKey(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    if (isChordLine(line)) {
      const stripped = line.replace(/[\s|\-–—:.]+/g, ' ').trim();
      const tokens = stripped.split(/\s+/).filter(Boolean);
      
      for (const token of tokens) {
        const lower = token.toLowerCase();
        if (lower === 'intro' || lower === 'introdução' || lower === 'introducao') {
          continue;
        }
        
        if (CHORD_REGEX.test(token)) {
          // Extract base note + optional minor 'm' (ignore slash bass or complex extensions)
          // E.g., F#m7 -> F#m, A9 -> A, C#dim -> C#
          // Also handle cases where the regex matches 'M', 'maj', etc. But let's just stick to base + minor.
          const match = token.match(/^([A-G](?:#|b)?(?:m)?)/);
          if (match) {
            return match[1];
          }
        }
      }
    }
  }
  return 'C';
}
/**
 * Transposes a single note by a given number of semitones, outputting in the preferred accidental scale.
 */
function transposeNote(note: string, semitones: number, preferredScale: string[]): string {
  const currentSemitone = NOTE_TO_SEMITONE[note];
  if (currentSemitone === undefined) return note;

  let newSemitone = (currentSemitone + semitones) % 12;
  if (newSemitone < 0) {
    newSemitone += 12;
  }

  return preferredScale[newSemitone];
}

/**
 * Transposes a single chord string (e.g., C#m7, G/B) by a given number of semitones.
 */
export function transposeChord(chord: string, semitones: number, preferredScale: string[]): string {
  if (semitones === 0) return chord;

  // Check if it's a slash chord (e.g., G/B)
  const parts = chord.split('/');
  
  const transposeRoot = (c: string): string => {
    // Match root note: letter A-G, optionally followed by # or b
    const match = c.match(/^([A-G](?:#|b)?)(.*)$/);
    if (!match) return c;
    const [, root, extension] = match;
    const transposedRoot = transposeNote(root, semitones, preferredScale);
    return transposedRoot + extension;
  };

  const transposedMain = transposeRoot(parts[0]);
  if (parts.length > 1) {
    const bassNote = parts[1];
    // The bass note is just a note (e.g., B, F#)
    const transposedBass = transposeNote(bassNote, semitones, preferredScale);
    return `${transposedMain}/${transposedBass}`;
  }

  return transposedMain;
}

/**
 * Analyzes the song content to decide if sharps or flats are preferred.
 * Count occurrences of flat notes vs sharp notes.
 */
export function getPreferredScale(content: string): string[] {
  let sharpCount = 0;
  let flatCount = 0;

  // Simple scan of entire content for flat/sharp patterns
  const lines = content.split('\n');
  for (const line of lines) {
    if (isChordLine(line)) {
      const tokens = line.trim().split(/\s+/);
      for (const token of tokens) {
        if (CHORD_REGEX.test(token)) {
          // Check for sharp/flat in the root or bass note
          if (/[A-G]#/.test(token)) sharpCount++;
          if (/[A-G]b/.test(token)) flatCount++;
        }
      }
    }
  }

  return flatCount > sharpCount ? FLATS : SHARPS;
}

/**
 * Transposes a single line, maintaining spacing if it is a chord line.
 */
export function transposeLine(line: string, semitones: number, preferredScale: string[]): string {
  if (!isChordLine(line) || semitones === 0) {
    return line;
  }

  // Match all non-whitespace tokens along with their starting indices
  const tokenRegex = /\S+/g;
  let match;
  const tokens: { text: string; index: number }[] = [];

  while ((match = tokenRegex.exec(line)) !== null) {
    tokens.push({
      text: match[0],
      index: match.index
    } as any);
  }

  let outputLine = '';
  let lastOutputEnd = 0;

  for (const token of tokens) {
    // Determine the transposed text
    const transposedText = /^[|:\-\[\]()+]+$/.test(token.text)
      ? token.text
      : transposeChord(token.text, semitones, preferredScale);

    // Calculate spaces needed to maintain alignment
    let spacesNeeded = token.index - lastOutputEnd;
    if (spacesNeeded < 2) {
      spacesNeeded = 2; // Minimum 2 spaces between chords so they never look glued
    }

    outputLine += ' '.repeat(spacesNeeded) + transposedText;
    lastOutputEnd = outputLine.length;
  }

  // Preserve leading spaces from the original line if any
  const leadingSpacesCount = line.length - line.trimStart().length;
  if (leadingSpacesCount > 0 && !outputLine.startsWith(' '.repeat(leadingSpacesCount))) {
    const diff = leadingSpacesCount - (outputLine.length - outputLine.trimStart().length);
    if (diff > 0) {
      outputLine = ' '.repeat(diff) + outputLine;
    }
  }

  return outputLine;
}

/**
 * Transposes all chord lines in a full song content string.
 */
export function transposeSongContent(content: string, semitones: number): string {
  if (semitones === 0) return content;
  
  const preferredScale = getPreferredScale(content);
  const lines = content.split('\n');
  const transposedLines = lines.map(line => transposeLine(line, semitones, preferredScale));
  
  return transposedLines.join('\n');
}

/**
 * Calculates the exact semitone difference between an original key and a target key.
 */
export function getSemitoneDifference(originalKey: string, targetKey: string): number {
  const matchOrig = originalKey.match(/^([A-G](?:#|b)?)/);
  const matchTarget = targetKey.match(/^([A-G](?:#|b)?)/);
  if (!matchOrig || !matchTarget) return 0;
  
  const origSt = NOTE_TO_SEMITONE[matchOrig[1]];
  const targetSt = NOTE_TO_SEMITONE[matchTarget[1]];
  if (origSt === undefined || targetSt === undefined) return 0;
  
  let diff = targetSt - origSt;
  if (diff < -6) diff += 12;
  if (diff > 6) diff -= 12;
  return diff;
}

/**
 * Gets the transposed key string given a base key and semitones to shift.
 */
export function getTransposedKey(baseKey: string, semitones: number, preferredScale: string[]): string {
  if (semitones === 0) return baseKey;
  const match = baseKey.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!match) return baseKey;
  
  const [, root, extension] = match;
  const current = NOTE_TO_SEMITONE[root];
  if (current === undefined) return baseKey;
  
  let newSt = (current + semitones) % 12;
  if (newSt < 0) newSt += 12;
  return preferredScale[newSt] + extension;
}
