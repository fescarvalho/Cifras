import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { autoDetectKey } from "@/utils/chordTransposer";

const SUPPORTED_HOSTS = [
  "cifraclub.com.br",
  "www.cifraclub.com.br",
  "m.cifraclub.com.br",
  "cifraclub.com",
  "www.cifraclub.com",
];

function isSupportedUrl(rawUrl: string): { valid: boolean; parsed?: URL; error?: string } {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "O link deve começar com http:// ou https://." };
    }
    const hostname = parsed.hostname.toLowerCase();
    const isSupported = SUPPORTED_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    );
    if (!isSupported) {
      return {
        valid: false,
        error: "URL não suportado. Por favor, insira um link válido do CifraClub (cifraclub.com.br).",
      };
    }
    return { valid: true, parsed };
  } catch {
    return { valid: false, error: "Formato de URL inválido. Verifique o link colado." };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";

    if (!rawUrl) {
      return NextResponse.json(
        { error: "Informe o URL da cifra para importar." },
        { status: 400 }
      );
    }

    const validation = isSupportedUrl(rawUrl);
    if (!validation.valid || !validation.parsed) {
      return NextResponse.json(
        { error: validation.error || "URL inválido." },
        { status: 400 }
      );
    }

    const targetUrl = validation.parsed.toString();

    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Não foi possível acessar a página da cifra (Status ${response.status}). Verifique se o link existe.`,
        },
        { status: 502 }
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract cipher text preserving exact spaces and line breaks (\n)
    let rawCifra = "";
    const cifraPre = $(".cifra_cnt pre, .cifra-cnt pre, div.cifra pre, pre").first();

    if (cifraPre.length > 0) {
      const clonedPre = cifraPre.clone();
      // Remove ASCII guitar tablature blocks on CifraClub
      clonedPre.find(".tablatura, .tabs, span.tab").remove();
      rawCifra = clonedPre.text();
    }

    // Strip invisible zero-width spaces (\u200B) injected by CifraClub on every line,
    // normalize CRLF -> LF, and remove orphan tab headers like "[Tab - Intro]" or "Parte 1 de 2"
    const content = rawCifra
      .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        if (/^\[Tab\s*[-–—:]/i.test(t) || /^\[Tab\]$/i.test(t)) return false;
        if (/^Parte\s+\d+\s+de\s+\d+$/i.test(t)) return false;
        return true;
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!content || !content.trim()) {
      return NextResponse.json(
        {
          error:
            "Não encontramos o bloco da cifra nesta página. Certifique-se de colar o link direto de uma música do CifraClub.",
        },
        { status: 422 }
      );
    }

    // Extract metadata (Title, Artist, Key)
    let title =
      $("h1.t1").first().text().trim() ||
      $("h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.split(" - ")[0]?.trim() ||
      "Música Importada";

    let artist =
      $("h2.t3 a").first().text().trim() ||
      $("h2.t3").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.split(" - ")[1]?.replace(/\s*\(cifra\).*$/i, "")?.trim() ||
      "Desconhecido";

    const pageKey =
      $("#cifra_tom a").first().text().trim() ||
      $(".cifra_tom a").first().text().trim() ||
      "";

    const detectedKey =
      pageKey && /^[A-G][#b]?m?$/.test(pageKey)
        ? pageKey
        : autoDetectKey(content) || "C";

    return NextResponse.json({
      title,
      artist,
      key: detectedKey,
      content,
      sourceUrl: targetUrl,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erro inesperado ao importar cifra pelo link.";
    return NextResponse.json(
      { error: `Falha ao importar link: ${message}` },
      { status: 500 }
    );
  }
}

