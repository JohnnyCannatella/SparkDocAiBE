// services/textExtractionServiceFirebase.js
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import logger from "../utils/logger.js";

function normalizeText(s = "") {
    return s.replace(/\s+/g, " ").trim();
}

function scoreTextQuality(textRaw = "") {
    const text = normalize(textRaw);
    const len = text.length;
    if (len === 0) return { weak: true, reason: "empty" };
    if (len < 300) return { weak: true, reason: "too_short" };

    const fffd = (text.match(/\uFFFD/g) || []).length;
    const alpha = (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
    const printable = (text.match(/[ -~À-ÖØ-öø-ÿ]/g) || []).length; // ASCII printable + latin-1

    const unique = new Set(text).size;
    const ratioFFFD = fffd / len;
    const ratioAlpha = alpha / len;
    const ratioPrintable = printable / len;
    const ratioUnique = unique / len;

    // “spazzatura” tipica: pochi alfabetici, tanti simboli, pochi caratteri distinti
    if (ratioPrintable < 0.80) return { weak: true, reason: "low_printable" };
    if (ratioAlpha < 0.35) return { weak: true, reason: "low_alpha" };
    if (ratioFFFD > 0.002) return { weak: true, reason: "bad_encoding" };
    if (ratioUnique < 0.18) return { weak: true, reason: "low_entropy" };

    // pattern di punteggiatura ripetuta
    if (/(?:[^\w\s]{3,}){3,}/.test(text)) return { weak: true, reason: "punctuation_noise" };

    return { weak: false, reason: "ok" };
}

async function extractWithPdfParse(buffer, options = {}) {
    const { maxPages } = options;
    try {
        const pdfParseOptions = {};
        if (maxPages > 0) {
            pdfParseOptions.max = maxPages;
        }

        const parsed = await pdfParse(buffer, pdfParseOptions);
        const text = normalizeText(parsed?.text || "");
        return {
            ok: text.length > 0,
            text,
            pages: parsed?.numpages ?? undefined,
            error: null,
        };
    } catch (err) {
        return { ok: false, text: "", pages: undefined, error: err };
    }
}

/**
 * Preferisci pdf-parse. Se pdf-parse fallisce o produce testo vuoto,
 * restituisci un errore. Nessun uso di pdf2pic/gm.
 */
export async function extractTextPreferPdfParseThenDocAI(buffer) {
    const maxPagesToProcess = 4;
    const options = { maxPages: maxPagesToProcess };

    const p = await extractWithPdfParse(buffer, options);
    if (p.ok && p.text.length > 0) {
        return { text: p.text, extraction: { method: "pdf-parse", pages: p.pages } };
    }

    const reason = p.error?.message || "pdf-parse empty";
    logger.warn("[extractTextPreferPdfParseThenDocAI] pdf-parse fallito, nessun fallback", { reason });
    throw new Error(`OCR failed (pdf-parse). Reason: ${reason}`);
}
