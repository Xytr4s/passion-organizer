// Fa da ponte tra le pagine e PassionOrganizer (http://127.0.0.1:5577), che gira sul PC.

const PREDEFINITE = {
  gestore: "http://127.0.0.1:5577",
  siti: [],            // [{parola: "nomesito", categoria: "serie" | "anime"}]
  minuti: 5,           // tempo di visione dopo cui l'episodio conta come visto
  modalita: "auto",    // "auto" = segna da solo, "conferma" = chiede prima
};

async function impostazioni() {
  await ripristinaSeNuova();
  const s = await browser.storage.local.get(PREDEFINITE);
  return { ...PREDEFINITE, ...s };
}

// Estensione appena installata (o reinstallata, o versione firmata nuova): nessun sito salvato.
// Si riprendono siti e impostazioni dalla copia tenuta in PassionOrganizer. Una sola volta: se poi
// l'utente toglie tutti i siti, la lista vuota resta tale.
let ripristinoProvato = false;
async function ripristinaSeNuova() {
  if (ripristinoProvato) return;
  const salvate = await browser.storage.local.get(null);
  if ("siti" in salvate) { ripristinoProvato = true; return; }
  try {
    const gestore = salvate.gestore || PREDEFINITE.gestore;
    const r = await fetch(gestore + "/api/estensione/impostazioni");
    const copia = r.ok ? await r.json() : {};
    ripristinoProvato = true;
    if (Array.isArray(copia.siti) && copia.siti.length) {
      await browser.storage.local.set({ siti: copia.siti, minuti: copia.minuti || PREDEFINITE.minuti,
                                        modalita: copia.modalita || PREDEFINITE.modalita });
    }
  } catch (e) { /* app chiusa: si riprova alla prossima richiesta */ }
}

// Ogni modifica di siti o impostazioni viene copiata in PassionOrganizer (dopo il tentativo di ripristino,
// per non sovrascrivere la copia buona con una lista ancora vuota).
let invioCopia = null;
browser.storage.onChanged.addListener((cambi, area) => {
  if (area !== "local" || !ripristinoProvato) return;
  if (!("siti" in cambi || "minuti" in cambi || "modalita" in cambi)) return;
  clearTimeout(invioCopia);
  invioCopia = setTimeout(async () => {
    try {
      const s = await browser.storage.local.get(PREDEFINITE);
      await fetch(s.gestore + "/api/estensione/impostazioni", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siti: s.siti, minuti: s.minuti, modalita: s.modalita }) });
    } catch (e) { /* app chiusa: la copia si aggiorna alla prossima modifica */ }
  }, 1000);
});

// Copia iniziale: chi aveva già i siti prima di questa versione li ritrova subito salvati anche nell'app.
(async () => {
  await ripristinaSeNuova();
  const s = await browser.storage.local.get(PREDEFINITE);
  if (ripristinoProvato && s.siti.length) {
    try {
      await fetch(s.gestore + "/api/estensione/impostazioni", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siti: s.siti, minuti: s.minuti, modalita: s.modalita }) });
    } catch (e) { /* app chiusa */ }
  }
})();

async function chiama(percorso, corpo) {
  const { gestore } = await impostazioni();
  const r = await fetch(gestore + percorso, corpo === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`PassionOrganizer: ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------- tempo di visione
// Le schede dei siti scelti dicono cosa mostrano ("pagina_video"); qualsiasi riquadro della scheda (anche il
// player in un iframe) dice quando un video è in riproduzione ("riproduzione"). Ogni 15 secondi, per ogni scheda
// con un video in riproduzione, si manda un battito a PassionOrganizer. Se l'app è chiusa i battiti restano in
// coda (con la loro ora) e partono al primo invio riuscito.
const schede = {};          // id scheda -> { pagina, aggiornata, riproduzione }
const PASSO_BATTITO = 15000;
const MAX_CODA = 6000;      // circa 25 ore di visione

browser.tabs.onRemoved.addListener(id => { delete schede[id]; });
browser.tabs.onUpdated.addListener((id, cambi) => {
  const s = schede[id];
  if (!s || !cambi.url) return;
  try {   // la scheda è passata a un altro sito: non conta più
    if (!new URL(cambi.url).hostname.toLowerCase().includes((s.pagina.sito || "").toLowerCase())) delete schede[id];
  } catch (e) { delete schede[id]; }
});

function battito(pagina, quando) {
  const d = pagina.diagnostica || {};
  return { titolo: pagina.titolo, url: pagina.url, sito: pagina.sito, categoria: pagina.categoria, quando,
           diagnostica: { inertia: d.inertia, player: d.player, h1: d.h1, h2: d.h2, og: d.og } };
}

let invioInCorso = false;
setInterval(async () => {
  const ora = Date.now();
  const nuovi = [];
  for (const [id, s] of Object.entries(schede)) {
    if (ora - s.aggiornata > 120000) { delete schede[id]; continue; }
    if (s.riproduzione && ora - s.riproduzione <= PASSO_BATTITO + 1000) nuovi.push(battito(s.pagina, ora));
  }
  if (invioInCorso) return;
  invioInCorso = true;
  try {
    const { coda_battiti = [] } = await browser.storage.local.get("coda_battiti");
    const tutti = coda_battiti.concat(nuovi).slice(-MAX_CODA);
    if (!tutti.length) return;
    try {
      await chiama("/api/tempo/battito", { battiti: tutti });
      if (coda_battiti.length) await browser.storage.local.set({ coda_battiti: [] });
    } catch (e) {
      await browser.storage.local.set({ coda_battiti: tutti });
    }
  } finally {
    invioInCorso = false;
  }
}, PASSO_BATTITO);

browser.runtime.onMessage.addListener(async (msg, sender) => {
  const tab = sender?.tab?.id;
  if (msg.tipo === "pagina_video" && tab != null) {
    schede[tab] = { ...(schede[tab] || {}), pagina: msg.pagina, aggiornata: Date.now() };
    return;
  }
  if (msg.tipo === "riproduzione") {
    if (tab != null && schede[tab]) schede[tab].riproduzione = Date.now();
    return;
  }
  try {
    if (msg.tipo === "impostazioni") return await impostazioni();
    if (msg.tipo === "ping") return await chiama("/api/estensione/ping");
    if (msg.tipo === "analizza") return await chiama("/api/estensione/analizza", msg.pagina);
    if (msg.tipo === "segna") {
      const r = await chiama("/api/estensione", msg.pagina);
      aggiornaBadge(r);
      return r;
    }
  } catch (e) {
    return { errore: "PassionOrganizer non raggiungibile: è aperto?" };
  }
});

function aggiornaBadge(r) {
  const testo = r.esito === "aggiornato" ? "✔" : r.esito === "da_confermare" ? "?" : "";
  browser.browserAction.setBadgeText({ text: testo });
  browser.browserAction.setBadgeBackgroundColor({ color: r.esito === "aggiornato" ? "#3ecf8e" : "#f5b84d" });
  setTimeout(() => browser.browserAction.setBadgeText({ text: "" }), 8000);
}
