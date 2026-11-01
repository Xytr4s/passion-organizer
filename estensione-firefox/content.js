// Gira su ogni pagina ma si attiva solo sui siti scelti nelle impostazioni (parola chiave nell'indirizzo:
// così continua a funzionare quando il sito cambia dominio). Dopo N minuti di visione con la scheda in primo
// piano, manda titolo e indirizzo a PassionOrganizer, che riconosce serie, stagione ed episodio.

(async () => {
  const imp = await browser.runtime.sendMessage({ tipo: "impostazioni" });
  if (!imp || !imp.siti) return;
  const host = location.hostname.toLowerCase();
  const sito = imp.siti.find(s => s.parola && host.includes(s.parola.toLowerCase()));
  if (!sito) return;

  const EPISODIO = /\bS\d{1,2}\s*E\d{1,4}\b|\b\d{1,2}x\d{1,4}\b|\b(episodio|episode|ep)\.?\s*\d{1,4}\b/i;
  let indirizzo = location.href, secondi = 0, inviato = false;

  function titoloPagina() {
    const og = document.querySelector('meta[property="og:title"]')?.content || "";
    const h1 = document.querySelector("h1")?.innerText || "";
    const h2 = document.querySelector("h2")?.innerText || "";
    const candidati = [document.title, og, `${h1} ${h2}`.trim()].filter(Boolean);
    return candidati.find(c => EPISODIO.test(c)) || document.title;
  }

  function pagina() {
    return { titolo: titoloPagina(), url: location.href, sito: sito.parola, categoria: sito.categoria };
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
