// Gira su ogni pagina ma si attiva solo sui siti scelti nelle impostazioni (parola chiave nell'indirizzo:
// così continua a funzionare quando il sito cambia dominio). Dopo N minuti di visione con la scheda in primo
// piano, manda titolo e indirizzo a PassionOrganizer, che riconosce serie, stagione ed episodio.

const EPISODIO = /\bS\d{1,2}\s*[:.\-_]?\s*E\d{1,4}\b|\b\d{1,2}x\d{1,4}\b|\b(episodio|episode|ep)\.?\s*\d{1,4}\b/i;
const NUMERO_EP = /^(?:ep(?:isodio|isode)?\.?\s*)?(\d{1,4})$/i;
// scritte del player come "Season 4, Ep. 2 Titolo" o "Stagione 4, ep. 2" (es. Prime Video)
const STAGIONE_EP = /\b(?:S\d{1,2}\s*[:.\-_]?\s*E\d{1,4}|(?:season|stagione|st)\.?\s*\d{1,2}.{0,20}?\b(?:episode|episodio|ep)\.?\s*\d{1,4})\b/i;

// Siti come Prime Video lasciano nel titolo della scheda solo la serie: l'episodio è scritto nella barra
// del player. Si cerca una scritta breve con stagione ed episodio e, accanto, il nome della serie.
function scrittaPlayer() {
  for (const el of document.querySelectorAll('[class*="title"],[class*="subtitle"],[class*="episode"],[class*="Title"]')) {
    const testo = (el.innerText || "").trim();
    if (!testo || testo.length > 150 || !STAGIONE_EP.test(testo)) continue;
    const insieme = (el.parentElement?.innerText || "").trim().replace(/\s*\n+\s*/g, " ");
    return insieme.length <= 200 && insieme.length > testo.length ? insieme : testo;
  }
  return null;
}

// Molti siti non scrivono l'episodio nel titolo della scheda: lo si trova nel pulsante dell'episodio
// evidenziato (classe "active", "current", "selected"…) dentro l'elenco degli episodi.
function episodioEvidenziato() {
  const sel = '[class*="active"],[class*="current"],[class*="selected"],[aria-current="true"],[aria-current="page"],[aria-selected="true"]';
  let ripiego = null;
  for (const el of document.querySelectorAll(sel)) {
    const m = (el.innerText || "").trim().match(NUMERO_EP);
    if (!m) continue;
    // preferisce quelli dentro un contenitore che parla di episodi
    for (let p = el, i = 0; p && i < 6; p = p.parentElement, i++) {
      if (/episod/i.test(`${p.id || ""} ${typeof p.className === "string" ? p.className : ""}`)) return +m[1];
    }
    if (ripiego == null) ripiego = +m[1];
  }
  return ripiego;
}

function titoloPagina() {
  const og = document.querySelector('meta[property="og:title"]')?.content || "";
  const h1 = document.querySelector("h1")?.innerText || "";
  const h2 = document.querySelector("h2")?.innerText || "";
  const candidati = [document.title, og, `${h1} ${h2}`.trim()].filter(Boolean);
  const conEpisodio = candidati.find(c => EPISODIO.test(c));
  if (conEpisodio) return conEpisodio;
  const nome = (h1 || og || document.title).trim();
  const player = scrittaPlayer();
  if (player) {
    // se accanto alla scritta non c'è il nome della serie, lo si prende dal titolo della pagina
    return /^\W*(?:S\d|season|stagione|st\b)/i.test(player) ? `${nome} ${player}` : player;
  }
  const n = episodioEvidenziato();
  return n != null ? `${nome} Episodio ${n}` : document.title;
}

// cosa si vede nella pagina, per capire i siti che non vengono riconosciuti
function diagnostica() {
  const testi = [...document.querySelectorAll('[class*="active"],[class*="current"],[class*="selected"],[aria-current]')]
    .map(el => `${el.tagName.toLowerCase()}.${typeof el.className === "string" ? el.className.trim().replace(/\s+/g, ".") : ""}: ${(el.innerText || "").trim().slice(0, 40)}`)
    .filter(t => !t.endsWith(": ")).slice(0, 15);
  return { titolo_scheda: document.title, og: document.querySelector('meta[property="og:title"]')?.content || "",
           h1: document.querySelector("h1")?.innerText?.slice(0, 120) || "", h2: document.querySelector("h2")?.innerText?.slice(0, 120) || "",
           evidenziati: testi, player: scrittaPlayer() || "" };
}

