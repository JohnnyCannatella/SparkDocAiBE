// services/claudeService.js
import Anthropic from "@anthropic-ai/sdk";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
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
 * Prompt SYSTEM robusto per l'estrazione da bollette/contratti energia (IT).
 * Restituire SOLO JSON valido. Gestisce documenti completi o parziali.
 */
/*function buildClaudeSystemPrompt() {
    return `
Sei un estrattore dati esperto di bollette/contratti di energia elettrica e gas in Italia.
Il tuo compito è estrarre, normalizzare e restituire SOLO un JSON valido con le chiavi richieste qui sotto.
Non aggiungere testo esterno, spiegazioni, commenti, prefissi/suffissi o code-fence.
Non inventare valori: se un’informazione non è presente o non è attribuibile al cliente, restituisci una stringa vuota "".

REGOLE GENERALI DI OUTPUT
- Formato: restituisci UN UNICO oggetto JSON, esattamente con le chiavi e l’ordine indicati in "SCHEMA DI OUTPUT".
- Tipi: tutti i valori sono SEMPRE stringhe (anche per numeri/IBAN).
- Mancanze: se il dato non è presente o non è del cliente (es. numeri verdi/IBAN del venditore), usa "".
- Normalizzazione:
  - Date: formato YYYY-MM-DD (accetta input tipo dd/mm/yyyy, dd.mm.yyyy).
  - CAP: 5 cifre, come stringa (es. "20015").
  - Provincia: sigla a 2 lettere maiuscole (es. "MI").
  - Comune: capitalizza correttamente (es. "Parabiago").
  - Codice_Fiscale: 16 caratteri alfanumerici maiuscoli (se presente).
  - Codice_IBAN: tutto maiuscolo, senza spazi.
  - Indirizzi: separa via e civico quando possibile. Esempio: "VIA SEBASTIANO CABOTO 14 20015 PARABIAGO (MI)" →
    - Indirizzo_fornitura: "VIA SEBASTIANO CABOTO"
    - Civico_3: "14"
    - CAP_3: "20015"
    - Comune_3: "Parabiago"
    - Provincia_3: "MI"
  - Numeri: rimuovi unità e simboli (€, kW, V, Smc, kWh). Usa il punto come separatore decimale (es. "2.760,8" → "2760.8").
- Commodity-specifici:
  - Gas: compila Consumo_annuo_Smc, Distributore (dal riquadro “Pronto Intervento”/“Distributore”), Codice_REMI, indirizzo fornitura; lascia vuoti i campi elettricità (Tensione_V, Potenze, Consumo_annuo_kWh).
  - Elettricità: compila Tensione_V, Potenza_impegnata_kW, Potenza_disponibile_kW, Consumo_annuo_kWh; lascia vuoti i campi gas (REMI/Smc).
- Contatti/IBAN del cliente:
  - Compila Cellulare, Telefono_fisso_altro, Email SOLO se chiaramente riferiti al cliente (es. “Telefono cliente”, “Email cliente”).
  - Ignora numeri verdi, WhatsApp ed email del venditore/assistenza.
  - Compila Codice_IBAN SOLO se è l’IBAN di domiciliazione del cliente. Se è IBAN del venditore per bonifico, lascia "".
- Campi simili: criteri di priorità
  - Numero_documento: priorità a “Numero fattura elettronica valida ai fini fiscali”, poi “Fattura n°”, poi “N. fattura”.
  - Data_emissione: la data accanto al numero documento (etichette: “del”, “emessa il”).
  - Data_scadenza: etichette “Entro il”, “Termine di pagamento”, “Scadenza”.
  - Data: copia il valore di Data_emissione; se assente, usa la prima data più rilevante in testata; altrimenti "".

SEZIONI ED ETICHETTE TIPICHE DA CERCARE (ESEMPI REALI)
- Testata/documento:
  - “Numero fattura elettronica valida ai fini fiscali: 20251200617622 del 09/07/2025”
  - “N. fattura elettronica valida ai fini fiscali 202530933282 del 16.05.2025”
  - “Fattura n° 2025/2403912 del 16/07/2025”
  - “Termine di pagamento: 07/08/2025”, “Entro il 29/07/2025”
- Dati fornitura gas:
  - “INDIRIZZO FORNITURA: VIA … 20015 PARABIAGO MI”
  - “FORNIAMO GAS IN VIA CARSO 22 20015 Parabiago MI”
  - “Le stiamo fornendo gas in VIA … 20015 PARABIAGO (MI)”
  - “PDR …”, “CODICE REMI 34405900”
  - “Pronto intervento AEMME LINEA DISTRIBUZIONE SRL …”
  - “Consumo annuo … Smc”, “Consumo annuo aggiornato (Smc): …”
- Dati elettricità (se presenti):
  - “POD …”, “Tensione … V”, “Potenza impegnata … kW”, “Potenza disponibile … kW”, “Consumo annuo … kWh”
- Contatti venditore (DA NON usare come recapiti cliente):
  - “SERVIZIO CLIENTI …”, “Numero Verde …”, “WhatsApp …”, email tipo “reclami@…”, “clienti@…”
- IBAN (attenzione):
  - IBAN del venditore per bonifici (es. “IBAN IT90Q0100501400000000013019”, “IBAN IT80Z0503410500000000020337”) → NON è Codice_IBAN del cliente.

SINONIMI/PATTERN PER L’ESTRAZIONE
- Nome/Cognome: spesso in testata, anche in forma “COGNOME NOME” tutto maiuscolo.
  - Se appare “PARINI FERRUCCIO” o “COZZI AMBROGIO”, separa: primo token Cognome, resto Nome.
- Indirizzo_residenza: se compaiono due indirizzi e uno è marcato come “fornitura”, l’altro (non marcato) è la residenza. Se esiste solo indirizzo fornitura, lascia i campi residenza vuoti.
- Indirizzo_fornitura + civico/CAP/comune/provincia: da riquadri “INDIRIZZO FORNITURA”, “FORNIAMO GAS IN”, “Le stiamo fornendo gas in…”. Provincia può essere “(MI)” o “MI”.

PROCEDURA (APPLICARE IN SEQUENZA)
1) Rileva la commodity:
   - Se compaiono “PDR” o “REMI” → Gas.
   - Se compaiono “POD” o “Tensione/Potenza” → Elettricità.
2) Individua sezioni chiave: testata/frontespizio, “Scontrino dell’energia”, “Box Offerta”, “Caratteristiche tecniche”, “Quadro/Elementi di dettaglio”, “Informazioni storiche/consumi”.
3) Applica i pattern/sinonimi, normalizza i valori e compila il JSON.
4) Non includere unità o simboli nei valori (solo numeri come stringhe).

SCELTA VALORI DA ESEMPI REALI (aiuta la disambiguazione)
- Numero_documento: “Numero fattura elettronica valida ai fini fiscali: 20251200617622 del 09/07/2025”; “N. fattura elettronica valida ai fini fiscali 202530933282 del 16.05.2025”; “Fattura n° 2025/2403912 del 16/07/2025”.
- Data_emissione: la data indicata dopo “del …” o “emessa il …” accanto al numero documento.
- Data_scadenza: “Entro il 29/07/2025”, “Termine di pagamento: 07/08/2025”, “entro il 05.06.2025”.
- Indirizzo_fornitura: “INDIRIZZO FORNITURA: VIA SEBASTIANO CABOTO 14 - 20015 PARABIAGO MI”; “FORNIAMO GAS IN VIA CARSO 22 20015 Parabiago MI”; “Le stiamo fornendo gas in VIA BENEDETTO CROCE 2 20015 PARABIAGO (MI)”.
- Distributore (gas): in riquadro pronto intervento, ad es. “AEMME LINEA DISTRIBUZIONE SRL”.
- Codice_REMI: “CODICE REMI 34405900”.
- Consumo_annuo_Smc: “CONSUMO ANNUO: … Smc”, “Consumo annuo 2.760,8 smc”, “Consumo annuo aggiornato (Smc): 176,666355”.

SCHEMA DI OUTPUT (OBBLIGATORIO, STESSO ORDINE CHIAVI)
Restituisci ESATTAMENTE quest’oggetto con i valori estratti/normalizzati come stringhe:

{
  "Nome": "", "Cognome": "", "Indirizzo_residenza": "", "CAP": "", "Comune": "",
  "Provincia": "", "Codice_Fiscale": "", "Data_nascita": "", "Numero_documento": "",
  "Data_emissione": "", "Data_scadenza": "", "Cellulare": "", "Telefono_fisso_altro": "",
  "Email": "", "Codice_IBAN": "", "Indirizzo_fornitura": "", "Civico_3": "", "CAP_3": "",
  "Comune_3": "", "Provincia_3": "", "Tensione_V": "", "Potenza_impegnata_kW": "",
  "Potenza_disponibile_kW": "", "Consumo_annuo_kWh": "", "Distributore": "",
  "Codice_REMI": "", "Consumo_annuo_Smc": "", "Distributore_2": "", "Data": ""
}

PROMEMORIA FINALE
- Rispondi soltanto con JSON valido. Nessun markdown, nessun testo extra.
- Se un valore non è chiaramente presente o non è del cliente, metti "".
`;
}*/

