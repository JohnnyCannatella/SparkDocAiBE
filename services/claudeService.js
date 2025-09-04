// services/claudeService.js
import Anthropic from "@anthropic-ai/sdk";
import logger from "../utils/logger.js";
import {extractTextPreferPdfParseThenDocAI} from "./textExtractionServiceFirebase.js";

/**
 * Funzione per estrarre il testo da un buffer PDF.
 * @param {Buffer} buffer - Il buffer del PDF da analizzare.
 * @returns {Promise<string>} - Il testo estratto dal PDF.
 */
let anthropicSingleton = null;

function getAnthropic() {
    const apiKey = process.env.ANTHROPIC_KEY;
    if (!apiKey) {
        throw new Error("Missing Anthropic API key (ANTHROPIC_API_KEY/ANTHROPIC_KEY)");
    }
    if (!anthropicSingleton) {
        anthropicSingleton = new Anthropic({ apiKey });
    }
    return anthropicSingleton;
}

/**
 * Costruisce il contenuto USER con il testo del documento.
 * @param {string} text - Testo del PDF estratto.
 * @returns {string}
 */
function buildClaudeUserContent(text) {
    return `INPUT (testo OCR/PDF del documento):
"""
${text}
"""`;
}

/**
 * Effettua una chiamata a Claude per l'estrazione dei dati.
 * @param {string} text - Il testo estratto dal PDF.
 * @param systemPrompt
 * @returns {Promise<any>} - I dati estratti da Claude in formato JSON.
 */
async function queryClaude(text, systemPrompt) {
    logger.info("[queryClaude] Avvio richiesta a Claude");
    const user = buildClaudeUserContent(text);
    const anthropic = getAnthropic();

    try {
        const startTime = Date.now();

        const response = await anthropic.messages.create({
            //model: "claude-3-5-sonnet-20240620",
            model: "claude-3-5-haiku-20241022",
            temperature: 0,
            top_p: 1,
            max_tokens: 1200,
            system: systemPrompt,
            messages: [{ role: "user", content: user }],
        });

        const duration = Date.now() - startTime;
        logger.info("[queryClaude] Risposta ricevuta in", duration, "ms");

        const raw = response?.content?.[0]?.text ?? "";

        try {
            const json = JSON.parse(raw);
            logger.info("[queryClaude] Risposta JSON ricevuta con successo: " + JSON.stringify(json));
            return json;
        } catch (parseError) {
            logger.warn("[queryClaude] JSON malformato, tentativo di riparazione");
            const cleaned = raw.trim()
                .replace(/^```json\s*/i, "")
                .replace(/^```\s*/i, "")
                .replace(/```$/, "")
                .trim();
            return JSON.parse(cleaned);
        }
    } catch (error) {
        logger.error("[queryClaude] Errore durante la chiamata a Claude:", { message: error.message, stack: error.stack });
        throw error;
    }
}

/**
 * Estrattore dei dati principali da un buffer PDF usando Claude.
 * @param {Buffer} buffer - Il buffer del PDF.
 * @param systemPrompt
 * @returns {Promise<any>} - I dati estratti in formato JSON.
 */
export async function extractDataWithClaudeFromBuffer(buffer, systemPrompt) {
    const { text, extraction } = await extractTextPreferPdfParseThenDocAI(buffer);
    if (!text || text.trim().length === 0) {
        logger.warn("[extractDataWithClaudeFromBuffer] Testo PDF vuoto, non eseguo Claude");
        throw new Error("Il testo estratto dal PDF è vuoto.");
    }
    logger.info("[extractDataWithClaudeFromBuffer] Avvio analisi tramite Claude", {
        method: extraction?.method,
        pages: extraction?.pages,
        textLen: text.length
    });
    let rawJson;
    try {
        rawJson = await queryClaude(text, systemPrompt); // usa 'text', non 'pdfText'
    } catch (err) {
        logger.error("[extractDataWithClaudeFromBuffer] Errore chiamata Claude", { message: err.message });
        throw new Error(`Analisi LLM fallita: ${err.message}`);
    }
    let clean = normalizeAndSanitize(robustJsonParse(rawJson));
    return {
        ...clean
    };
}

function robustJsonParse(maybeJson) {
    if (!maybeJson) return {};
    if (typeof maybeJson === "object") return maybeJson;
    const s = String(maybeJson).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try { return JSON.parse(s); } catch {
        const m = s.match(/\{[\s\S]*\}$/);
        if (m) { try { return JSON.parse(m[0]); } catch {} }
        return { raw: s };
    }
}

function isLikelyExampleValue(k, v) {
    if (!v || typeof v !== "string") return false;
    const s = v.trim().toUpperCase();

    // Nomi/cognomi placeholder comuni
    const commonNames = ["MARIO", "ROSSI", "GIUSEPPE", "BIANCHI", "LOREM", "IPSUM"];
    if ((k === "Nome" || k === "Cognome") && commonNames.includes(s)) return true;

    // IBAN generici o non validi (pattern troppo corto/lungo o con X ripetute)
    if (k === "Codice_IBAN" && /X{4,}/i.test(v)) return true;

    // CAP non a 5 cifre
    if ((k === "CAP" || k === "CAP_3") && !/^\d{5}$/.test(v)) return true;

    // CF non 16 alfanumerici
    if (k === "Codice_Fiscale" && !/^[A-Z0-9]{16}$/.test(s)) return true;

    // Date non formattate o placeholder
    if (["Data","Data_emissione","Data_scadenza","Data_nascita"].includes(k) && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; // non marca come esempio, solo no-op

    return false;
}

function normalizeAndSanitize(obj) {
    const out = { ...obj };
    // Svuota valori “di esempio”
    for (const k of Object.keys(out)) {
        const v = out[k];
        if (isLikelyExampleValue(k, v)) out[k] = "";
        // Forza stringhe
        if (v == null) out[k] = "";
        else if (typeof v !== "string") out[k] = String(v);
    }
    return out;
}