// il riquadro dell'estensione chiede cosa c'è in questa pagina (funziona anche su un sito appena aggiunto)
browser.runtime.onMessage.addListener(msg => {
  if (msg.tipo !== "pagina") return;
  return Promise.resolve({ titolo: titoloPagina(), url: location.href, diagnostica: diagnostica() });
});

(async () => {
  const imp = await browser.runtime.sendMessage({ tipo: "impostazioni" });
  if (!imp || !imp.siti) return;
  const host = location.hostname.toLowerCase();
  const sito = imp.siti.find(s => s.parola && host.includes(s.parola.toLowerCase()));
  if (!sito) return;

  let indirizzo = location.href, secondi = 0, inviato = false;

  function pagina() {
    return { titolo: titoloPagina(), url: location.href, sito: sito.parola, categoria: sito.categoria, diagnostica: diagnostica() };
  }

  function avviso(testo, pulsanti = []) {
    document.getElementById("tracker-episodi-avviso")?.remove();
    const box = document.createElement("div");
    box.id = "tracker-episodi-avviso";
    box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#1b1e27;color:#e7e9ef;" +
      "border:1px solid #5b8cff;border-radius:10px;padding:10px 14px;font:14px 'Segoe UI',sans-serif;box-shadow:0 4px 18px #0008;max-width:340px";
    const p = document.createElement("div");
    p.textContent = testo;
    box.appendChild(p);
    if (pulsanti.length) {
      const riga = document.createElement("div");
      riga.style.cssText = "margin-top:8px;display:flex;gap:8px;justify-content:flex-end";
      for (const [etichetta, azione] of pulsanti) {
        const b = document.createElement("button");
        b.textContent = etichetta;
        b.style.cssText = "background:#5b8cff;color:#fff;border:0;border-radius:6px;padding:5px 10px;cursor:pointer";
        b.onclick = () => { box.remove(); azione && azione(); };
        riga.appendChild(b);
      }
      box.appendChild(riga);
    } else {
      setTimeout(() => box.remove(), 5000);
    }
    document.body.appendChild(box);
  }

  async function segna() {
    const r = await browser.runtime.sendMessage({ tipo: "segna", pagina: pagina() });
    if (!r || r.errore) return avviso("📺 " + (r?.errore || "Errore"));
    const ep = sito.categoria === "film" ? "(film)" : `${r.stagione ? "S" + r.stagione + " " : ""}ep ${r.episodio}`;
    if (r.esito === "aggiornato") avviso(`✔ Segnato in PassionOrganizer: ${r.titolo} · ${ep}`);
    else if (r.esito === "da_confermare") avviso(`📥 "${r.titolo}" ${ep} non è in lista: lo trovi da confermare in PassionOrganizer.`);
  }

  async function quandoVisto() {
    inviato = true;
    const a = await browser.runtime.sendMessage({ tipo: "analizza", pagina: pagina() });
    if (!a || a.errore || a.episodio == null) return;          // non è la pagina di un episodio
    if (imp.modalita === "conferma") {
      const ep = sito.categoria === "film" ? "(film)" : `${a.stagione ? "S" + a.stagione + " " : ""}ep ${a.episodio}`;
      avviso(`📺 Segnare "${a.in_lista || a.titolo}" ${ep} in PassionOrganizer?`, [["Sì", segna], ["No", null]]);
    } else {
      segna();
    }
  }

  // conta solo il tempo con la scheda visibile; ricomincia se l'indirizzo cambia (episodio successivo)
  setInterval(() => {
    if (location.href !== indirizzo) { indirizzo = location.href; secondi = 0; inviato = false; }
    if (!inviato && document.visibilityState === "visible") {
      secondi += 5;
      if (secondi >= imp.minuti * 60) quandoVisto();
    }
  }, 5000);
})();
