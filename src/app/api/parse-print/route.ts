import { NextResponse } from 'next/server';
import { sanitizePdfText, autoDetectKey } from '@/utils/chordTransposer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const VALID_LITURGICAL_PARTS = [
  'ENTRADA', 'PERDAO', 'GLORIA', 'SALMO', 'ACLAMACAO', 'OFERTORIO',
  'SANTO', 'RESPOSTAS_EUCARISTICAS', 'AMEM', 'CORDEIRO',
  'COMUNHAO', 'ACAO_DE_GRACAS', 'CANTO_FINAL', 'ESPECIAL',
] as const;

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-2.0-flash',
];

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Chave GEMINI_API_KEY não configurada no servidor. Verifique o arquivo .env.' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    // Gather all files from form data under 'files' or 'file'
    const filesList: File[] = [];
    const rawFiles = formData.getAll('files') as File[];
    const singleFiles = formData.getAll('file') as File[];
    for (const f of [...rawFiles, ...singleFiles]) {
      if (f && typeof f === 'object' && f.name) {
        filesList.push(f);
      }
    }

    if (filesList.length === 0) {
      return NextResponse.json({ error: 'Nenhum arquivo de imagem enviado.' }, { status: 400 });
    }

    const mergePages = formData.get('mergePages') === 'true';

    // Validate image types and size
    const imageParts: { inlineData: { mimeType: string; data: string } }[] = [];
    for (const file of filesList) {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json(
          { error: `O arquivo ${file.name} não é uma imagem válida. Envie apenas imagens (PNG, JPG, WEBP).` },
          { status: 400 }
        );
      }

      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: `A imagem ${file.name} excede o limite de 10MB.` },
          { status: 413 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const base64Data = buffer.toString('base64');
      imageParts.push({
        inlineData: {
          mimeType: file.type || 'image/jpeg',
          data: base64Data,
        },
      });
    }

    const systemPrompt = `Você é um especialista em transcrição e leitura óptica de cifras musicais para violão, teclado e canto.
Analise com atenção a(s) imagem(ns) enviada(s), que consistem em prints/capturas de tela ou fotos de cifras musicais.

Sua tarefa é extrair e transcrever as músicas com extrema fidelidade à estrutura harmônica e lírica.

Diretrizes detalhadas:
1. title: O título/nome da música. Se não estiver explícito na imagem, deduza pelo refrão ou início da canção.
2. artist: Nome do compositor, artista ou ministério (ex: Comunidade Shalom, Pe. Zezinho, etc.). Se não houver, use "Desconhecido".
3. key: O tom da música (ex: 'C', 'D', 'G', 'Em', 'F#m', etc.). Se estiver indicado no print (ex: "Tom: D"), use-o. Se não, deduza pela tonalidade da harmonia.
4. part: Sugira a parte litúrgica católica mais adequada se aplicável. Escolha OBRIGATORIAMENTE uma destas:
   ['ENTRADA', 'PERDAO', 'GLORIA', 'SALMO', 'ACLAMACAO', 'OFERTORIO', 'SANTO', 'RESPOSTAS_EUCARISTICAS', 'AMEM', 'CORDEIRO', 'COMUNHAO', 'ACAO_DE_GRACAS', 'CANTO_FINAL', 'ESPECIAL']. Se não for uma missa ou não souber, use 'ENTRADA'.
5. referenceUrl: Se houver link de YouTube ou site legível na imagem, extraia a URL. Caso contrário, deixe string vazia "".
6. content: A transcrição COMPLETA e ORGANIZADA da cifra com a letra.
   REGRAS CRÍTICAS PARA O CAMPO 'content':
   - Mantenha o formato padrão de cifra: linha de acordes acima, linha de letra abaixo.
   - PRESERVE EXATAMENTE O ESPAÇAMENTO MONOSPACE: utilize espaços em branco para que cada acorde fique exatamente acima da sílaba ou palavra onde o acorde deve ser tocado!
   - Se houver seções, rotule-as em linhas próprias entre colchetes, por exemplo: [Intro], [Primeira Parte], [Refrão], [Ponte], [Solo], [Final].
   - Se a imagem tiver duas colunas (comum em sites de cifra no desktop), leia a primeira coluna do início ao fim e depois a segunda coluna do início ao fim, formando uma sequência contínua.
   - Ignore diagramas visuais de acordes (desenhos de braço de violão) ou propagandas ao redor.
   - ${mergePages ? 'ATENÇÃO: Todas as imagens enviadas pertencem à MESMA música (junte as partes/páginas em um único campo content).' : 'Se cada imagem for uma música diferente, separe-as no array.'}

Retorne OBRIGATORIAMENTE um objeto JSON válido no seguinte formato:
{
  "songs": [
    {
      "title": "Título da Música",
      "artist": "Nome do Artista ou Desconhecido",
      "key": "G",
      "part": "ENTRADA",
      "referenceUrl": "",
      "content": "Intro: G D Em C\\n\\n[Primeira Parte]\\n  G           D\\nSenhor quem entrará\\n    Em        C\\nNo santuário pra te louvar"
    }
  ]
}`;

    let lastError = '';
    let responseData: any = null;

    // Try candidate Gemini models
    for (const model of GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: systemPrompt },
                  ...imageParts,
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }),
        });

        if (!res.ok) {
          const errBody = await res.text();
          lastError = `Modelo ${model} retornou ${res.status}: ${errBody}`;
          console.warn(`[parse-print] ${lastError}`);
          continue; // Try next model
        }

        const data = await res.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('');
        if (candidateText) {
          responseData = candidateText;
          break; // Success!
        }
      } catch (e: any) {
        lastError = e.message || String(e);
        console.warn(`[parse-print] Erro ao chamar ${model}:`, e);
      }
    }

    if (!responseData) {
      return NextResponse.json(
        { error: `Não foi possível processar a imagem com a IA. Detalhes: ${lastError || 'Nenhuma resposta retornada'}` },
        { status: 502 }
      );
    }

    // Clean and parse JSON
    let cleanedText = responseData.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (e) {
      console.error('[parse-print] Falha ao fazer parse do JSON do Gemini:', cleanedText);
      return NextResponse.json(
        { error: 'A IA respondeu em formato inválido. Tente novamente ou use uma imagem mais nítida.' },
        { status: 500 }
      );
    }

    const rawList = Array.isArray(parsed?.songs) ? parsed.songs : Array.isArray(parsed) ? parsed : [parsed];

    const extractedSongs = rawList.map((item: any, index: number) => {
      const title = (item.title || `Música ${index + 1}`).trim();
      const artist = (item.artist || 'Desconhecido').trim();
      const rawContent = item.content || '';
      const sanitizedContent = sanitizePdfText(rawContent);
      const detectedKey = item.key?.trim() || autoDetectKey(sanitizedContent) || 'C';
      const part = VALID_LITURGICAL_PARTS.includes(item.part) ? item.part : 'ENTRADA';
      const referenceUrl = (item.referenceUrl || '').trim();

      return {
        id: `print-${Date.now()}-${index}`,
        title,
        artist,
        content: sanitizedContent,
        part,
        key: detectedKey,
        referenceUrl,
      };
    });

    if (extractedSongs.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma música ou cifra foi identificada na imagem enviada.' },
        { status: 422 }
      );
    }

    return NextResponse.json({ songs: extractedSongs });
  } catch (error: any) {
    console.error('[parse-print] Erro geral:', error);
    return NextResponse.json(
      { error: error.message || 'Erro inesperado ao processar o print.' },
      { status: 500 }
    );
  }
}
