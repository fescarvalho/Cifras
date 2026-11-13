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
 * Robust chord regex supporting CifraClub and Brazilian liturgical notation:
 * - Roots: A-G with # or b accidentals
 * - Qualities: m, M, maj, min, dim, aug, sus, sus2, sus4, º, °, +, ø
 * - Extensions: 2, 4, 5, 6, 7, 7M, 9, 11, 13, add2, add4, add9, add11
 * - Slash extensions: /9, /11, /13, 6/9
 * - Altered tones: b5, #5, 5-, 5+, b9, #9, 9-, 9+, #11, 11+, b13, 13-
 * - Parenthesised modifiers (one or more): (11), (9), (b5), (4/9), (9/13), (add9)
 * - Inverted bass note: /A, /F#, /G#, /Bb
 */
const CHORD_REGEX =
  /^\(?[A-G](?:#|b)?(?:(?:maj|min|aug|dim|sus|add)(?:\d{1,2})?|[mMº°ø\+])?(?:\d{1,2}(?:M|\+|-)?)*(?:\/\d{1,2})*(?:(?:b|#|\+|-)(?:5|9|11|13)|\d{1,2}(?:b|#|\+|-))*(?:\([A-Za-z0-9#b+\-\/,\s]{1,12}\))*(?:\/[A-G](?:#|b)?)?\)?$/;

/** Repeat tokens commonly placed on chord lines in CifraClub, e.g. (2x), 3x, (bis) */
const REPEAT_TOKEN_RE = /^\(?(?:\d{1,2}x|bis)\)?$/i;

/** Section labels that can prefix a chord line on the same line, e.g. [Intro] D E F#m */
const CHORD_LINE_PREFIX_RE = /^(?:intro(?:du[cç][aã]o)?|final|solo|instrumental|interl[uú]dio|passagem|ponte|base|riff|dedilhado)$/i;

/** Tokens that are structural separators and do not count as chords or invalid words. */
const STRUCTURAL_RE = /^[|:\-\[\]()+\/]+$/;

/**
 * Sanitizes raw text extracted from a PDF or web page, removing common formatting artefacts
 * like stray dollar signs, backslashes, and non-printable characters that corrupt chord names.
 */
export function sanitizePdfText(text: string): string {
  if (!text) return '';
  return (
    text
      .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
      .replace(/\$/g, '')
      .replace(/\\(#|b|[A-Za-z])/g, '$1')
      .replace(/\\/g, '')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\u00A0\u202F\u2009]/g, ' ')
  );
}

export const sanitizeSongText = sanitizePdfText;

/**
 * Checks if a single string token is a valid chord or structural chord-line token.
 */
export function isChordToken(token: string): boolean {
  const clean = token.replace(/[\u200B-\u200D\uFEFF\u2060]/g, '').trim();
  if (!clean) return false;
  if (STRUCTURAL_RE.test(clean) || REPEAT_TOKEN_RE.test(clean)) return true;
  // Strip outer unmatched parentheses when checking a single chord token
  const unwrapped = clean.replace(/^\(+/, '').replace(/\)+$/, (m) => {
    // Keep one closing paren if there's an opening paren inside the chord like F#m7(11)
    return clean.includes('(') && !clean.startsWith('(') ? ')' : m.length > 1 && clean.includes('(') ? ')' : '';
  });
  return CHORD_REGEX.test(clean) || (unwrapped.length > 0 && CHORD_REGEX.test(unwrapped));
}

/**
 * Checks if a line is a chord line.
 */
export function isChordLine(line: string): boolean {
  const trimmed = line?.replace(/[\u200B-\u200D\uFEFF\u2060]/g, '').trim();
  if (!trimmed) return false;

  // Reject ASCII guitar tablature lines like "E|---0---|" or "D|-----------|"
  if (/^[A-Ga-g][#b]?\|[-0-9hHpPbBrRsS/\\~xX()\s|]+$/.test(trimmed)) {
    return false;
  }

  // Pure section header like [Primeira Parte] or [Refrão] (with nothing after `]`) is a header, not a chord line
  if (trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.slice(1, -1).includes('[')) {
    const inside = trimmed.slice(1, -1).trim();
    const insideTokens = inside.split(/\s+/).filter(Boolean);
    const allChordsInside = insideTokens.length > 0 && insideTokens.every((t) => CHORD_REGEX.test(t));
    if (!allChordsInside) return false;
  }

  // Replace structural separators (brackets, pipes, dashes, colons, dots) with spaces
  const stripped = trimmed.replace(/[\s|\-–—:.\[\]]+/g, ' ').trim();
  if (!stripped) return false;

  const rawTokens = stripped.split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return false;

  // Check if the line starts with a known chord-line prefix (e.g. "Intro", "Final", "Solo")
  const firstToken = rawTokens[0].replace(/^[()]+|[()]+$/g, '');
  const hasPrefix = CHORD_LINE_PREFIX_RE.test(firstToken);

  const candidateTokens = hasPrefix ? rawTokens.slice(1) : rawTokens;

  if (hasPrefix && candidateTokens.length === 0) return true;

  let validChordCount = 0;

  for (const raw of candidateTokens) {
    if (STRUCTURAL_RE.test(raw) || REPEAT_TOKEN_RE.test(raw)) {
      continue;
    }
    // Handle outer group parentheses like "(D" or "E)" or "F#m7(11))"
    let tok = raw;
    while (tok.startsWith('(')) tok = tok.slice(1);
    while (tok.endsWith(')') && (tok.match(/\)/g)?.length ?? 0) > (tok.match(/\(/g)?.length ?? 0)) {
      tok = tok.slice(0, -1);
    }
    if (!tok || REPEAT_TOKEN_RE.test(tok)) continue;

    if (CHORD_REGEX.test(tok)) {
      validChordCount++;
    } else {
      return false;
    }
  }

  return validChordCount > 0;
}

/**
 * Auto-detects the original key from the first valid chord line in the content.
 */
export function autoDetectKey(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    if (isChordLine(line)) {
      const stripped = line
        .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
        .replace(/[\s|\-–—:.\[\]]+/g, ' ')
        .trim();
      const tokens = stripped.split(/\s+/).filter(Boolean);

      for (const raw of tokens) {
        let token = raw;
        while (token.startsWith('(')) token = token.slice(1);
        while (token.endsWith(')') && (token.match(/\)/g)?.length ?? 0) > (token.match(/\(/g)?.length ?? 0)) {
          token = token.slice(0, -1);
        }
        if (!token || CHORD_LINE_PREFIX_RE.test(token) || REPEAT_TOKEN_RE.test(token)) {
          continue;
        }

        if (CHORD_REGEX.test(token)) {
          const match = token.match(/^([A-G](?:#|b)?(?:m(?!aj))?)/);
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
 * Transposes a single chord string (e.g., C#m7(11), G/B, (D2)) by a given number of semitones.
 */
export function transposeChord(chord: string, semitones: number, preferredScale: string[]): string {
  if (semitones === 0) return chord;

  // Preserve leading '(' and trailing unmatched ')'
  let prefix = '';
  let suffix = '';
  let core = chord.replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');

  while (core.startsWith('(')) {
    prefix += '(';
    core = core.slice(1);
  }
  while (core.endsWith(')') && (core.match(/\)/g)?.length ?? 0) > (core.match(/\(/g)?.length ?? 0)) {
    suffix = ')' + suffix;
    core = core.slice(0, -1);
  }

  if (!core || !CHORD_REGEX.test(core)) {
    return chord;
  }

  const transposeRoot = (c: string): string => {
    const match = c.match(/^([A-G](?:#|b)?)(.*)$/);
    if (!match) return c;
    const [, root, extension] = match;
    const transposedRoot = transposeNote(root, semitones, preferredScale);
    return transposedRoot + extension;
  };

  const bassMatch = core.match(/\/([A-G](?:#|b)?)$/);

  if (bassMatch) {
    const bassNote = bassMatch[1];
    const mainChord = core.slice(0, -bassMatch[0].length);
    const transposedMain = transposeRoot(mainChord);
    const transposedBass = transposeNote(bassNote, semitones, preferredScale);
    return `${prefix}${transposedMain}/${transposedBass}${suffix}`;
  }

  return `${prefix}${transposeRoot(core)}${suffix}`;
}

/**
 * Analyzes the song content to decide if sharps or flats are preferred.
 */
export function getPreferredScale(content: string): string[] {
  let sharpCount = 0;
  let flatCount = 0;

  const lines = content.split('\n');
  for (const line of lines) {
    if (isChordLine(line)) {
      const tokens = line.trim().split(/\s+/);
      for (const token of tokens) {
        if (/[A-G]#/.test(token)) sharpCount++;
        if (/[A-G]b/.test(token)) flatCount++;
      }
    }
  }

  return flatCount > sharpCount ? FLATS : SHARPS;
}

/**
 * Transposes a single line, maintaining exact spacing if it is a chord line.
 */
export function transposeLine(line: string, semitones: number, preferredScale: string[]): string {
  const cleanLine = line.replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');
  if (!isChordLine(cleanLine) || semitones === 0) {
    return cleanLine;
  }

  const tokenRegex = /\S+/g;
  let match;
  const tokens: { text: string; index: number }[] = [];

  while ((match = tokenRegex.exec(cleanLine)) !== null) {
    tokens.push({
      text: match[0],
      index: match.index,
    });
  }

  let outputLine = '';
  let lastOutputEnd = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const isStructuralOrLabel =
      STRUCTURAL_RE.test(token.text) ||
      REPEAT_TOKEN_RE.test(token.text) ||
      /^\[?[A-Za-zÀ-ÿ]+[:.\]]*$/.test(token.text) && !CHORD_REGEX.test(token.text);

    const transposedText = isStructuralOrLabel
      ? token.text
      : transposeChord(token.text, semitones, preferredScale);

    let spacesNeeded = token.index - lastOutputEnd;
    if (i > 0 && spacesNeeded < 1) {
      spacesNeeded = 1;
    } else if (i === 0 && spacesNeeded < 0) {
      spacesNeeded = 0;
    }

    outputLine += ' '.repeat(spacesNeeded) + transposedText;
    lastOutputEnd = outputLine.length;
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
  const transposedLines = lines.map((line) => transposeLine(line, semitones, preferredScale));

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
