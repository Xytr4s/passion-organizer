// Schede "Serie TV" e "Anime": tracker di episodi, stagioni, completate e droppate.

let M = {titoli: [], da_confermare: []};
const FM = {stato: "", testo: "", ord: "aggiornato"};
const STATI_MEDIA = ["in_corso", "da_vedere", "in_pausa", "completata", "droppata"];

async function caricaMedia(){ M = await api("/api/media"); }

function stagioneAttuale(t){
  return t.stagioni.find(s => s.stato !== "completata" && s.stato !== "droppata") || t.stagioni[t.stagioni.length-1];
}
const t_ = (k, p) => t(k, p);   // alias della funzione di traduzione
function progressoTxt(x){
  const s = stagioneAttuale(x); if (!s) return "";
  if (x.tipo === "film") return t_("st_" + x.stato);
  const tot = s.episodi_totali ? `/${s.episodi_totali}` : "";
  return (x.stagioni.length > 1 || x.categoria === "serie" ? `S${s.numero} · ` : "") + `${t_("ep")} ${s.visti}${tot}`;
}

function vMediaGenerica(categoria){
  setTimeout(async () => { await caricaMedia(); disegnaMedia(categoria); });
  return `<div id="zonaMedia" class="vuoto">…</div>`;
}
function vSerie(){ return vMediaGenerica("serie"); }
function vAnime(){ return vMediaGenerica("anime"); }

function disegnaMedia(categoria){
  const el = document.getElementById("zonaMedia"); if (!el) return;
  el.className = "";
  const tutti = M.titoli.filter(x => x.categoria === categoria);
  const conteggi = Object.fromEntries(STATI_MEDIA.map(s => [s, tutti.filter(x => x.stato === s).length]));
  const q = FM.testo.toLowerCase();
  let lista = tutti.filter(x => (!FM.stato || x.stato === FM.stato) &&
    (!q || [x.titolo, x.titolo_originale, ...(x.alias||[])].some(n => (n||"").toLowerCase().includes(q))));
  const ord = {aggiornato:(a,b)=>(b.aggiornato||"").localeCompare(a.aggiornato||""), titolo:(a,b)=>a.titolo.localeCompare(b.titolo),
               voto:(a,b)=>(b.voto||0)-(a.voto||0), anno:(a,b)=>(b.anno||0)-(a.anno||0)};
  lista.sort(ord[FM.ord]);
  const inbox = M.da_confermare.filter(v => !v.categoria || v.categoria === categoria);
  el.innerHTML = `
    <div class="filtri">
      <button class="b p" onclick="apriAggiungi('${categoria}')">${t_("m_aggiungi")}</button>
      <input placeholder="${t_("cerca")}" value="${esc(FM.testo)}" oninput="FM.testo=this.value;disegnaMedia('${categoria}')" style="min-width:200px">
      <select onchange="FM.ord=this.value;disegnaMedia('${categoria}')">${[["aggiornato","m_o_agg"],["titolo","m_o_titolo"],["voto","m_o_voto"],["anno","m_o_anno"]]
        .map(([v,k])=>`<option value="${v}" ${FM.ord===v?"selected":""}>${t_(k)}</option>`).join("")}</select>
    </div>
    <div class="filtri">
      <button class="chip ${FM.stato===""?"on":""}" onclick="FM.stato='';disegnaMedia('${categoria}')">${t_("m_tutti")} ${tutti.length}</button>
      ${STATI_MEDIA.map(s=>`<button class="chip st-${s} ${FM.stato===s?"on":""}" onclick="FM.stato='${s}';disegnaMedia('${categoria}')">${t_("st_"+s)} ${conteggi[s]}</button>`).join("")}
    </div>
    ${inbox.length ? `<div class="blocco"><b>${t_("m_inbox")} (${inbox.length})</b> <span class="tenue">${t_("m_inbox_info")}</span>
      ${inbox.map(v => `<div class="riga"><span><b>${esc(v.titolo)}</b> ${v.stagione?`S${v.stagione} `:""}${t_("ep")} ${v.episodio}
        <span class="tenue">· ${esc(v.pagina||"")}</span></span>
        <select id="col-${v.id}" style="max-width:220px"><option value="">${t_("m_collega_a")}</option>${tutti.map(x=>`<option value="${x.id}">${esc(x.titolo)}</option>`).join("")}</select>
        <button class="b" onclick="confermaVoce('${v.id}','${categoria}')">${t_("m_collega")}</button>
        <button class="b" onclick="apriAggiungi('${categoria}', ${esc(JSON.stringify(v.titolo))}, '${v.id}')">${t_("m_cerca_aggiungi")}</button>
        <button class="b k" onclick="scartaVoce('${v.id}','${categoria}')">✕</button></div>`).join("")}</div>` : ""}
    ${lista.length ? `<div class="griglia poster">${lista.map(cardMedia).join("")}</div>`
      : `<div class="vuoto">${tutti.length ? t_("m_nessuno_filtro") : t_("m_vuoto_"+categoria)}</div>`}`;
}

