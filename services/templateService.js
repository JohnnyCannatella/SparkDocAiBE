export async function applyToTemplate(extractedData, templateString) {
    if (!templateString) {
        return extractedData; // Se non c'è template, ritorna i dati grezzi
    }

    let filledTemplate = templateString;
    for (const key in extractedData) {
        const regex = new RegExp(`{{${key}}}`, "g");
        filledTemplate = filledTemplate.replace(regex, extractedData[key] || "");
    }

    return filledTemplate;
}