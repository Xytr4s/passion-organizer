// Fa da ponte tra le pagine e PassionOrganizer (http://127.0.0.1:5577), che gira sul PC.

const PREDEFINITE = {
  gestore: "http://127.0.0.1:5577",
  siti: [],            // [{parola: "nomesito", categoria: "serie" | "anime"}]
  minuti: 5,           // tempo di visione dopo cui l'episodio conta come visto
  modalita: "auto",    // "auto" = segna da solo, "conferma" = chiede prima
};

async function impostazioni() {
  const s = await browser.storage.local.get(PREDEFINITE);
  return { ...PREDEFINITE, ...s };
}

async function chiama(percorso, corpo) {
  const { gestore } = await impostazioni();
  const r = await fetch(gestore + percorso, corpo === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`PassionOrganizer: ${r.status}`);
  return r.json();
}

browser.runtime.onMessage.addListener(async (msg) => {
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