function cardMedia(x){
  const s = stagioneAttuale(x);
  const perc = s && s.episodi_totali ? Math.min(100, s.visti / s.episodi_totali * 100) : (x.stato==="completata"?100:0);
  const puo1 = s && x.tipo !== "film" && !(s.episodi_totali && s.visti >= s.episodi_totali);
  const iniz = esc(x.titolo.split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase());
  return `<div class="card st-${x.stato}" onclick="dettaglioMedia('${x.id}')">
    <div class="cop poster">${iniz}${x.copertina?`<img loading="lazy" src="${esc(x.copertina)}" onerror="this.remove()">`:""}</div>
    <div class="corpo">
      <div class="nome" title="${esc(x.titolo)}">${esc(x.titolo)}</div>
      <div class="meta"><span class="t st-${x.stato}">${t_("st_"+x.stato)}</span>${x.anno?`<span class="t">${x.anno}</span>`:""}
        ${x.tipo==="film"?`<span class="t">${t_("m_film")}</span>`:""}${x.voto?`<span class="t">★ ${x.voto}</span>`:""}</div>
      ${x.tipo!=="film" ? `<div class="tenue" style="font-size:12px">${progressoTxt(x)}</div>
        <div class="barra" style="height:5px"><div style="width:${perc}%;background:var(--ok)"></div></div>` : ""}
      <div class="azioni">${puo1?`<button class="b p" onclick="event.stopPropagation();piuUno('${x.id}',${s.numero})">+1 ${t_("ep")}</button>`:""}
        <button class="b" onclick="event.stopPropagation();dettaglioMedia('${x.id}')">${t_("m_dettagli")}</button></div>
    </div></div>`;
}

async function piuUno(id, stagione, delta=1){
  await api(`/api/media/${id}/episodio`, {stagione, delta});
  await caricaMedia(); disegnaMedia(vista); if (document.getElementById("modale").style.display==="flex") dettaglioMedia(id);
}

