import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Regex to match YouTube URLs (youtube.com/watch, youtu.be, youtube.com/shorts, etc.)
 * Also matches generic URLs as a fallback.
 */
const YOUTUBE_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?[^\s]*|shorts\/[^\s]*|embed\/[^\s]*)|youtu\.be\/[^\s]+)/gi;
const GENERIC_URL_REGEX = /https?:\/\/[^\s]+/gi;

/**
 * Extracts YouTube/reference URLs from a text block.
 * Returns the first YouTube URL found (or first generic URL), and the text with the URL line removed.
 */
function extractReferenceUrl(text: string): { referenceUrl: string; cleanedText: string } {
  // First try YouTube URLs
  const ytMatch = text.match(YOUTUBE_REGEX);
  if (ytMatch) {
    // Remove the entire line containing the URL
    const cleanedText = text
      .split('\n')
      .filter((line) => !YOUTUBE_REGEX.test(line))
      .join('\n')
      .trim();
    // Reset lastIndex since we used /g flag
    YOUTUBE_REGEX.lastIndex = 0;
    return { referenceUrl: ytMatch[0], cleanedText };
  }

  // Fallback: try any URL
  const urlMatch = text.match(GENERIC_URL_REGEX);
  if (urlMatch) {
    const cleanedText = text
      .split('\n')
      .filter((line) => !GENERIC_URL_REGEX.test(line))
      .join('\n')
      .trim();
    GENERIC_URL_REGEX.lastIndex = 0;
    return { referenceUrl: urlMatch[0], cleanedText };
  }

  return { referenceUrl: '', cleanedText: text };
}

/**
 * Extracts the title from a block of text.
 * Returns the first non-empty line (capped at 80 chars).
 * The remaining lines become the content body.
 */
function splitTitleAndContent(block: string): { title: string; content: string } {
  const lines = block.split('\n');
  let titleLine = '';
  let contentStartIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      titleLine = trimmed.length > 80 ? trimmed.substring(0, 80) + '…' : trimmed;
      contentStartIdx = i + 1;
      break;
    }
  }

  const content = lines.slice(contentStartIdx).join('\n').trim();
  return { title: titleLine || 'Música Sem Título', content: content || block.trim() };
}

export async function POST(request: Request) {
  try {
    // ── 1. Validate input ──────────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Formato inválido. Apenas PDFs são aceitos.' },
        { status: 400 }
      );
    }

    // ── 2. Convert file to Buffer ──────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ── 3. Extract text with pdf-parse v2 ──────────────────────────────────
    require('pdf-parse/worker');
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer, verbosity: -1 });
    await parser.load();

    // Use pageJoiner to insert markers between pages
    const textResult = await parser.getText({
      pageJoiner: '\n--- PAGE {PAGE_NUM} ---\n',
    });

    let rawText: string;
    if (typeof textResult === 'string') {
      rawText = textResult;
    } else if (textResult && Array.isArray(textResult.pages)) {
      rawText = textResult.pages
        .map((p: { text: string; num: number }) => `--- PAGE ${p.num} ---\n${p.text}`)
        .join('\n');
    } else {
      rawText = String(textResult ?? '');
    }

    // ── 4. Split by page markers ───────────────────────────────────────────
    const rawSongs = rawText
      .split(/---\s*PAGE\s*\d+\s*---/i)
      .map((block) => block.trim())
      .filter((block) => block.length > 20); // Ignore tiny/empty fragments

    // ── 5. Structure each block ────────────────────────────────────────────
    const extractedSongs = rawSongs.map((block, index) => {
      // Extract reference URL before splitting title/content
      const { referenceUrl, cleanedText } = extractReferenceUrl(block);
      const { title, content } = splitTitleAndContent(cleanedText);
      return {
        id: `temp-${Date.now()}-${index}`,
        title,
        content,
        part: 'ENTRADA' as const,
        referenceUrl,
      };
    });

    // Fallback: if no split worked, return all text as one song
    if (extractedSongs.length === 0 && rawText.trim().length > 0) {
      const { referenceUrl, cleanedText } = extractReferenceUrl(rawText.trim());
      const { title, content } = splitTitleAndContent(cleanedText);
      extractedSongs.push({
        id: 'temp-unica',
        title,
        content,
        part: 'ENTRADA' as const,
        referenceUrl,
      });
    }

    return NextResponse.json({ songs: extractedSongs });
  } catch (error: any) {
    console.error("ERRO PDF-PARSE:", error);
    return NextResponse.json(
      { error: error.message || "Erro desconhecido ao processar o PDF" },
      { status: 500 }
    );
  }
}
