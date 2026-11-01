/**
 * PassionOrganizer — sincronizzazione con il telefono (Google Apps Script, collegato a un Foglio Google).
 *
 * - PassionOrganizer sul PC invia la sua lista e riceve le modifiche fatte dal telefono (doPost, azione "sincronizza").
 * - Il telefono apre la pagina privata (doGet) per vedere e aggiornare serie, film e anime.
 * - Ogni richiesta deve contenere il codice segreto TOKEN.
 *
 * PassionOrganizer inserisce da solo il codice qui sotto quando copi questo file dalle sue Impostazioni.
 */
const TOKEN = "__TOKEN__";
const FOGLIO = "Lista";
const COLONNE = ["id", "categoria", "tipo", "titolo", "anno", "copertina", "stato", "voto", "note", "stagioni", "aggiornato"];

function foglio_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(FOGLIO);
  if (!sh) {
    sh = ss.insertSheet(FOGLIO);
    sh.getRange(1, 1, 1, COLONNE.length).setValues([COLONNE]);
  }
  return sh;
}

function leggi_() {
  const valori = foglio_().getDataRange().getDisplayValues();
  return valori.slice(1).filter(r => r[0]).map(r => {
    const o = {};
    COLONNE.forEach((c, i) => o[c] = r[i]);
    try { o.stagioni = JSON.parse(o.stagioni || "[]"); } catch (e) { o.stagioni = []; }
    o.voto = o.voto === "" ? null : Number(o.voto);
    o.anno = o.anno === "" ? null : o.anno;
    return o;
  });
}

function scrivi_(lista) {
  const sh = foglio_();
  sh.clearContents();
  const dati = [COLONNE].concat(lista.map(o => COLONNE.map(c =>
    c === "stagioni" ? JSON.stringify(o.stagioni || []) : (o[c] === null || o[c] === undefined ? "" : String(o[c])))));
  const area = sh.getRange(1, 1, dati.length, COLONNE.length);
  area.setNumberFormat("@");            // tutto come testo: niente conversioni automatiche di date e numeri
  area.setValues(dati);
}

/** Per ogni titolo vince la versione modificata più di recente (orari in UTC). */
function unisci_(daPc, dalFoglio, eliminati) {
  const m = {};
  dalFoglio.forEach(o => m[o.id] = o);
  daPc.forEach(o => {
    const r = m[o.id];
    if (!r || String(o.aggiornato) >= String(r.aggiornato)) m[o.id] = o;
  });
  (eliminati || []).forEach(id => delete m[id]);
  return Object.keys(m).map(k => m[k]);
}

function verifica_(t) {
  // il segnaposto è spezzato in due così PassionOrganizer sostituisce solo quello di TOKEN, in cima al file
  if (!TOKEN || TOKEN === "__" + "TOKEN__" || t !== TOKEN) throw new Error("codice di accesso non valido");
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try { verifica_(p.token); } catch (err) { return HtmlService.createHtmlOutput("<h3>Accesso negato</h3>"); }
  if (p.json) return json_({ ok: true, titoli: leggi_() });
  const t = HtmlService.createTemplateFromFile("Pagina");
  t.token = p.token;
  return t.evaluate()
    .setTitle("PassionOrganizer")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1");
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const j = JSON.parse(e.postData.contents);
    verifica_(j.token);
    if (j.azione === "sincronizza") {
      const unito = unisci_(j.titoli || [], leggi_(), j.eliminati);
      scrivi_(unito);
      return json_({ ok: true, titoli: unito });
    }
    return json_({ ok: false, errore: "azione sconosciuta" });
  } catch (err) {
    return json_({ ok: false, errore: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- chiamate dalla pagina del telefono (google.script.run) ---------- */

function lista(token) {
  verifica_(token);
  return leggi_();
}

function salvaTitolo(token, titolo) {
  verifica_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const l = leggi_();
    titolo.aggiornato = new Date().toISOString();
    const i = l.findIndex(o => o.id === titolo.id);
    if (i >= 0) l[i] = titolo; else l.push(titolo);
    scrivi_(l);
    return titolo;
  } finally {
    lock.releaseLock();
  }
}
