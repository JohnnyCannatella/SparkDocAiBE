
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { PDFDocument } from "pdf-lib";

import mammoth from "mammoth";

function extractTagsFromText(text) {
    const regex = /{{(.*?)}}/g;
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        matches.push(match[1].trim());
    }
    return [...new Set(matches)];
}

export async function extractTagsFromFile(buffer, mimetype, filename) {
    let text = "";
    let formFieldTags = [];

    if (mimetype === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
        const data = await pdfParse(buffer);
        text = data.text;
        try {
            const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
            const form = pdfDoc.getForm();
            formFieldTags = form.getFields().map((field) => field.getName());
        } catch (e) {
            console.warn("Could not parse PDF form fields. It will proceed with text-based tags only.", e);
        }

    } else if (
        mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        filename.toLowerCase().endsWith(".docx")
    ) {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
    } else {
        throw new Error(`Formato non supportato: ${mimetype || filename}`);
    }
    const textTags = extractTagsFromText(text);

    return [...new Set([...textTags, ...formFieldTags])];
}