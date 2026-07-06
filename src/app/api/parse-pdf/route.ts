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
      return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
    }

    // Limite de segurança contra DoS / OOM (Máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'O arquivo PDF não pode ultrapassar 5MB.' },
        { status: 413 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Formato de arquivo inválido. Envie apenas PDFs.' },
        { status: 415 }
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

    const renderPage = async (pageData: any) => {
      const render_options = {
        normalizeWhitespace: false,
        disableCombineTextItems: true
      };
      
      const textContent = await pageData.getTextContent(render_options);
      const lines: { y: number, items: any[] }[] = [];
      
      for (const item of textContent.items) {
        // Skip empty string items
        if (!item.str || item.str === '') continue;
        
        const y = item.transform[5];
        // Tolerance of 3 points for items on the same line
        let line = lines.find(l => Math.abs(l.y - y) < 3);
        if (!line) {
          line = { y: y, items: [] };
          lines.push(line);
        }
        line.items.push(item);
      }
      
      // Sort lines top to bottom (PDF Y is usually 0 at bottom)
      lines.sort((a, b) => b.y - a.y);
      
      let text = '';
      
      for (const line of lines) {
        // Sort items left to right
        line.items.sort((a, b) => a.transform[4] - b.transform[4]);
        
        let lineText = '';
        let currentX = 0;
        
        for (const item of line.items) {
          const itemX = item.transform[4];
          const fontSize = item.transform[0] || 10;
          // In a monospace font, every character (including space) is typically ~0.6 times the font size.
          // By using 0.6, the number of spaces we generate perfectly matches the frontend monospace rendering.
          const monospaceCharWidth = fontSize * 0.6;
          const spaceWidth = Math.max(monospaceCharWidth, 6); 
          
          if (currentX > 0) {
            const gap = itemX - currentX;
            if (gap > spaceWidth) {
              const numSpaces = Math.max(1, Math.round(gap / spaceWidth));
              lineText += ' '.repeat(numSpaces);
            }
          } else {
            // Initial line indentation (assuming page margin is around 20-30 points)
            if (itemX > 30) {
              const numSpaces = Math.max(0, Math.round((itemX - 30) / spaceWidth));
              lineText += ' '.repeat(numSpaces);
            }
          }
          let str = item.str;
          const trueTextWidth = str.trimEnd().length * monospaceCharWidth;
          
          if (item.width && item.width > trueTextWidth + spaceWidth * 2 && str.includes(' ')) {
            const extraWidth = item.width - trueTextWidth;
            const extraSpaces = Math.max(0, Math.round(extraWidth / spaceWidth));
            const spaceCount = str.match(/ /g)?.length || 1;
            const spacesPerGap = Math.round(extraSpaces / spaceCount);
            if (spacesPerGap > 0) {
              str = str.replace(/ /g, ' '.repeat(1 + spacesPerGap));
            }
          }
          
          lineText += str;
          
          currentX = itemX + (str.trimEnd().length * monospaceCharWidth);
        }
        text += lineText.trimEnd() + '\n';
      }
      
      return text;
    };

    const doc = (parser as any).doc;
    if (!doc) throw new Error("Não foi possível ler o documento PDF");
    
    let rawText = '';
    const numPages = doc.numPages;
    for (let i = 1; i <= numPages; i++) {
      const pageData = await doc.getPage(i);
      rawText += `\n--- PAGE ${i} ---\n`;
      rawText += await renderPage(pageData);
    }

    // We already built rawText in the loop above.

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