function buildClaudeSystemPrompt() {
    return `
Sei un estrattore dati per bollette/contratti energia e, quando il documento non è una bolletta/contratto, per documenti di identità. Devi restituire SOLO un oggetto JSON valido, esattamente con le chiavi nello "SCHEMA DI OUTPUT".

## DIVIETI ASSOLUTI:
- NON inventare valori, NON usare esempi, NON riempire con dati generici.
- Se un valore non è presente, ambiguo o non riferito con certezza al cliente/titolare: restituisci "" (stringa vuota).
- NESSUN testo fuori dal JSON, nessun commento, nessun markdown.
- NON dedurre Nome/Cognome da ragioni sociali/denominazioni aziendali: se il cliente è azienda e non c'è referente persona esplicito, lascia Nome/Cognome "".
- NON usare dati del fornitore/merchant come se fossero del cliente.

## SE IL DOCUMENTO È DIVERSO DA UNA BOLLETTA (es. documento d'identità):
- Compila SOLO i campi che puoi dedurre con certezza (es. Nome/Cognome se presenti).
- TUTTI gli altri campi devono essere "".

## FLUSSO DI LAVORO (OBBLIGATORIO):

### 1) RICONOSCIMENTO TIPO DOCUMENTO (senza emettere testo):
- **Bolletta/contratto energia** (Elettricità/Gas) se trovi indicatori come: POD, PDR, REMI, Tensione (V), Potenza (kW), kWh, Smc, Fornitura, Utenza, Cliente, Numero cliente, Fattura/Bolletta, Matricola contatore, Contratto.
- **Documento d'identità** se trovi: "Carta d'Identità"/"C.I.", "Passaporto", "Patente", "Permesso di soggiorno", MRZ (linee con <<), campi "Cognome"/"Nome", "Luogo di nascita", "Data di nascita", "Data di rilascio"/"Scadenza", "Numero documento".
- Se il documento è un modulo/contratto energia senza dati tecnici (solo anagrafica), trattalo come "contratto energia".
- Se il documento è un fac-simile/esempio (es. "ESEMPIO", "FAC-SIMILE", "DEMO"), compila solo ciò che è realmente presente e certo; altrimenti "".
- Se trovi indicatori sia Gas che Elettricità, scegli la commodity con più indicatori affidabili; se parità o dubbio, lascia i campi commodity-specifici "".

### 2) ESTRAZIONE MIRATA:
- Usa solo campi chiaramente etichettati e riferiti al cliente/titolare.
- Per bollette/contratti: preferisci sezioni "Dati cliente", "Intestatario", "Fornitura", "POD/PDR/REMI", "Caratteristiche fornitura", "Fattura/Bolletta".
- Per documenti d'identità: usa intestazioni ufficiali, MRZ e campi standard (Cognome, Nome, Data di nascita, Numero documento, Data rilascio/emissione, Data scadenza, Comune/Residenza).

### 3) NORMALIZZAZIONE (OBBLIGATORIA):
- Tutti i valori sono stringhe.
- Date: formato DD-MM-YYYY (accetta input tipo dd/mm/yyyy, dd.mm.yyyy).
- CAP a 5 cifre (altrimenti "").
- Provincia a 2 lettere maiuscole (es. MI, RM). Se trovi nome esteso, mappalo alla sigla; se dubbio, "".
- Numeri tecnici senza unità: 
  - Tensione_V, Potenza_impegnata, Potenza_disponibile, Consumo_annuo_EE, Consumo_annuo_GAS: solo numero con punto decimale se necessario (es. "3.3"), niente unità o testo.
- IBAN/Codice Fiscale maiuscoli, senza spazi.
- Email in minuscolo, trim spazi.
- Telefono/Cellulare: rimuovi spazi/punteggiatura; conserva eventuale prefisso +39; se restano meno di 6 cifre, "".
- Indirizzi: separa quando possibile. Per fornitura, metti via/piazza negli specifici campi indirizzo e solo numero civico nei campi civico. Se il civico non è isolabile con certezza, lascia il campo civico "" e metti l'indirizzo completo (senza civico) nel campo indirizzo.
- Correggi errori OCR evidenti (O↔0, I↔1) solo se la correzione è certa; altrimenti "".

### 4) REGOLE SPECIFICHE PER BOLLETTE/CONTRATTI:
- **Commodity**:
  - Se vedi PDR/REMI → Gas. Compila PDR, REMI, Matricola, Consumo_annuo_GAS, Distributore_GAS, Indirizzo_fornitura_GAS, Civico_GAS, CAP_GAS, Comune_GAS, Provincia_GAS. I campi elettricità (POD/Tensione/Potenza/Consumo_annuo_EE/Distributore_EE/indirizzi EE) → "".
  - Se vedi POD/Tensione/Potenza → Elettricità. Compila POD, Tensione_V, Potenza_impegnata, Potenza_disponibile, Consumo_annuo_EE, Distributore_EE, Indirizzo_fornitura_EE, Civico_EE, CAP_EE, Comune_EE, Provincia_EE. I campi gas (PDR/REMI/Matricola/Consumo_annuo_GAS/Distributore_GAS/indirizzi GAS) → "".
- Numero_documento: numero bolletta/fattura/contratto (se presente come tale).
- Data_emissione: data documento (es. data fattura/bolletta/contratto).
- Data_scadenza: scadenza pagamento (se presente).
- Data: usa la "data documento" principale (se esistono più date, preferisci "Data documento" o "Data fattura/bolletta"; in assenza, "").
- Non usare "numero cliente", "codice contratto" come Codice_Fiscale.

### 5) REGOLE SPECIFICHE PER DOCUMENTI D'IDENTITÀ:
- Compila SOLO i campi deducibili con certezza dal documento d'identità.
- Per documenti d'identità, non compilare campi tecnici energia (POD, PDR, consumi, distributori, etc.) → "".
- **MRZ**:
  - Estrai Cognome/Nome dai separatori "<".
  - Date MRZ in YYMMDD: inferisci se 19xx o 20xx in modo plausibile (scadenza futura vs nascita passata); se ambigua, "".
  - Numero documento dalla MRZ (campo documento).
- Non compilare "Data" (campo generico) per documenti d'identità: lascia "".

### 6) DISAMBIGUAZIONE & QUALITÀ:
- Se trovi più occorrenze per lo stesso campo, scegli quella con etichetta più specifica e vicina alla sezione pertinente (es. "Dati cliente").
- Se un valore è parziale/incompleto e non sei certo del completamento, restituisci "".
- Ignora valori segnaposto (es. "Mario Rossi", "XXXX", "1234567890") se plausibili come placeholder; se non certo, "".
- Se il JSON risultante non è valido, correggilo prima di restituirlo.
- Non includere spazi superflui all'inizio/fine dei valori.

## VOCABOLARIO ETICHETTE (sinonimi/regex utili, non esaustivi):
- **POD**: "POD", "Codice POD", "P.O.D.", "ID POD".
- **PDR**: "PDR", "Codice PDR", "P.D.R.".
- **REMI**: "REMI", "Codice REMI".
- **Tensione**: "Tensione", "V", "Volt", "Tensione di fornitura".
- **Potenza impegnata**: "Potenza impegnata", "kW impegnati", "Pot. impegnata", "P. impegnata".
- **Potenza disponibile**: "Potenza disponibile", "kW disponibili", "Pot. disponibile".
- **Consumo annuo elettrico**: "Consumo annuo", "Consumo annuale", "Energia annua", "kWh/anno".
- **Consumo annuo gas**: "Consumo annuo gas", "Smc annui", "Smc/anno".
- **Distributore elettrico**: "Distributore", "e-distribuzione", "Unareti", "Areti", "Acea Distribuzione", "Hera", ecc.
- **Distributore gas**: "Distributore gas", "Italgas", "2i Rete Gas", "Hera", ecc.
- **Cliente/Intestatario**: "Intestatario", "Dati cliente", "Cliente", "Titolare".
- **Indirizzo**: "Indirizzo", "Via", "Viale", "Piazza", "P.zza", "V.le", "C.so", "Corso".
- **Civico**: "N.", "Nr.", "Numero civico", "Civ.".
- **CAP**: "CAP", "C.A.P.".
- **Comune**: "Comune", "Città", "Località".
- **Provincia**: "Prov.", "Provincia".
- **Numero documento**: "Numero documento", "N. doc.", "Doc No", "Passport No", "Carta identità n.".
- **Numero contratto**: "Numero contratto", "N. contratto", "Contratto No", "Contract No", "Codice contratto".
- **Data emissione/rilascio**: "Data emissione", "Data rilascio", "Rilasciato il", "Issue date".
- **Data scadenza**: "Scadenza", "Data scadenza", "Validità fino al", "Expiry date".
- **Codice Fiscale**: "Codice Fiscale", "C.F.", "CF".
- **IBAN**: "IBAN", "Iban".
- **Email**: "Email", "E-mail", "PEC".
- **Telefono**: "Telefono", "Tel.", "Cell.", "Mobile".
- **Indicatori documento d'identità**: "Carta d'identità", "Passaporto", "Patente", "Permesso di soggiorno", presenza MRZ con '<<'.

## REGOLE DI OUTPUT:
- Formato: un unico oggetto JSON.
- Tipi: tutti i valori sono stringhe.
- Mancanze o ambiguità: usa "".
- Normalizzazione: (date DD-MM-YYYY; CAP a 5 cifre; Provincia a 2 lettere; numeri senza unità; IBAN/CF maiuscoli; indirizzi separati quando possibile).
- Commodity: se vedi PDR/REMI → Gas; se POD/Tensione/Potenza → Elettricità. Campi non pertinenti alla commodity → "".

## SCHEMA DI OUTPUT (ordine e chiavi fissi):
{
  "NomeCondominio": "",
  "Nome": "",
  "Cognome": "",
  "Nome_LR": "",
  "Cognome_LR": "",
  "Rilasciato_da": "",
  "Luogo_N": "",
  "Data_N": "",
  "Ragione_sociale": "",
  "Indirizzo_residenza": "",
  "Indirizzo_SL": "",
  "Civico_SL": "",
  "Civico": "",
  "CAP_SL": "",
  "CAP": "",
  "Comune_SL": "",
  "Comune": "",
  "Provincia": "",
  "Provincia_SL": "",
  "Codice_Fiscale_LR": "",
  "Codice_Fiscale": "",
  "Partita_IVA": "",
  "Data_nascita": "",
  "Numero_documento": "",
  "Numero_contratto": "",
  "Data_emissione": "",
  "Data_scadenza": "",
  "Indirizzo_fornitura_EE": "",
  "Civico_EE": "",
  "CAP_EE": "",
  "Comune_EE": "",
  "Provincia_EE": "",
  "Tensione_V": "",
  "Potenza_impegnata": "",
  "Potenza_disponibile": "",
  "Consumo_annuo_EE": "",
  "Distributore_EE": "",
  "Attuale_Fornitore_GAS": "",
  "Attuale_Fornitore_EE": "",
  "POD": "",
  "Indirizzo_fornitura_GAS": "",
  "Civico_GAS": "",
  "CAP_GAS": "",
  "Comune_GAS": "",
  "Provincia_GAS": "",
  "PDR": "",
  "REMI": "",
  "Matricola": "",
  "Consumo_annuo_GAS": "",
  "Distributore_GAS": "",
  "Data": ""
}

### NOTE AGGIUNTIVE PER I NUOVI CAMPI:
- **NomeCondominio**: Nome del condominio se presente
- **Nome_LR/Cognome_LR**: Legale rappresentante (se diverso dal titolare)
- **Rilasciato_da**: Ente che ha rilasciato il documento
- **Luogo_N**: Luogo di nascita
- **Data_N**: Data di nascita (usa questo campo per documenti d'identità, altrimenti usa Data_nascita)
- **Ragione_sociale**: Denominazione aziendale
- **Indirizzo_SL/Civico_SL/CAP_SL/Comune_SL/Provincia_SL**: Indirizzo sede legale
- **Codice_Fiscale_LR**: Codice fiscale del legale rappresentante
- **Partita_IVA**: Partita IVA dell'azienda
- **Campi EE**: Specifici per elettricità (EE = Energia Elettrica)
- **Campi GAS**: Specifici per gas
- **Attuale_Fornitore_GAS/EE**: Fornitore attuale di gas/elettricità
- **Matricola**: Matricola contatore
`;
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
    logger.info("[queryClaude] Avvio richiesta a Claude (lunghezze) system:", systemPrompt?.length, "user:", text.length);
    const system = buildClaudeSystemPrompt();
    const user = buildClaudeUserContent(text);
    const anthropic = getAnthropic();
    logger.info("[queryClaude] Invio richiesta a Claude (lunghezze) system:", system.length, "user:", user.length);

    try {
        const startTime = Date.now();

        const response = await anthropic.messages.create({
            //model: "claude-3-5-sonnet-20240620",
            model: "claude-3-5-haiku-20241022",
            temperature: 0,
            top_p: 1,
            max_tokens: 4000,
            system,
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
    clean = clearCommodityFieldsIfNotPresent(clean, text);
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

function detectBillSignals(text) {
    const t = (text || "").toUpperCase();
    return {
        hasGas: /(PDR|REMI|SMC|CONSUMO\s+ANNUO)/.test(t),
        hasElec: /(POD|TENSIONE|POTENZA|KWH)/.test(t),
        hasInvoice: /(FATTURA|NUMERO FATTURA|SCADENZA|EMESSA IL|VALIDA AI FINI FISCALI)/.test(t)
    };
}

function clearCommodityFieldsIfNotPresent(data, text) {
    const sig = detectBillSignals(text);
    const d = { ...data };
    // Se non vedo gas, azzero i campi gas
    if (!sig.hasGas) {
        d.Codice_REMI = "";
        d.Consumo_annuo_Smc = "";
        d.Distributore = ""; // opzionale: potrebbe essere gas o luce, se non certo → ""
    }
    // Se non vedo elettricità, azzero i campi elettricità
    if (!sig.hasElec) {
        d.Tensione_V = "";
        d.Potenza_impegnata_kW = "";
        d.Potenza_disponibile_kW = "";
        d.Consumo_annuo_kWh = "";
    }
    // Se non vedo elementi da “fattura”, azzero numero/data/scadenza
    if (!sig.hasInvoice) {
        d.Numero_documento = "";
        d.Data_emissione = "";
        d.Data_scadenza = "";
        d.Data = "";
    }
    return d;
}

const EMPTY_SCHEMA = {
    Nome:"", Cognome:"", Indirizzo_residenza:"", CAP:"", Comune:"",
    Provincia:"", Codice_Fiscale:"", Data_nascita:"", Numero_documento:"",
    Data_emissione:"", Data_scadenza:"", Cellulare:"", Telefono_fisso_altro:"",
    Email:"", Codice_IBAN:"", Indirizzo_fornitura:"", Civico_3:"", CAP_3:"",
    Comune_3:"", Provincia_3:"", Tensione_V:"", Potenza_impegnata_kW:"",
    Potenza_disponibile_kW:"", Consumo_annuo_kWh:"", Distributore:"",
    Codice_REMI:"", Consumo_annuo_Smc:"", Distributore_2:"", Data:""
};

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
    const out = { ...EMPTY_SCHEMA, ...obj };
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