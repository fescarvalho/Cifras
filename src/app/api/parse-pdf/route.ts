import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Formato inválido. Apenas PDFs são aceitos.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Usa a biblioteca para extrair o texto
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;
    const pdfData = await pdfParse(buffer);
    const rawText = pdfData.text;

    // Heurística básica de separação:
    // Dividir por 3 ou mais quebras de linha que geralmente separam músicas em PDFs formatados.
    // Pode não ser perfeito, mas a interface de revisão permite que o usuário edite depois.
    const blocks = rawText.split(/\n{3,}/).map((b: string) => b.trim()).filter((b: string) => b.length > 20);
    
    const extractedSongs = blocks.map((block: string, index: number) => {
        // Tentar adivinhar o título pegando a primeira linha útil
        const lines = block.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        let title = lines[0] || `Música Extraída ${index + 1}`;
        
        // Se o título for muito longo, provavelmente não é um título, mas truncamos.
        if (title.length > 50) {
            title = title.substring(0, 50) + "...";
        }

        return {
            id: `temp-${Date.now()}-${index}`, // ID temporário para o React renderizar chaves únicas
            title,
            content: block,
            part: 'ENTRADA' // Valor padrão, o usuário vai alterar na revisão
        }
    });

    // Se a heurística falhar e retornar tudo como um bloco só, retornamos apenas aquele.
    if (extractedSongs.length === 0 && rawText.length > 0) {
        extractedSongs.push({
             id: `temp-unica`,
             title: 'Música Única Extraída',
             content: rawText,
             part: 'ENTRADA'
        });
    }

    return NextResponse.json({ songs: extractedSongs });

  } catch (error) {
    console.error("Erro ao fazer parse do PDF:", error);
    return NextResponse.json({ error: 'Erro ao processar o arquivo PDF.' }, { status: 500 });
  }
}
