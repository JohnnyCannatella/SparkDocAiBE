import { extractTagsFromFile } from "../services/templateService.js";
import logger from "../utils/logger.js";

export async function parseTemplate(req, res) {
    try {
        logger.info("[parseTemplate] Inizio parsing template");

        if (!req.file) {
            logger.warn("[parseTemplate] Nessun file caricato");
            throw new Error("Nessun file caricato");
        }

        const { originalname, mimetype, buffer } = req.file;

        // Estrae i tag dal file (TXT, PDF o DOCX)
        const tags = await extractTagsFromFile(buffer, mimetype, originalname);

        logger.info("[parseTemplate] Parsing completato con successo", { tags });
        return res.status(200).json({ ok: true, tags });
    } catch (err) {
        logger.error(`[parseTemplate] Errore: ${err.message}`, { stack: err.stack });
        return res.status(500).json({ error: `Errore durante il parsing: ${err.message}` });
    }
}