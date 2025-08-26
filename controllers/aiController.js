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
        logger.info("[processSingleDocument] Estr. smart (pdf-parse -> Document AI fallback)");
        const result = await extractDataWithClaudeFromBuffer(req.file.buffer, systemPrompt);
        logger.info("[processSingleDocument] OK", { extraction: result?.extraction });
        return res.status(200).json({ ok: true, result });
    } catch (err) {
        logger.error(`[processSingleDocument] Errore: ${err.message}`, { stack: err.stack });
        return res.status(500).json({ error: `Errore durante l'elaborazione: ${err.message}` });
    }
}

export async function processDocuments(req, res) {
    try {
        logger.info("[processDocuments] Inizio elaborazione multipla di documenti");

        const files = req.files || [];
        if (!files.length) {
            logger.warn("[processDocuments] Nessun file caricato");
            throw new Error("Nessun file caricato");
        }

        const results = [];
        for (const f of files) {
            const isPdf =
                f.mimetype === "application/pdf" ||
                f.originalname?.toLowerCase().endsWith(".pdf");
            if (!isPdf) {
                const errorMessage = `Tipo file non supportato: ${f.originalname}`;
                logger.warn(`[processDocuments] ${errorMessage}`);
                results.push({ file: f.originalname, error: "Tipo file non supportato" });
                continue;
            }

            logger.info(`[processDocuments] Avvio estrazione dati per file: ${f.originalname}`);
            try {
                const r = await extractDataWithClaudeFromBuffer(f.buffer);
                results.push({ file: f.originalname, result: r });
                logger.info(`[processDocuments] Elaborazione completata per file: ${f.originalname}`);
            } catch (extractionError) {
                logger.error(`[processDocuments] Errore nel file ${f.originalname}: ${extractionError.message}`);
                results.push({ file: f.originalname, error: extractionError.message });
            }
        }

        logger.info("[processDocuments] Elaborazione multipla completata");
        return res.status(200).json({ ok: true, results });
    } catch (err) {
        logger.error(`[processDocuments] Errore: ${err.message}`, { stack: err.stack });
        return res.status(500).json({ error: `Errore durante l'elaborazione: ${err.message}` });
    }
}