function dettaglioMedia(id){
  const x = M.titoli.find(y => y.id === id); if (!x) return;
  const opzStati = sel => STATI_MEDIA.map(s=>`<option value="${s}" ${sel===s?"selected":""}>${t_("st_"+s)}</option>`).join("");
  const voti = sel => `<option value="">–</option>` + [1,2,3,4,5,6,7,8,9,10].map(v=>`<option ${sel==v?"selected":""}>${v}</option>`).join("");
  modale(`
    <div style="display:flex;gap:14px;flex-wrap:wrap">
      <div style="width:140px"><div class="cop poster">${x.copertina?`<img src="${esc(x.copertina)}">`:""}</div></div>
      <div style="flex:1;min-width:240px">
        <h2 style="margin:0 0 4px">${esc(x.titolo)}</h2>
        <div class="tenue">${[x.titolo_originale && x.titolo_originale!==x.titolo ? esc(x.titolo_originale) : "", x.anno, t_("fonte_"+x.fonte)].filter(Boolean).join(" · ")}</div>
        <p class="tenue" style="max-height:110px;overflow:auto">${esc(x.trama||"")}</p>
        <div class="riga">${t_("m_voto")} <select onchange="salvaMedia('${id}',{voto:this.value?+this.value:null})">${voti(x.voto)}</select>
          <span class="t st-${x.stato}">${t_("st_"+x.stato)}</span></div>
      </div>
    </div>
    ${x.tipo === "film" ? `<div class="riga">${t_("m_stato")} <select onchange="salvaMedia('${id}',{stagione:1,stato:this.value,visti:this.value==='completata'?1:0})">${opzStati(x.stagioni[0].stato)}</select></div>` : `
    <h3>${t_("m_stagioni")}</h3>
    <table><tr><th>${t_("m_stagione")}</th><th>${t_("m_episodi")}</th><th>${t_("m_stato")}</th><th>${t_("m_voto")}</th><th></th><th>${t_("m_date")}</th></tr>
    ${x.stagioni.map(s => `<tr>
      <td><b>${s.numero}</b></td>
      <td><input type="number" min="0" value="${s.visti}" style="width:64px" onchange="salvaMedia('${id}',{stagione:${s.numero},visti:+this.value})">
          / <input type="number" min="0" value="${s.episodi_totali??""}" placeholder="?" style="width:64px" onchange="salvaMedia('${id}',{stagione:${s.numero},episodi_totali:this.value?+this.value:null})"></td>
      <td><select onchange="salvaMedia('${id}',{stagione:${s.numero},stato:this.value})">${opzStati(s.stato)}</select></td>
      <td><select onchange="salvaMedia('${id}',{stagione:${s.numero},voto:this.value?+this.value:null})">${voti(s.voto)}</select></td>
      <td style="white-space:nowrap"><button class="b" onclick="piuUno('${id}',${s.numero},-1)">−1</button>
        <button class="b p" onclick="piuUno('${id}',${s.numero},1)">+1</button>
        <button class="b" title="${t_("m_completa")}" onclick="salvaMedia('${id}',{stagione:${s.numero},stato:'completata',visti:${s.episodi_totali||s.visti}})">✔</button>
        <button class="b k" title="${t_("m_droppa")}" onclick="droppa('${id}',${s.numero},${s.visti})">✕</button>
        ${x.stagioni.length>1?`<button class="b" title="${t_("m_elimina_stagione")}" onclick="eliminaStagione('${id}',${s.numero})">🗑</button>`:""}</td>
      <td class="tenue" style="font-size:12px">${s.inizio||""}${s.fine?` → ${s.fine}`:""}</td></tr>`).join("")}
    </table>
    <div class="riga"><button class="b" onclick="nuovaStagione('${id}')">${t_("m_nuova_stagione")}</button></div>`}
    <h3>${t_("m_note")}</h3>
    <textarea rows="3" style="width:100%" onchange="salvaMedia('${id}',{note:this.value})">${esc(x.note||"")}</textarea>
    <h3>${t_("m_alias")}</h3>
    <p class="tenue" style="margin:0 0 6px">${t_("m_alias_info")}</p>
    <input style="width:100%" value="${esc((x.alias||[]).join(", "))}" onchange="salvaMedia('${id}',{alias:this.value.split(',').map(a=>a.trim()).filter(Boolean)})">
    <div class="riga" style="justify-content:space-between;margin-top:14px">
      <button class="b k" onclick="eliminaMedia('${id}')">${t_("m_elimina")}</button>
      <button class="b" onclick="chiudiModale()">${t_("chiudi")}</button></div>`);
}

async function salvaMedia(id, campi){
  await api(`/api/media/${id}/modifica`, campi);
  await caricaMedia(); disegnaMedia(vista); dettaglioMedia(id);
}
function droppa(id, stagione, visti){
  const ep = prompt(t_("m_droppa_chiedi"), visti);
  if (ep === null) return;
  salvaMedia(id, {stagione, stato:"droppata", visti: Math.max(0, parseInt(ep)||0)});
}
async function nuovaStagione(id){
  const n = prompt(t_("m_episodi_nuova"), "");
  if (n === null) return;
  await api(`/api/media/${id}/stagione`, {episodi_totali: n ? +n : null});
  await caricaMedia(); disegnaMedia(vista); dettaglioMedia(id);
}
async function eliminaStagione(id, numero){
  if (!confirm(t_("m_conferma_elimina_stagione"))) return;
  await api(`/api/media/${id}/stagione`, {elimina: numero});
  await caricaMedia(); disegnaMedia(vista); dettaglioMedia(id);
}
async function eliminaMedia(id){
  if (!confirm(t_("m_conferma_elimina"))) return;
  await api(`/api/media/${id}/elimina`, {});
  chiudiModale(); await caricaMedia(); disegnaMedia(vista);
}

