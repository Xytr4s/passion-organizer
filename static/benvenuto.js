// Configurazione guidata al primo avvio: lingua, cartelle dei giochi (trovate in automatico), oppure "solo serie/anime".

let SETUP = {cartelle: [], scelte: new Set(), steam: 0};

async function mostraBenvenuto(){
  if (!LINGUA_SCELTA_BENVENUTO) LINGUA = (navigator.language || "en").toLowerCase().startsWith("it") ? "it" : "en";
  modale(`<h2 style="margin-top:0">✨ ${t("bv_titolo")}</h2><p class="tenue">${t("bv_cerco")}</p>`);
  const r = await api("/api/setup/suggerimenti");
  SETUP.cartelle = r.cartelle; SETUP.steam = r.steam;
  SETUP.scelte = new Set(r.cartelle.map(c => c.percorso));
  disegnaBenvenuto();
}
let LINGUA_SCELTA_BENVENUTO = false;

function disegnaBenvenuto(){
  const box = document.getElementById("modale");
  box.onclick = null;                                  // la configurazione non si chiude cliccando fuori
  modale(`<h2 style="margin-top:0">✨ ${t("bv_titolo")}</h2>
    <p>${t("bv_intro")}</p>
    <div class="riga">🌐 <select onchange="LINGUA=this.value;LINGUA_SCELTA_BENVENUTO=true;disegnaBenvenuto()">
      ${Object.entries(LINGUE).map(([k, n]) => `<option value="${k}" ${LINGUA === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    <h3>🎮 ${t("bv_cartelle")}</h3>
    <p class="tenue">${t("bv_cartelle_info")}</p>
    ${SETUP.cartelle.length || SETUP.scelte.size ? [...new Set([...SETUP.cartelle.map(c => c.percorso), ...SETUP.scelte])].map(p => {
        const c = SETUP.cartelle.find(x => x.percorso === p);
        return `<label class="riga" style="margin:4px 0"><input type="checkbox" ${SETUP.scelte.has(p) ? "checked" : ""}
          onchange="this.checked ? SETUP.scelte.add(${esc(JSON.stringify(p))}) : SETUP.scelte.delete(${esc(JSON.stringify(p))})">
          <span class="percorso" style="font-size:13px">${esc(p)}</span>${c ? `<span class="tenue">· ${t("bv_n_cartelle", {n: c.giochi})}</span>` : ""}</label>`;
      }).join("") : `<p class="tenue">${t("bv_nessuna")}</p>`}
    <div class="riga"><input id="bvPercorso" placeholder="D:\\Games" style="flex:1">
      ${window.pywebview ? `<button class="b" onclick="sfogliaCartella()">${t("bv_sfoglia")}</button>` : ""}
      <button class="b" onclick="aggiungiCartellaBenvenuto()">${t("bv_aggiungi")}</button></div>
    ${SETUP.steam ? `<p class="ok">✔ ${t("bv_steam", {n: SETUP.steam})}</p>` : ""}
    <h3>📺 ⛩️ 🎬 ${t("bv_media")}</h3>
    <p class="tenue">${t("bv_media_info")}</p>
    <div class="riga" style="justify-content:space-between;margin-top:16px">
      <button class="b" onclick="completaBenvenuto(true)">${t("bv_salta")}</button>
      <button class="b p" onclick="completaBenvenuto(false)">${t("bv_inizia")}</button></div>`);
}
async function sfogliaCartella(){
  const p = await window.pywebview.api.scegli_cartella();
  if (p) { SETUP.scelte.add(p); disegnaBenvenuto(); }
}
function aggiungiCartellaBenvenuto(){
  const p = document.getElementById("bvPercorso").value.trim();
  if (p) { SETUP.scelte.add(p); disegnaBenvenuto(); }
}
async function completaBenvenuto(soloMedia){
  await api("/api/setup", {lingua: LINGUA, fonti: soloMedia ? [] : [...SETUP.scelte]});
  document.getElementById("modale").onclick = function(e){ if (e.target === this) chiudiModale(); };
  chiudiModale();
  if (soloMedia) sezione = "serie";
  await carica();
  controllaStato();
}
