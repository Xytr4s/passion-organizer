const $ = id => document.getElementById(id);
let imp, scheda;

async function salva() {
  await browser.storage.local.set(imp);
}

function disegnaSiti() {
  $("siti").innerHTML = "";
  if (!imp.siti.length) {
    $("siti").innerHTML = '<div class="warn">Nessun sito: aggiungine uno per iniziare.</div>';
  }
  imp.siti.forEach((s, i) => {
    const r = document.createElement("div");
    r.className = "sito";
    const t = document.createElement("span");
    t.textContent = `${s.parola} · ${({anime: "Anime", film: "Film"})[s.categoria] || "Serie TV"}`;
    const b = document.createElement("button");
    b.textContent = "✕";
    b.onclick = async () => { imp.siti.splice(i, 1); await salva(); disegnaSiti(); };
    r.append(t, b);
    $("siti").appendChild(r);
  });
}

function aggiungiSito(parola, categoria) {
  parola = (parola || "").trim().toLowerCase();
  if (!parola || imp.siti.some(s => s.parola === parola)) return;
  imp.siti.push({ parola, categoria });
  salva();
  disegnaSiti();
}

function parolaDaHost(host) {
  // "www.nomesito.example" -> "nomesito": la parte che di solito resta uguale quando cambia dominio
  const pezzi = host.replace(/^www\d*\./, "").split(".");
  return pezzi.length > 1 ? pezzi[pezzi.length - 2] : pezzi[0];
}

async function analizzaScheda() {
  const host = new URL(scheda.url).hostname.toLowerCase();
  const sito = imp.siti.find(s => host.includes(s.parola));
  if (!sito) {
    $("analisi").innerHTML = '<span class="tenue">Sito non seguito.</span>';
    return;
  }
  let letto = null;
  try { letto = await browser.tabs.sendMessage(scheda.id, { tipo: "pagina" }); } catch (e) { /* pagina da ricaricare */ }
  const pagina = { titolo: letto?.titolo || scheda.title, url: scheda.url, sito: sito.parola, categoria: letto?.film ? "film" : sito.categoria,
                   diagnostica: letto?.diagnostica };
  const a = await browser.runtime.sendMessage({ tipo: "analizza", pagina });
  if (!a || a.errore) { $("analisi").innerHTML = `<span class="ko">${a?.errore || "Errore"}</span>`; return; }
  if (a.episodio == null) {
    $("analisi").textContent = "Nessun episodio riconosciuto in questa pagina.";
    const d = document.createElement("div");
    d.className = "tenue";
    d.textContent = letto ? `Letto: ${pagina.titolo}` : "Ricarica la pagina (F5) e riapri questo riquadro.";
    $("analisi").appendChild(d);
    return;
  }
  const ep = `${a.stagione ? "S" + a.stagione + " " : ""}ep ${a.episodio}`;
  $("analisi").textContent = `${a.in_lista || a.titolo} · ${ep}` + (a.in_lista ? ` (in lista, visti ${a.visti ?? 0})` : " (non in lista)");
  $("segna").disabled = false;
  $("segna").onclick = async () => {
    const r = await browser.runtime.sendMessage({ tipo: "segna", pagina });
    $("analisi").textContent = r.esito === "aggiornato" ? `✔ Segnato: ${r.titolo} · ${ep}`
      : r.esito === "da_confermare" ? "📥 Messo da confermare in PassionOrganizer" : (r.errore || "Non riconosciuto");
    $("segna").disabled = true;
  };
}

(async () => {
  imp = await browser.runtime.sendMessage({ tipo: "impostazioni" });
  [scheda] = await browser.tabs.query({ active: true, currentWindow: true });
  $("minuti").value = imp.minuti;
  $("modalita").value = imp.modalita;
  $("gestore").value = imp.gestore;
  disegnaSiti();
  $("minuti").onchange = () => { imp.minuti = Math.max(1, +$("minuti").value || 5); salva(); };
  $("modalita").onchange = () => { imp.modalita = $("modalita").value; salva(); };
  $("gestore").onchange = () => { imp.gestore = $("gestore").value.trim().replace(/\/$/, ""); salva(); };
  $("esporta").onclick = () => {
    const dati = { tipo: "passionorganizer-estensione", versione: 1, siti: imp.siti, minuti: imp.minuti, modalita: imp.modalita };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(dati, null, 2)], { type: "application/json" }));
    a.download = `passionorganizer-siti-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  // la finestra di scelta del file chiuderebbe questo riquadro: l'importazione si fa in una scheda a parte
  $("importa").onclick = () => { browser.tabs.create({ url: browser.runtime.getURL("importa.html") }); window.close(); };
  $("aggiungi").onclick = () => { aggiungiSito($("parola").value, $("categoria").value); $("parola").value = ""; };
  $("questo").onclick = () => {
    if (!scheda?.url?.startsWith("http")) return;
    aggiungiSito(parolaDaHost(new URL(scheda.url).hostname), $("categoria").value);
    analizzaScheda();
  };
  const ping = await browser.runtime.sendMessage({ tipo: "ping" });
  $("stato").innerHTML = ping && ping.ok ? '<span class="ok">● PassionOrganizer collegato</span>'
    : '<span class="ko">● PassionOrganizer non raggiungibile: aprilo sul PC</span>';
  if (ping && ping.ok && scheda?.url?.startsWith("http")) analizzaScheda();
})();
