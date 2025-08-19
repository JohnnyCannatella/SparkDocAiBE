import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import logger from "../utils/logger.js";
import { execFile } from "child_process";

// Funzione principale: genera contratti per ogni doc
export async function generateContracts(req, res) {
    try {
        logger.info("[generateContracts] Inizio creazione contratti");

        const { templateId } = req.body; // da frontend
        const docsData = req.body.docsData; // array di estratti JSON
        const templateFile = req.file;
        if (!templateFile) throw new Error("Template non fornito");

        const ext = path.extname(templateFile.originalname).toLowerCase();
        const contracts = [];

        for (const doc of docsData) {
            let buffer;
            if (ext === ".docx") {
                const docxBuf = await generateDocx(templateFile.buffer, doc.data);
                // Se vuoi anche il PDF:
                const pdfBuf = await convertDocxToPdf(docxBuf);
                contracts.push({
                    fileName: `${doc.fileName || doc.id}-${templateFile.originalname.replace('.docx', '.pdf')}`,
                    fileBuffer: pdfBuf
                });
            } else if (ext === ".pdf") {
                buffer = await generatePdf(templateFile.buffer, doc.data);
            } else {
                throw new Error(`Formato template non supportato: ${ext}`);
            }
            contracts.push({ fileName: `${doc.fileName || doc.id}-${templateFile.originalname}`, fileBuffer: buffer });
        }

        logger.info("[generateContracts] Contratti generati con successo");
        res.setHeader("Content-Type", "application/json");
        res.status(200).json({ ok: true, contracts });
    } catch (err) {
        logger.error(`[generateContracts] Errore: ${err.message}`, { stack: err.stack });
        res.status(500).json({ error: "Errore nella generazione dei contratti: " + err.message });
    }
}

async function generateDocx(templateBuffer, data) {
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{{", end: "}}" },
    });
    doc.render(data);
    const buf = doc.getZip().generate({ type: "nodebuffer" });
    return buf;
}

async function generatePdf(templateBuffer, data) {
    const pdfDoc = await PDFDocument.load(templateBuffer);
    const form = pdfDoc.getForm();

    // Itera sui dati e compila i campi del modulo corrispondenti
    for (const key in data) {
        if (data.hasOwnProperty(key)) {
            try {
                // Cerca un campo di testo con il nome corrispondente alla chiave
                const field = form.getTextField(key);
                // Imposta il valore del campo
                field.setText(String(data[key] || ""));
            } catch (err) {
                // Se un campo non viene trovato, logga un avviso ma non bloccare il processo
                logger.warn(`[generatePdf] Campo modulo non trovato nel PDF per il tag "${key}". Sarà ignorato.`);
            }
        }
    }

    // Rende i campi non più modificabili (opzionale, ma consigliato)
    form.flatten();

    return await pdfDoc.save();
}

async function convertDocxToPdf(bufferDocx, outputDir = "/tmp") {
    const tempDocx = path.join(outputDir, `tmp_${Date.now()}.docx`);
    const outputPdf = tempDocx.replace(/\.docx$/, ".pdf");
    await fs.writeFile(tempDocx, bufferDocx);
    await new Promise((resolve, reject) => {
        execFile("libreoffice", [
            "--headless",
            "--convert-to", "pdf",
            "--outdir", outputDir,
            tempDocx
        ], (err) => (err ? reject(err) : resolve()));
    });
    const pdfBuffer = await fs.readFile(outputPdf);
    await fs.unlink(tempDocx);
    await fs.unlink(outputPdf);
    return pdfBuffer;
}
