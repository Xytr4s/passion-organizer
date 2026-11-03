// Sezione "Bot di trading": stato del bot (cartella esterna), giri automatici, comandi senza ordini e report HTML.
const BOT = {dati: null, report: "confronto", timer: null, eraInCorso: false};
const BOT_REPORT = {confronto: "confronto.html", scopritore: "scopritore.html", backtest: "report.html"};

function vBot(){
  setTimeout(caricaBot);
  return `<div id="botTesta" class="vuoto">…</div><div id="botReport"></div>`;
}
async function caricaBot(){
  BOT.dati = await api("/api/bot");
  disegnaBot();
  const L = BOT.dati.lavoro || {};
  clearTimeout(BOT.timer);
  if (L.in_corso) BOT.timer = setTimeout(() => { if (sezione === "bot") caricaBot(); }, 2000);
  else if (BOT.eraInCorso && L.comando === "confronto") disegnaReport();   // riepilogo appena rigenerato
  BOT.eraInCorso = !!L.in_corso;
}
const quandoTxt = iso => iso ? new Date(iso).toLocaleString(LOCALE(), {weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"}) : "—";
function variazione(v, base){
  if (v == null || !base) return "";
  const d = v / base - 1;
  return `<span class="${d > 0.0005 ? "ok" : d < -0.0005 ? "ko" : "tenue"}">${d > 0 ? "+" : ""}${(d * 100).toFixed(2).replace(".", ",")}%</span>`;
}
function esitoAttivita(a){
  if (a.esito === 0) return `<span class="ok">✓ ${t("bot_riuscito")}</span>`;
  if (a.esito === 267009) return `<span class="tenue">⏳ ${t("bot_in_corso")}</span>`;
  if (a.esito === 267011) return `<span class="tenue">${t("bot_mai")}</span>`;
  return `<span class="ko">⚠ ${t("bot_codice", {c: a.esito})}</span>`;
}
function disegnaBot(){
  const el = document.getElementById("botTesta"); if (!el) return;
  el.className = "";
  const B = BOT.dati;
  if (!B.configurato) {
    el.innerHTML = `<div class="blocco"><h3 style="margin-top:0">📈 ${t("sez_bot")}</h3><p class="tenue">${t("bot_non_config")}</p>${campoCartellaBot(B.cartella)}</div>`;
    document.getElementById("botReport").innerHTML = "";
    return;
  }
  const mod = {simula: `🧪 ${t("bot_simula")}`, demo: `🎮 ${t("bot_demo")}`, reale: `⚠ <span class="ko">${t("bot_reale")}</span>`}[B.modalita] || B.modalita;
  const S = B.scopritore;
  const giri = (B.attivita || []).map(a => `<div class="bot-giro"><b>${esc(a.nome)}</b>
      <div class="tenue">${t("bot_ultimo")}: ${quandoTxt(a.ultimo)} · ${esitoAttivita(a)}</div>
      <div class="tenue">${t("bot_prossimo")}: ${quandoTxt(a.prossimo)}${a.stato === "Disabled" ? ` · <span class="ko">${t("bot_disattivato")}</span>` : ""}</div></div>`).join("")
    || `<span class="tenue">${t("bot_nessun_giro")}</span>`;
  const errori = [[B.errore, t("bot_err_bot")], [B.errore_scopritore, t("bot_err_scop")]].filter(x => x[0])
    .map(([e, tit]) => `<div class="blocco bot-errore"><b>⚠ ${tit}</b><pre>${esc(e)}</pre></div>`).join("");
  const L = B.lavoro || {};
  const uscita = L.comando ? `<div class="blocco"><div class="tit-graf">${t("bot_cmd_" + L.comando)} ${L.in_corso ? `<span class="tenue">· ⏳ ${t("bot_lavora")}</span>` : L.codice === 0 ? `<span class="ok">· ✓</span>` : `<span class="ko">· ⚠ ${t("bot_fallito")}</span>`}</div>
      <pre class="bot-uscita">${esc(L.uscita || (L.in_corso ? "…" : t("bot_nessuna_uscita")))}</pre></div>` : "";
  el.innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="tenue">${t("bot_modalita")}</div><div class="num piccolo">${mod}</div><div class="tenue">${t("bot_strategia")}: ${esc(B.strategia || "—")}</div></div>
      <div class="tile"><div class="tenue">${t("bot_capitale")}</div><div class="num">${B.capitale != null ? B.capitale.toLocaleString(LOCALE(), {maximumFractionDigits: 0}) + " €" : "—"}</div>
        <div class="tenue">${variazione(B.capitale, B.capitale_inizio)} ${t("bot_dall_inizio")} · ${t("bot_posizioni", {n: B.posizioni ?? "—"})}</div></div>
      <div class="tile"><div class="tenue">${t("bot_scopritore")}</div><div class="num">${S ? S.valore.toLocaleString(LOCALE(), {maximumFractionDigits: 0}) + " $" : "—"}</div>
        <div class="tenue">${S ? `${variazione(S.valore, S.capitale)} ${t("bot_dall_inizio")} · ${t("bot_posizioni", {n: S.posizioni})}` : ""}</div></div>
      <div class="tile"><div class="tenue">${t("bot_giri")}</div>${giri}</div>
    </div>
    ${B.bloccato ? `<div class="blocco bot-errore"><b>⛔ ${t("bot_bloccato")}</b></div>` : ""}
    ${errori}
    <div class="riga">
      <button class="b" onclick="comandoBot('confronto')" ${L.in_corso ? "disabled" : ""}>🔄 ${t("bot_cmd_confronto")}</button>
      <button class="b" onclick="comandoBot('prova')" ${L.in_corso ? "disabled" : ""}>👀 ${t("bot_cmd_prova")}</button>
      <button class="b" onclick="comandoBot('stato')" ${L.in_corso ? "disabled" : ""}>📋 ${t("bot_cmd_stato")}</button>
      <button class="b" onclick="api('/api/bot', {apri: true})">📂 ${t("bot_apri")}</button>
      <span class="tenue">${t("bot_cmd_info")}</span>
    </div>
    ${uscita}`;
  if (!document.getElementById("botFrame")) disegnaReport();
}
function disegnaReport(){
  const el = document.getElementById("botReport"); if (!el || !BOT.dati?.configurato) return;
  const R = BOT.dati.report || {};
  if (!R[BOT.report]) BOT.report = Object.keys(BOT_REPORT).find(k => R[k]) || "confronto";
  const schede = Object.keys(BOT_REPORT).map(k => `<button class="chip ${BOT.report === k ? "on" : ""}" ${R[k] ? "" : "disabled"} onclick="BOT.report='${k}';disegnaReport()">${t("bot_rep_" + k)}</button>`).join("");
  el.innerHTML = `<div class="filtri" style="margin-top:14px">${schede}<span class="spazio"></span>
      <span class="tenue">${R[BOT.report] ? t("bot_aggiornato", {q: quandoTxt(R[BOT.report])}) : ""}</span></div>
    ${R[BOT.report] ? `<iframe id="botFrame" class="bot-frame" src="/bot/report/${BOT_REPORT[BOT.report]}?v=${encodeURIComponent(R[BOT.report])}-${Date.now()}"></iframe>`
                    : `<div class="blocco vuoto">${t("bot_nessun_report")}</div>`}`;
}
async function comandoBot(c){
  const r = await api("/api/bot", {esegui: c});
  if (r.ok === false) return toast(tS(r.messaggio));
  BOT.eraInCorso = true;
  caricaBot();
}
function campoCartellaBot(valore){
  return `<div class="riga"><input id="botCartella" style="flex:1;min-width:260px" placeholder="C:\\...\\Bot trading" value="${esc(valore || "")}">
    <button class="b p" onclick="salvaCartellaBot()">${t("salva")}</button></div>`;
}
async function salvaCartellaBot(){
  const r = await api("/api/bot", {cartella: document.getElementById("botCartella").value});
  if (r.ok === false) return toast(tS(r.messaggio));
  toast(t("salvato"));
  await carica();
}
