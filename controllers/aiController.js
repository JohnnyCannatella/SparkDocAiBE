// controllers/aiController.js
import { extractDataWithClaudeFromBuffer } from "../services/claudeService.js";
import logger from "../utils/logger.js"; // Importa il logger personalizzato

export async function processSingleDocument(req, res) {
    try {
        logger.info("[processSingleDocument] Inizio elaborazione singolo documento");
        if (!req.file) {
            logger.warn("[processSingleDocument] Nessun file caricato");
            throw new Error("Nessun file caricato");
        }

        // Estrai il systemPrompt dal corpo della richiesta
        const { systemPrompt } = req.body;
        if (!systemPrompt) {
            logger.warn("[processSingleDocument] Prompt di sistema mancante o vuoto nella richiesta.");
            throw new Error("Prompt di sistema mancante o vuoto. Impossibile procedere.");
        }
        if (systemPrompt) {
            logger.info("[processSingleDocument] Ricevuto prompt di sistema personalizzato.");
        }

        const isPdf =
            req.file.mimetype === "application/pdf" ||
            req.file.originalname?.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
            const errorMessage = `Tipo file non supportato: ${req.file.mimetype || req.file.originalname}`;
            logger.warn(`[processSingleDocument] ${errorMessage}`);
            throw new Error(errorMessage);
        }
        logger.info("[processSingleDocument] Estr. in corso....");
        const result = await extractDataWithClaudeFromBuffer(req.file.buffer, systemPrompt);
        logger.info("[processSingleDocument] Documento processato con successo", { extraction: result?.extraction });
        return res.status(200).json({ ok: true, result });
    } catch (err) {
        logger.error(`[processSingleDocument] Errore: ${err.message}`, { stack: err.stack });
        return res.status(500).json({ error: `Errore durante l'elaborazione: ${err.message}` });
    }
}