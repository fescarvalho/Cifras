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
      .replace(/^\n+|\n+$/g, '');
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
      .replace(/^\n+|\n+$/g, '');
    GENERIC_URL_REGEX.lastIndex = 0;
    return { referenceUrl: urlMatch[0], cleanedText };
  }

  return { referenceUrl: '', cleanedText: text };
}

/**
 * Extracts the title from a block of text.
 * Returns the first non-empty line (capped at 80 chars).
 * The remaining lines become the content body without stripping horizontal spaces.
 */
function splitTitleAndContent(block: string): { title: string; content: string } {
  const lines = block.split('\n');
  let titleLine = '';
  let contentStartIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const nonSpaceChars = lines[i].replace(/ /g, '');
    if (nonSpaceChars.length > 0) {
      const cleanTitle = lines[i].replace(/^ +| +$/g, '');
      titleLine = cleanTitle.length > 80 ? cleanTitle.substring(0, 80) + '…' : cleanTitle;
      contentStartIdx = i + 1;
      break;
    }
  }

  const content = lines.slice(contentStartIdx).join('\n').replace(/^\n+|\n+$/g, '');
  return { title: titleLine || 'Música Sem Título', content: content || block.replace(/^\n+|\n+$/g, '') };
}

export async function POST(request: Request) {
  try {
    // ── 1. Validate input ──────────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const mergePages = formData.get('mergePages') === 'true';

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

    // ── 3. Extract text with pdf-parse (custom pagerender with X/Y coordinates) ──
    require('pdf-parse/worker');
    const { PDFParse } = require('pdf-parse');

    const pagerender = async (pageData: any) => {
      const render_options = {
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      };

      const textContent = await pageData.getTextContent(render_options);
      const lines: { y: number; items: any[] }[] = [];

      for (const item of textContent.items) {
        // Ignora itens vazios ou itens sintéticos de espaço em branco do PDF.js
        // para que a distância X real entre acordes/palavras seja calculada pelas coordenadas
        if (!item.str || item.str.replace(/ /g, '') === '') continue;

        const y = item.transform[5];
        // Agrupa por linha com base na coordenada vertical Y (tolerância de 3 pixels)
        let line = lines.find((l) => Math.abs(l.y - y) <= 3);
        if (!line) {
          line = { y, items: [] };
          lines.push(line);
        }
        line.items.push(item);
      }

      // Ordena as linhas de cima para baixo (no PDF o eixo Y cresce para cima)
      lines.sort((a, b) => b.y - a.y);

      // Calcula a margem esquerda base da página para preservar indentação inicial das linhas
      const allX = lines.flatMap((l) => l.items.map((it) => it.transform[4]));
      const baseLeftX = allX.length > 0 ? Math.min(...allX) : 0;

      let text = '';

      for (const line of lines) {
        // Ordena os itens dentro da linha pela coordenada horizontal X (item.transform[4])
        line.items.sort((a, b) => a.transform[4] - b.transform[4]);

        let lineText = '';
        let anteriorFimX: number | null = null;

        for (const item of line.items) {
          const atualX = item.transform[4];

          if (anteriorFimX === null) {
            const recuoInicialX = atualX - baseLeftX;
            if (recuoInicialX > 2.5) {
              const qtdEspacos = Math.round(recuoInicialX / 5);
              if (qtdEspacos > 0) {
                lineText += ' '.repeat(qtdEspacos);
              }
            }
          } else {
            const distanciaX = atualX - anteriorFimX;
            if (distanciaX > 1) {
              const qtdEspacos = Math.max(1, Math.round(distanciaX / 5));
              lineText += ' '.repeat(qtdEspacos);
            }
          }

          lineText += item.str;
          const larguraItem = item.width && item.width > 0 ? item.width : item.str.length * 5;
          anteriorFimX = atualX + larguraItem;
        }

        text += lineText + '\n';
      }

      return text;
    };

    const options = { data: buffer, verbosity: -1, pagerender };
    const parser = new PDFParse(options);
    await parser.load();

    const doc = (parser as any).doc;
    if (!doc) throw new Error("Não foi possível ler o documento PDF");

    let rawText = '';
    const numPages = doc.numPages;
    for (let i = 1; i <= numPages; i++) {
      const pageData = await doc.getPage(i);
      rawText += `\n--- PAGE ${i} ---\n`;
      rawText += await options.pagerender(pageData);
    }

    // We already built rawText in the loop above.

    // ── 4. Split by page markers ───────────────────────────────────────────
    let rawSongs: string[] = [];
    if (mergePages) {
      // Remove the page markers entirely to make it one seamless text
      rawSongs = [rawText.replace(/---\s*PAGE\s*\d+\s*---/gi, '\n').replace(/^\n+|\n+$/g, '')];
    } else {
      rawSongs = rawText
        .split(/---\s*PAGE\s*\d+\s*---/i)
        .map((block) => block.replace(/^\n+|\n+$/g, ''))
        .filter((block) => block.replace(/\s/g, '').length > 20); // Ignore tiny/empty fragments
    }

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
    if (extractedSongs.length === 0 && rawText.replace(/\s/g, '').length > 0) {
      const { referenceUrl, cleanedText } = extractReferenceUrl(rawText.replace(/^\n+|\n+$/g, ''));
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
