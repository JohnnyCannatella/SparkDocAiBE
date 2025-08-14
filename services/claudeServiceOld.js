// services/claudeService.js
import Anthropic from "@anthropic-ai/sdk";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import logger from "../utils/logger.js";
import config from "../config/env.js";

// Configura l'istanza di Anthropic
const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_KEY });

/**
 * Funzione per estrarre il testo da un buffer PDF.
 * @param {Buffer} buffer - Il buffer del PDF da analizzare.
 * @returns {Promise<string>} - Il testo estratto dal PDF.
 */
export async function extractTextFromPdfBuffer(buffer) {
    if (!buffer) {
        logger.warn("[extractTextFromPdfBuffer] Nessun buffer fornito");
        throw new Error("PDF buffer mancante");
    }

    try {
        logger.info("[extractTextFromPdfBuffer] Avvio parsing PDF");
        const { text } = await pdfParse(buffer);
        logger.info("[extractTextFromPdfBuffer] Parsing completato, lunghezza testo:", text.length);
        return text || "";
    } catch (err) {
        logger.error("[extractTextFromPdfBuffer] Errore durante parsing PDF:", { message: err.message, stack: err.stack });
        throw err;
    }
}

/**
 * Costruisce il prompt necessario per la query su Claude.
 * @param {string} text - Il testo del PDF estratto.
 * @param {string} fields - I campi richiesti nella risposta JSON di Claude.
 * @returns {string} - Il prompt formattato.
 */
function buildClaudePrompt(text, fields) {
    return ` Sei un assistente esperto nell'estrazione dati da contratti e fatture energetiche. Rispondi SOLO con JSON valido.
            Ecco il testo estratto dal documento:
            """
            ${text}
            """
            Estrarre i seguenti campi:
            ${fields}
            `;
}

/**
 * Effettua una chiamata a Claude per l'estrazione dei dati.
 * @param {string} text - Il testo estratto dal PDF.
 * @param {string} fields - I campi richiesti in formato JSON.
 * @returns {Promise<any>} - I dati estratti da Claude in formato JSON.
 */
async function queryClaude(text, fields) {
    const prompt = buildClaudePrompt(text, fields);
    logger.info("[queryClaude] Invio richiesta a Claude con prompt di", prompt.length, "caratteri");

    try {
        const startTime = Date.now();

        const response = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 1024,
            temperature: 0,
            messages: [{ role: "user", content: prompt }]
        });

        const duration = Date.now() - startTime;
        logger.info("[queryClaude] Risposta ricevuta in", duration, "ms");

        const raw = response?.content?.[0]?.text ?? "";
        try {
            let json = JSON.parse(raw)
            logger.info("[queryClaude] Risposta JSON ricevuta:", { json });
            return json;
        } catch (parseError) {
            logger.warn("[queryClaude] JSON malformato, tentativo di riparazione");
            const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
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
 * @returns {Promise<any>} - I dati estratti in formato JSON.
 */
export async function extractDataWithClaudeFromBuffer(buffer) {
    if (!buffer) {
        logger.warn("[extractDataWithClaudeFromBuffer] Nessun buffer fornito");
        throw new Error("PDF buffer mancante");
    }

    try {
        // Estrai il testo dal PDF
        logger.info("[extractDataWithClaudeFromBuffer] Avvio estrazione testo dal buffer");
        const pdfText = await extractTextFromPdfBuffer(buffer);

        // Campi richiesti da estrarre
        const fields = `
{
  "Nome": "", "Cognome": "", "Indirizzo_residenza": "", "CAP": "", "Comune": "",
  "Provincia": "", "Codice_Fiscale": "", "Data_nascita": "", "Numero_documento": "",
  "Data_emissione": "", "Data_scadenza": "", "Cellulare": "", "Telefono_fisso_altro": "",
  "Email": "", "Codice_IBAN": "", "Indirizzo_fornitura": "", "Civico_3": "", "CAP_3": "",
  "Comune_3": "", "Provincia_3": "", "Tensione_V": "", "Potenza_impegnata_kW": "",
  "Potenza_disponibile_kW": "", "Consumo_annuo_kWh": "", "Distributore": "",
  "Codice_REMI": "", "Consumo_annuo_Smc": "", "Distributore_2": "", "Data": ""
}
`;

        // Chiama Claude per estrarre dati dal testo
        logger.info("[extractDataWithClaudeFromBuffer] Avvio analisi tramite Claude");
        return await queryClaude(pdfText, fields);
    } catch (error) {
        logger.error("[extractDataWithClaudeFromBuffer] Errore durante estrazione dati:", { message: error.message, stack: error.stack });
        throw error;
    }
}