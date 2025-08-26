import path from "path";
import { PDFDocument } from "pdf-lib";
import logger from "../utils/logger.js";
import archiver from "archiver";

// Funzione principale: genera contratti per ogni doc
export async function generateContracts(req, res) {
    try {
        logger.info("[generateContracts] Inizio creazione contratti ZIP");

        let { docsData } = req.body; // Potrebbe essere una stringa JSON
        const templateFile = req.file;

        // Se i dati arrivano come stringa JSON (comune con multipart/form-data), li parsiamo
        if (docsData && typeof docsData === "string") {
            try {
                docsData = JSON.parse(docsData);
                logger.info(`[generateContracts] Dati dei documenti JSON parsi correttamente (length: ${docsData.length})`);
            } catch (e) {
                logger.error(`[generateContracts] Errore nel parsing di docsData: ${e.message}`);
                return res.status(400).json({ error: "Il campo docsData non è un JSON valido." });
            }
        }

        if (!templateFile) {
            return res.status(400).json({ error: "Template non fornito" });
        }
        if (!docsData || !Array.isArray(docsData)) {
            return res.status(400).json({ error: "Dati dei documenti non forniti o in formato non valido" });
        }

        const ext = path.extname(templateFile.originalname).toLowerCase();
        if (ext !== ".pdf") {
            return res.status(400).json({ error: `Formato template non supportato: ${ext}. È accettato solo il formato PDF.` });
        }

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", 'attachment; filename="contratti.zip"');

        const archive = archiver("zip", {
            zlib: { level: 9 }, // Imposta il livello di compressione
        });

        archive.on("warning", (err) => {
            if (err.code === "ENOENT") logger.warn(err);
            else throw err;
        });
        archive.on("error", (err) => {
            throw err;
        });

        // Collega lo stream dell'archivio alla risposta HTTP
        archive.pipe(res);

        await Promise.all(
            docsData.map(async (doc) => {
                const buffer = await generatePdf(templateFile.buffer, doc.data);
                const fileName = `${doc.fileName || doc.id}-${templateFile.originalname}`;
                archive.append(buffer, { name: fileName });
                logger.info(`[generateContracts] Aggiunto al ZIP: ${fileName}`);
            })
        );

        await archive.finalize();

        logger.info("[generateContracts] Archivio ZIP creato e inviato con successo.");

    } catch (err) {
        logger.error(`[generateContracts] Errore: ${err.message}`, { stack: err.stack });
        if (!res.headersSent) {
            res.status(500).json({ error: "Errore nella generazione dei contratti: " + err.message });
        }
    }
}

async function generatePdf(templateBuffer, data) {
    const pdfDoc = await PDFDocument.load(templateBuffer);
    const form = pdfDoc.getForm();
    logger.info(`Form fields: ${form.getFields().map(field => field.getName()).join(", ")}`);

    // Itera sui dati e compila i campi del modulo corrispondenti
    for (const key in data) {
        if (data.hasOwnProperty(key)) {
            try {
                // Cerca un campo di testo con il nome corrispondente alla chiave
                const field = form.getTextField(key);
                // Imposta il valore del campo
                field.setText(String(data[key] || ""));
                logger.info(`[generatePdf] Campo modulo trovato nel PDF per il tag "${key}". Preso.`);
            } catch (err) {
                // Se un campo non viene trovato, logga un avviso ma non bloccare il processo
                logger.warn(`[generatePdf] Campo modulo non trovato nel PDF per il tag "${key}". Sarà ignorato.`);
            }
        }
    }

    // Rende i campi non più modificabili (opzionale, ma consigliato)
    //form.flatten();

    // Salva il PDF come Uint8Array
    const pdfBytes = await pdfDoc.save();

    // Converti l'Uint8Array in un Buffer, che è ciò che archiver si aspetta
    return Buffer.from(pdfBytes);

}
