import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Extracts the title from a block of text.
 * Skips leading blank lines and returns the first meaningful line (≤ 60 chars).
 */
function extractTitle(block: string, fallback: string): string {
  const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const candidate = lines[0] ?? '';
  if (!candidate) return fallback;
  return candidate.length > 60 ? candidate.substring(0, 60) + '…' : candidate;
}

/**
 * Sanitizes raw text from a PDF:
 * - Removes stray $ and \ characters that corrupt chord names
 * - Normalises non-breaking spaces
 */
function sanitizeRaw(text: string): string {
  // Guard: coerce to string in case the PDF library returns an object/array
  const str = typeof text === 'string' ? text : String(text ?? '');
  return str
    .replace(/\$/g, '')
    .replace(/\\(#|b|[A-Za-z])/g, '$1')
    .replace(/\\/g, '')
    .replace(/[\u00A0\u202F\u2009]/g, ' ');
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Formato inválido. Apenas PDFs são aceitos.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // pdf-parse v2: buffer passado como opção `data` no construtor
    require('pdf-parse/worker');
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer, verbosity: -1 });
    await parser.load();

    // getText() retorna um objeto { pages: [{text, num}, ...], total, ... }
    // Usamos pageJoiner para separar páginas com nosso marcador customizado
    const textResult = await parser.getText({ pageJoiner: '\n--- PAGE {PAGE_NUM} ---\n' });

    let rawText: string;
    if (typeof textResult === 'string') {
      rawText = textResult;
    } else if (textResult && Array.isArray(textResult.pages)) {
      // Junta as páginas manualmente com o marcador de página
      rawText = textResult.pages
        .map((p: { text: string; num: number }) => `--- PAGE ${p.num} ---\n${p.text}`)
        .join('\n');
    } else {
      rawText = String(textResult ?? '');
    }

    const sanitized = sanitizeRaw(rawText);

    // ── Estratégia de split ──────────────────────────────────────────────────
    // 1ª tentativa: separar pelo marcador de página "--- PAGE X ---"
    //   (gerado por ferramentas que convertem PDF → texto)
    const PAGE_MARKER = /---\s*PAGE\s*\d+\s*---/gi;
    let blocks: string[] = [];

    if (PAGE_MARKER.test(sanitized)) {
      blocks = sanitized
        .split(/---\s*PAGE\s*\d+\s*---/gi)
        .map((b) => b.trim())
        .filter((b) => b.length > 20);
    }

    // 2ª tentativa: separar por 3+ quebras de linha consecutivas
    if (blocks.length === 0) {
      blocks = sanitized
        .split(/\n{3,}/)
        .map((b) => b.trim())
        .filter((b) => b.length > 20);
    }

    // Montar a lista de músicas extraídas
    const extractedSongs = blocks.map((block, index) => ({
      id: `temp-${Date.now()}-${index}`,
      title: extractTitle(block, `Música Extraída ${index + 1}`),
      content: block,
      part: 'ENTRADA' as const,
    }));

    // Fallback: se nenhum split funcionou, retorna o texto inteiro como uma única música
    if (extractedSongs.length === 0 && sanitized.length > 0) {
      extractedSongs.push({
        id: 'temp-unica',
        title: extractTitle(sanitized, 'Música Extraída'),
        content: sanitized,
        part: 'ENTRADA' as const,
      });
    }

    return NextResponse.json({ songs: extractedSongs });
  } catch (error) {
    console.error('Erro ao fazer parse do PDF:', error);
    return NextResponse.json(
      { error: 'Erro ao processar o arquivo PDF.' },
      { status: 500 }
    );
  }
}