// ---------------------------------------------------------------- aggiunta
function apriAggiungi(categoria, testo="", voce=""){
  modale(`<h2 style="margin-top:0">${t_("m_aggiungi_titolo_"+categoria)}</h2>
    <div class="riga"><input id="qMedia" value="${esc(testo)}" placeholder="${t_("m_cerca_titolo")}" style="flex:1"
      onkeydown="if(event.key==='Enter')cercaMedia('${categoria}','${voce}')">
      <button class="b p" onclick="cercaMedia('${categoria}','${voce}')">${t_("m_cerca")}</button></div>
    <p class="tenue" style="margin:4px 0">${t_(categoria==="anime"?"m_fonte_anime":"m_fonte_serie")}</p>
    <div id="risMedia"></div>
    <details style="margin-top:12px"><summary>${t_("m_manuale")}</summary>
      <div class="riga"><input id="manTitolo" placeholder="${t_("m_titolo")}" value="${esc(testo)}" style="flex:1">
        <select id="manTipo"><option value="serie">${t_("m_serie")}</option><option value="film">${t_("m_film")}</option></select></div>
      <div class="riga">${t_("m_n_stagioni")} <input id="manStagioni" type="number" min="1" value="1" style="width:60px">
        ${t_("m_ep_per_stagione")} <input id="manEpisodi" type="number" min="0" placeholder="?" style="width:70px">
        <button class="b" onclick="aggiungiManuale('${categoria}','${voce}')">${t_("m_aggiungi_btn")}</button></div>
    </details>
    <div class="riga" style="justify-content:flex-end"><button class="b" onclick="chiudiModale()">${t_("chiudi")}</button></div>`);
  if (testo) cercaMedia(categoria, voce);
  setTimeout(() => document.getElementById("qMedia")?.focus(), 50);
}
let RISULTATI = [];
async function cercaMedia(categoria, voce){
  const q = document.getElementById("qMedia").value.trim(); if (!q) return;
  const el = document.getElementById("risMedia"); el.innerHTML = `<p class="tenue">${t_("m_cerco")}</p>`;
  const r = await api(`/api/media/cerca?categoria=${categoria}&q=${encodeURIComponent(q)}`);
  if (r.errore) { el.innerHTML = `<p class="ko">${esc(r.errore)}</p>`; return; }
  RISULTATI = r;
  el.innerHTML = r.length ? r.map((x,i) => `<div class="riga risultato" onclick="aggiungiRisultato(${i},'${voce}')">
      <div class="cop poster mini">${x.copertina?`<img src="${esc(x.copertina)}">`:""}</div>
      <div style="flex:1"><b>${esc(x.titolo)}</b> <span class="tenue">${x.anno||""} ${x.formato||""} ${x.rete||""}
        ${x.episodi?`· ${x.episodi} ${t_("ep")}`:""} ${x.lingua?`· ${x.lingua}`:""}</span>
        <div class="tenue" style="font-size:12px;max-height:36px;overflow:hidden">${esc(x.trama||"")}</div></div>
      <span class="b p">${t_("m_aggiungi_btn")}</span></div>`).join("") : `<p class="tenue">${t_("m_nessun_risultato")}</p>`;
}
async function aggiungiRisultato(i, voce){
  const scheda = RISULTATI[i];
  document.getElementById("risMedia").innerHTML = `<p class="tenue">${t_("m_aggiungo")}</p>`;
  if (voce) await api(`/api/media/conferma/${voce}`, {scheda});
  else await api("/api/media/aggiungi", scheda);
  chiudiModale(); await caricaMedia(); disegnaMedia(vista); toast(t_("m_aggiunto") + " " + scheda.titolo);
}
async function aggiungiManuale(categoria, voce){
  const titolo = document.getElementById("manTitolo").value.trim(); if (!titolo) return;
  const tipo = document.getElementById("manTipo").value;
  const n = Math.max(1, +document.getElementById("manStagioni").value || 1), ep = document.getElementById("manEpisodi").value;
  const scheda = {categoria, tipo, titolo, fonte:"manuale",
    stagioni: Array.from({length: tipo==="film" ? 1 : n}, (_, k) => ({numero:k+1, episodi_totali: tipo==="film" ? 1 : (ep ? +ep : null)}))};
  if (voce) await api(`/api/media/conferma/${voce}`, {scheda});
  else await api("/api/media/aggiungi", scheda);
  chiudiModale(); await caricaMedia(); disegnaMedia(vista);
}
async function confermaVoce(voce, categoria){
  const id = document.getElementById("col-"+voce).value;
  if (!id) return toast(t_("m_scegli_titolo"));
  await api(`/api/media/conferma/${voce}`, {id});
  await caricaMedia(); disegnaMedia(categoria);
}
async function scartaVoce(voce, categoria){
  await api(`/api/media/conferma/${voce}`, {scarta:true});
  await caricaMedia(); disegnaMedia(categoria);
}
