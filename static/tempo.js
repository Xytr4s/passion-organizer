// Cronometro (barra laterale e in alto), pagina Statistiche e pagina Sonno.
// Dati da /api/tempo/*: il tempo viene registrato dall'app in background (giochi in primo piano) e
// dall'estensione di Firefox (video in riproduzione).

// colori fissi per categoria (palette categorica validata per sfondo scuro, sempre nello stesso ordine)
const CAT_TEMPO = ["giochi", "serie", "film", "anime"];
const COL_TEMPO = {giochi: "#3987e5", serie: "#d95926", film: "#199e70", anime: "#c98500"};
const ICONE_TEMPO = {giochi: "🎮", serie: "📺", film: "🎬", anime: "⛩️"};

// ------------------------------------------------------------ formati
function durataTxt(s){
  s = Math.round(s || 0);
  if (s < 60) return s ? `${s}s` : "0m";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
function orologioTxt(s){
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`;
}
const oraTxt = ts => new Date(ts * 1000).toLocaleTimeString(LOCALE(), {hour: "2-digit", minute: "2-digit"});
// minuti dalle 18:00 -> "HH:MM"
const daSeraTxt = m => { const x = ((18 * 60 + Math.round(m)) % 1440 + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
const giornoBreve = iso => new Date(iso + "T12:00").toLocaleDateString(LOCALE(), {day: "numeric", month: "short"});
const giornoSett = i => t("sett_" + i);      // 0 = lunedì

// ------------------------------------------------------------ cronometro
const CRONO = {oggi: {}, in_corso: {}, delta: 0, letto: 0};
async function aggiornaCrono(){
  try {
    const r = await api("/api/tempo/oggi");
    CRONO.oggi = r.oggi; CRONO.in_corso = r.in_corso; CRONO.delta = r.ora - Date.now() / 1000; CRONO.letto = Date.now() / 1000;
  } catch (e) {}
  disegnaCrono();
}
// tempo di oggi della categoria, contando anche i secondi passati dall'ultimo aggiornamento se è in corso
function tempoOggi(c){
  const ic = CRONO.in_corso[c];
  return (CRONO.oggi[c] || 0) + (ic ? Math.min(20, Date.now() / 1000 - CRONO.letto) : 0);
}
function disegnaCrono(){
  for (const c of CAT_TEMPO) {
    const el = document.getElementById("crono-" + c);
    if (!el) continue;
    const s = tempoOggi(c);
    el.textContent = s >= 60 || CRONO.in_corso[c] ? durataTxt(s) : "";
    el.classList.toggle("vivo", !!CRONO.in_corso[c]);
  }
  const top = document.getElementById("crono");
  if (!top) return;
  const c = CAT_TEMPO.includes(sezione) ? sezione : null;
  const attivi = c ? (CRONO.in_corso[c] ? [c] : []) : CAT_TEMPO.filter(k => CRONO.in_corso[k]);
  const ora = Date.now() / 1000 + CRONO.delta;
  const vivi = attivi.map(k => {
    const x = CRONO.in_corso[k];
    return `<span class="crono-vivo" title="${esc(x.titolo)}"><span class="pallino" style="background:${COL_TEMPO[k]}"></span>${ICONE_TEMPO[k]} ${esc(x.titolo)} <b>${orologioTxt(ora - x.inizio)}</b></span>`;
  }).join("");
  const totale = c ? tempoOggi(c) : CAT_TEMPO.reduce((a, k) => a + tempoOggi(k), 0);
  top.innerHTML = `${vivi}<button class="crono-oggi" onclick="vaiSezione('statistiche')" title="${esc(t("crono_vai_stat"))}">⏱ ${t("crono_oggi")} <b>${durataTxt(totale)}</b></button>`;
}
setInterval(() => { if (document.visibilityState === "visible") aggiornaCrono(); }, 15000);
setInterval(() => { if (Object.keys(CRONO.in_corso).length) disegnaCrono(); }, 1000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") aggiornaCrono(); });

// ------------------------------------------------------------ grafici (SVG disegnato a mano)
// Ogni segno ha data-tt (testo del suggerimento); un unico riquadro #ttip segue il mouse.
function suggerimento(ev){
  const tt = document.getElementById("ttip");
  const el = ev.target.closest("[data-tt]");
  if (!el) { tt.style.display = "none"; return; }
  tt.innerHTML = el.getAttribute("data-tt");
  tt.style.display = "block";
  const w = tt.offsetWidth, h = tt.offsetHeight;
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
  if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
  tt.style.left = x + "px"; tt.style.top = y + "px";
}
document.addEventListener("mousemove", suggerimento);

const larghezzaGrafico = id => Math.max(320, (document.getElementById(id)?.clientWidth || 700));
// rettangolo con gli angoli in alto arrotondati (estremità dei dati), base dritta sull'asse
function barra(x, y, w, h, r, attr){
  if (h <= 0 || w <= 0) return "";
  r = Math.min(r, w / 2, h);
  return `<path d="M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z" ${attr}/>`;
}
// valori "puliti" per le linee della griglia
function passiAsse(max, n = 4){
  if (max <= 0) return [0];
  const grezzo = max / n, p = Math.pow(10, Math.floor(Math.log10(grezzo)));
  const passo = [1, 2, 2.5, 5, 10].map(k => k * p).find(k => k >= grezzo);
  const r = [];
  for (let v = 0; v <= max + 1e-9; v += passo) r.push(v);
  if (r[r.length - 1] < max) r.push(r[r.length - 1] + passo);
  return r;
}
const legenda = cats => `<div class="legenda">${cats.map(c => `<span><i style="background:${COL_TEMPO[c]}"></i>${t("sez_" + c)}</span>`).join("")}</div>`;

// barre impilate per categoria; righe = [{etichetta, tt, valori:{cat:val}}]; formato = funzione per l'asse y
function graficoImpilato(id, righe, cats, {formato = v => v, altezza = 220, linea = null, etichetteOgni = 1} = {}){
  const W = larghezzaGrafico(id), H = altezza, sx = 46, dx = 8, su = 10, giu = 26;
  const tot = righe.map(r => cats.reduce((a, c) => a + (r.valori[c] || 0), 0));
  const max = Math.max(1, ...tot, ...(linea || []).filter(v => v != null));
  const asse = passiAsse(max), top = asse[asse.length - 1];
  const y = v => su + (H - su - giu) * (1 - v / top);
  const passo = (W - sx - dx) / Math.max(1, righe.length), bw = Math.max(2, Math.min(28, passo * 0.68));
  let s = asse.map(v => `<line x1="${sx}" x2="${W - dx}" y1="${y(v)}" y2="${y(v)}" class="griglia-l"/><text x="${sx - 6}" y="${y(v) + 4}" class="asse-t" text-anchor="end">${formato(v)}</text>`).join("");
  righe.forEach((r, i) => {
    const x = sx + passo * i + (passo - bw) / 2;
    let base = y(0);
    const presenti = cats.filter(c => r.valori[c] > 0);
    presenti.forEach((c, k) => {
      const alto = y(0) - y(r.valori[c]);
      const yy = base - alto;
      const gap = k ? 2 : 0;                                      // 2px di separazione tra i segmenti
      const attr = `fill="${COL_TEMPO[c]}"`;
      s += k === presenti.length - 1 ? barra(x, yy, bw, alto - gap, 3, attr) : `<rect x="${x}" y="${yy}" width="${bw}" height="${Math.max(0, alto - gap)}" ${attr}/>`;
      base = yy;
    });
    s += `<rect x="${sx + passo * i}" y="${su}" width="${passo}" height="${H - su - giu}" fill="transparent" data-tt="${esc(r.tt)}"/>`;
    if (i % etichetteOgni === 0) s += `<text x="${sx + passo * i + passo / 2}" y="${H - 8}" class="asse-t" text-anchor="middle">${esc(r.etichetta)}</text>`;
  });
  if (linea) {
    const pts = linea.map((v, i) => v == null ? null : `${sx + passo * i + passo / 2},${y(v)}`).filter(Boolean);
    if (pts.length > 1) s += `<polyline points="${pts.join(" ")}" class="media-l" pointer-events="none"/>`;
  }
  return `<svg width="${W}" height="${H}" class="grafico">${s}</svg>`;
}

// ------------------------------------------------------------ Statistiche
const ST = {giorni: 30, cats: new Set(CAT_TEMPO), dati: null, tabella: false, tabellaSett: false};
function vStatistiche(){
  setTimeout(caricaStatistiche);
  return `<div id="zonaStat" class="vuoto">…</div>`;
}
async function caricaStatistiche(){
  ST.dati = await api("/api/tempo/statistiche?giorni=" + ST.giorni);
  disegnaStatistiche();
}
function cambiaPeriodo(g){ ST.giorni = g; caricaStatistiche(); }
function cambiaCat(c){
  if (ST.cats.has(c) && ST.cats.size > 1) ST.cats.delete(c); else ST.cats.add(c);
  disegnaStatistiche();
}
// retta dei minimi quadrati sui totali giornalieri: pendenza in secondi al giorno
function pendenza(valori){
  const n = valori.length;
  if (n < 7) return null;
  const mx = (n - 1) / 2, my = valori.reduce((a, v) => a + v, 0) / n;
  let num = 0, den = 0;
  valori.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
  return den ? num / den : 0;
}
function disegnaStatistiche(){
  const el = document.getElementById("zonaStat"); if (!el) return;
  const D = ST.dati, cats = CAT_TEMPO.filter(c => ST.cats.has(c));
  el.className = "";
  const totGiorno = D.giorni.map(g => cats.reduce((a, c) => a + g[c], 0));
  const totale = totGiorno.reduce((a, v) => a + v, 0), n = D.giorni.length;
  const record = D.giorni.reduce((b, g, i) => totGiorno[i] > (b ? b.v : 0) ? {g, v: totGiorno[i]} : b, null);
  const media7 = totGiorno.map((_, i) => i < 6 ? null : totGiorno.slice(i - 6, i + 1).reduce((a, v) => a + v, 0) / 7);
  const p = pendenza(totGiorno);
  let trend = t("st_trend_pochi");
  if (p != null) {
    const sett = p * 7;
    trend = Math.abs(sett) < 300 ? t("st_trend_stabile") : t(sett > 0 ? "st_trend_su" : "st_trend_giu", {d: durataTxt(Math.abs(sett))});
  }
  const periodi = [[7, "7g"], [30, "30g"], [90, "90g"], [365, "1a"], [0, t("st_tutto")]];
  const filtri = `<div class="filtri">${periodi.map(([g, e]) => `<button class="chip ${ST.giorni === g ? "on" : ""}" onclick="cambiaPeriodo(${g})">${e}</button>`).join("")}
    <span class="tenue" style="margin:0 6px">·</span>
    ${CAT_TEMPO.map(c => `<button class="chip ${ST.cats.has(c) ? "on" : ""}" onclick="cambiaCat('${c}')"><i class="qd" style="background:${COL_TEMPO[c]}"></i>${t("sez_" + c)}</button>`).join("")}
    <span class="spazio"></span><span class="tenue">${D.registrato_dal ? t("st_dal", {d: giornoBreve(D.registrato_dal)}) : ""}</span></div>`;
  if (!D.registrato_dal) {
    el.innerHTML = filtri + `<div class="blocco vuoto">${t("st_vuoto")}</div>`;
    return;
  }
  const tiles = `<div class="tiles">
    <div class="tile"><div class="tenue">${t("st_totale")}</div><div class="num">${durataTxt(totale)}</div></div>
    <div class="tile"><div class="tenue">${t("st_media")}</div><div class="num">${durataTxt(totale / n)}</div></div>
    <div class="tile"><div class="tenue">${t("st_record")}</div><div class="num">${record ? durataTxt(record.v) : "—"}</div><div class="tenue">${record ? giornoBreve(record.g.data) : ""}</div></div>
    <div class="tile"><div class="tenue">${t("st_trend")}</div><div class="num piccolo">${trend}</div></div></div>`;

  el.innerHTML = filtri + tiles + bloccoSettimane(D, cats) + `
    <div class="blocco"><div class="tit-graf">${t("st_g_giorni")}</div><div class="tenue sotto">${t("st_g_giorni_info")}</div>${legenda(cats)}<div id="gGiorni"></div>
      <div class="riga"><button class="b" onclick="ST.tabella=!ST.tabella;disegnaStatistiche()">${t(ST.tabella ? "st_nascondi_tab" : "st_mostra_tab")}</button></div>
      ${ST.tabella ? tabellaGiorni(D, cats, totGiorno) : ""}</div>
    <div class="blocco"><div class="tit-graf">${t("st_g_ore")}</div><div class="tenue sotto">${t("st_g_ore_info")}</div>${legenda(cats)}<div id="gOre"></div></div>
    <div class="blocco"><div class="tit-graf">${t("st_g_mappa")}</div><div class="tenue sotto">${t("st_g_mappa_info")}</div><div id="gMappa"></div></div>
    <div class="blocco"><div class="tit-graf">${t("st_g_sera")}</div><div id="sottoSera" class="tenue sotto"></div><div id="gSera"></div></div>
    <div class="blocco"><div class="tit-graf">${t("st_g_titoli")}</div><div id="gTitoli"></div></div>`;

  const ogni = Math.ceil(n / Math.max(4, Math.floor(larghezzaGrafico("gGiorni") / 70)));
  const inOre = Math.max(...totGiorno) >= 3 * 3600, unita = inOre ? 3600 : 60;     // asse in ore o in minuti
  document.getElementById("gGiorni").innerHTML = graficoImpilato("gGiorni",
    D.giorni.map((g, i) => ({etichetta: giornoBreve(g.data), valori: Object.fromEntries(cats.map(c => [c, g[c] / unita])),
      tt: `<b>${giornoBreve(g.data)}</b> · ${durataTxt(totGiorno[i])}<br>` + cats.filter(c => g[c]).map(c => `${t("sez_" + c)}: ${durataTxt(g[c])}`).join("<br>")})),
    cats, {formato: v => inOre ? `${+v.toFixed(1)}h` : `${Math.round(v)}m`, linea: media7.map(v => v == null ? null : v / unita), etichetteOgni: ogni});

  // ore della giornata: minuti medi al giorno in ogni ora
  document.getElementById("gOre").innerHTML = graficoImpilato("gOre",
    Array.from({length: 24}, (_, h) => ({etichetta: h % 3 === 0 ? `${h}:00` : "",
      valori: Object.fromEntries(cats.map(c => [c, D.ore[c][h] / n / 60])),
      tt: `<b>${h}:00–${h + 1}:00</b><br>` + cats.map(c => `${t("sez_" + c)}: ${durataTxt(D.ore[c][h] / n)} ${t("st_al_giorno")}`).join("<br>")})),
    cats, {formato: v => `${Math.round(v)}m`, altezza: 200});

  document.getElementById("gMappa").innerHTML = mappaSettimana(D, cats);
  disegnaSerate(D, cats);
  document.getElementById("gTitoli").innerHTML = titoliTop(D, cats);
}

function tabellaGiorni(D, cats, tot){
  return `<div style="max-height:320px;overflow:auto;margin-top:8px"><table><tr><th>${t("st_data")}</th>${cats.map(c => `<th>${t("sez_" + c)}</th>`).join("")}<th>${t("st_totale")}</th></tr>
    ${D.giorni.map((g, i) => `<tr><td>${giornoBreve(g.data)}</td>${cats.map(c => `<td>${g[c] ? durataTxt(g[c]) : ""}</td>`).join("")}<td><b>${tot[i] ? durataTxt(tot[i]) : ""}</b></td></tr>`).reverse().join("")}</table></div>`;
}

// giorno della settimana × ora: minuti medi (scala di un solo colore, dal fondo al blu chiaro)
function mappaSettimana(D, cats){
  const conta = Array(7).fill(0);
  D.giorni.forEach(g => conta[new Date(g.data + "T12:00").getDay() === 0 ? 6 : new Date(g.data + "T12:00").getDay() - 1]++);
  const val = Array.from({length: 7}, (_, d) => Array.from({length: 24}, (_, h) => cats.reduce((a, c) => a + D.settimana[c][d][h], 0) / Math.max(1, conta[d])));
  const max = Math.max(1, ...val.flat());
  const W = larghezzaGrafico("gMappa"), sx = 44, cw = (W - sx - 8) / 24, ch = 22, H = 7 * ch + 24;
  const rampa = ["#1f2840", "#1c3a66", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#b7d3f6"];
  let s = "";
  val.forEach((riga, d) => {
    s += `<text x="${sx - 6}" y="${d * ch + ch / 2 + 4}" class="asse-t" text-anchor="end">${giornoSett(d)}</text>`;
    riga.forEach((v, h) => {
      const k = v <= 0 ? -1 : Math.min(rampa.length - 1, Math.floor(Math.sqrt(v / max) * rampa.length));
      s += `<rect x="${sx + h * cw + 1}" y="${d * ch + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" fill="${k < 0 ? "var(--pan2)" : rampa[k]}" data-tt="<b>${giornoSett(d)} ${h}:00–${h + 1}:00</b><br>${durataTxt(v)} ${t("st_in_media")}"/>`;
    });
  });
  for (let h = 0; h < 24; h += 3) s += `<text x="${sx + h * cw + cw / 2}" y="${7 * ch + 16}" class="asse-t" text-anchor="middle">${h}</text>`;
  return `<svg width="${W}" height="${H}" class="grafico">${s}</svg>
    <div class="legenda"><span class="tenue">${t("st_meno")}</span>${rampa.map(c => `<i style="background:${c};width:18px"></i>`).join("")}<span class="tenue">${t("st_piu")}</span></div>`;
}

// fine serata: per ogni sera l'ora dell'ultima attività (giochi/video scelti), raggruppata per giorno della settimana
function disegnaSerate(D, cats){
  const per = Array.from({length: 7}, () => []);
  for (const s of D.serate) {
    const m = Math.max(...cats.map(c => s[c] || 0));
    if (m > 0) { const g = new Date(s.data + "T12:00").getDay(); per[g === 0 ? 6 : g - 1].push({m, data: s.data}); }
  }
  const medie = per.map(l => l.length ? l.reduce((a, x) => a + x.m, 0) / l.length : null);
  const tutte = per.flat();
  const sotto = document.getElementById("sottoSera");
  if (!tutte.length) { sotto.textContent = t("st_sera_vuoto"); return; }
  // il giorno in cui si finisce più tardi, rispetto alla media degli altri
  const idx = medie.reduce((b, v, i) => v != null && (b < 0 || v > medie[b]) ? i : b, -1);
  const altri = per.flatMap((l, i) => i === idx ? [] : l);
  const mediaAltri = altri.length ? altri.reduce((a, x) => a + x.m, 0) / altri.length : null;
  sotto.innerHTML = t("st_sera_info") + (idx >= 0 && mediaAltri != null && medie[idx] - mediaAltri >= 20
    ? " " + t("st_sera_picco", {g: giornoSett(idx), o: daSeraTxt(medie[idx]), d: durataTxt((medie[idx] - mediaAltri) * 60)}) : "");
  const W = larghezzaGrafico("gSera"), H = 260, sx = 50, su = 10, giu = 24;
  // asse verticale: dall'ora intera prima della sera più corta a quella dopo la più lunga (le ore tarde in basso)
  const min = Math.max(0, Math.floor((Math.min(...tutte.map(x => x.m)) - 30) / 60) * 60);
  const max = Math.max(min + 180, Math.ceil((Math.max(...tutte.map(x => x.m)) + 20) / 60) * 60);
  const y = m => su + (H - su - giu) * (m - min) / (max - min);
  const cw = (W - sx - 8) / 7;
  let s = "";
  for (let m = min; m <= max; m += 60) s += `<line x1="${sx}" x2="${W - 8}" y1="${y(m)}" y2="${y(m)}" class="griglia-l"/>` + ((max - min > 360 ? m % 120 === 0 : true) ? `<text x="${sx - 6}" y="${y(m) + 4}" class="asse-t" text-anchor="end">${daSeraTxt(m)}</text>` : "");
  per.forEach((l, d) => {
    const cx = sx + cw * d + cw / 2;
    l.forEach((x, k) => {
      const dx = ((k * 37) % 21 - 10) * Math.min(1, cw / 60);                                 // piccolo spostamento per non sovrapporre i punti
      s += `<circle cx="${cx + dx}" cy="${y(x.m)}" r="4.5" fill="#3987e5" fill-opacity=".55" stroke="var(--pan)" stroke-width="1.5" data-tt="<b>${giornoBreve(x.data)}</b><br>${t("st_fine")} ${daSeraTxt(x.m)}"/>`;
    });
    if (medie[d] != null) s += `<line x1="${cx - cw * 0.3}" x2="${cx + cw * 0.3}" y1="${y(medie[d])}" y2="${y(medie[d])}" stroke="${d === idx ? "#e7e9ef" : "#9aa1b5"}" stroke-width="3" stroke-linecap="round" data-tt="<b>${giornoSett(d)}</b><br>${t("st_media_fine")} ${daSeraTxt(medie[d])} (${l.length} ${t("st_sere")})"/>`;
    s += `<text x="${cx}" y="${H - 6}" class="asse-t" text-anchor="middle" ${d === idx ? 'style="fill:var(--testo);font-weight:600"' : ""}>${giornoSett(d)}</text>`;
  });
  document.getElementById("gSera").innerHTML = `<svg width="${W}" height="${H}" class="grafico">${s}</svg>`;
}

function titoliTop(D, cats){
  const l = D.titoli.filter(x => cats.includes(x.categoria)).slice(0, 15);
  if (!l.length) return `<div class="tenue">—</div>`;
  const max = l[0].secondi;
  return l.map(x => `<div class="riga-titolo" data-tt="<b>${esc(x.titolo)}</b><br>${durataTxt(x.secondi)} · ${x.sessioni} ${t("st_sessioni")}<br>${t("st_ultima")} ${new Date(x.ultimo * 1000).toLocaleDateString(LOCALE())}">
      <span class="nome-t">${ICONE_TEMPO[x.categoria]} ${esc(x.titolo)}</span>
      <span class="barra-t"><span style="width:${(x.secondi / max * 100).toFixed(1)}%;background:${COL_TEMPO[x.categoria]}"></span></span>
      <span class="val-t">${durataTxt(x.secondi)}</span></div>`).join("");
}

// ------------------------------------------------------------ la settimana come scala
// Ogni settimana è una barra lunga 168 ore: giochi, serie, film e anime, poi il resto del tempo da sveglio,
// il sonno e (per la settimana in corso) le ore che devono ancora passare. Le percentuali sono sul tempo da sveglio.
const COL_SONNO = "#4b5468";
const perc = x => !isFinite(x) ? "—" : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const fineSett = iso => { const d = new Date(iso + "T12:00"); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); };
function bloccoSettimane(D, cats){
  const W = (D.settimane || []).slice().reverse();          // la più recente in alto
  if (!W.length) return "";
  const cur = W[0], totCur = cats.reduce((a, c) => a + cur[c], 0);
  const tiles = `<div class="tiles">${cats.map(c => `<div class="tile"><div class="tenue"><i class="qd" style="background:${COL_TEMPO[c]}"></i>${t("sez_" + c)}</div>
      <div class="num">${durataTxt(cur[c])}</div><div class="tenue">${perc(cur[c] / cur.sveglio)} ${t("st_del_sveglio")}</div></div>`).join("")}
    <div class="tile"><div class="tenue">${t("st_totale")}</div><div class="num">${durataTxt(totCur)}</div><div class="tenue">${perc(totCur / cur.sveglio)} ${t("st_del_sveglio")} · ${perc(totCur / cur.durata)} ${t("st_della_sett")}</div></div></div>`;
  const righe = W.map(w => {
    const tot = cats.reduce((a, c) => a + w[c], 0);
    const pezzi = [...cats.map(c => [w[c], COL_TEMPO[c], ""]),
      [Math.max(0, w.sveglio - tot), "var(--pan2)", ""],
      [w.sonno, COL_SONNO, ""],
      [w.durata - w.trascorse, "transparent", "futuro"]].filter(x => x[0] > 0);
    const tt = `<b>${giornoBreve(w.inizio)} – ${giornoBreve(fineSett(w.inizio))}</b><br>` +
      cats.map(c => `${t("sez_" + c)}: ${durataTxt(w[c])} (${perc(w[c] / w.sveglio)})`).join("<br>") +
      `<br><b>${t("st_totale")}: ${durataTxt(tot)}</b> · ${perc(tot / w.sveglio)} ${t("st_del_sveglio")}` +
      `<br>${t("st_sonno_lbl")}: ${durataTxt(w.sonno)}${w.notti_note < w.notti ? ` (${t("st_notti_stimate", {n: w.notti - w.notti_note})})` : ""}` +
      `<br>${t("st_altro_sveglio")}: ${durataTxt(Math.max(0, w.sveglio - tot))}` +
      (w.trascorse < w.durata ? `<br>${t("st_futuro")}: ${durataTxt(w.durata - w.trascorse)}` : "");
    return `<div class="sett-riga" data-tt="${esc(tt)}"><span class="sett-et">${giornoBreve(w.inizio)}</span>
      <span class="sett-barra">${pezzi.map(([v, col, cl]) => `<i class="${cl}" style="width:${(v / w.durata * 100).toFixed(2)}%;background:${col}"></i>`).join("")}</span>
      <span class="sett-val"><b>${durataTxt(tot)}</b> <span class="tenue">${perc(tot / w.sveglio)}</span></span></div>`;
  }).join("");
  const tabella = ST.tabellaSett ? `<div style="max-height:320px;overflow:auto;margin-top:8px"><table><tr><th>${t("st_sett_col")}</th>${cats.map(c => `<th>${t("sez_" + c)}</th>`).join("")}<th>${t("st_totale")}</th><th>${t("st_perc_sveglio")}</th><th>${t("st_perc_sett")}</th><th>${t("st_sonno_lbl")}</th></tr>
    ${W.map(w => { const tot = cats.reduce((a, c) => a + w[c], 0);
      return `<tr><td>${giornoBreve(w.inizio)} – ${giornoBreve(fineSett(w.inizio))}</td>${cats.map(c => `<td>${w[c] ? durataTxt(w[c]) : ""}</td>`).join("")}<td><b>${durataTxt(tot)}</b></td><td>${perc(tot / w.sveglio)}</td><td>${perc(tot / w.durata)}</td><td>${durataTxt(w.sonno)}</td></tr>`; }).join("")}</table></div>` : "";
  return `<div class="blocco"><div class="tit-graf">${t("st_g_sett")}</div><div class="tenue sotto">${t("st_g_sett_info")}</div>
    <div class="tenue sotto" style="margin-top:10px">${t("st_questa_sett")}</div>${tiles}
    <div class="legenda" style="margin-top:12px">${cats.map(c => `<span><i style="background:${COL_TEMPO[c]}"></i>${t("sez_" + c)}</span>`).join("")}
      <span><i style="background:var(--pan2);border:1px solid var(--bordo)"></i>${t("st_altro_sveglio")}</span><span><i style="background:${COL_SONNO}"></i>${t("st_sonno_lbl")}</span>
      <span><i class="futuro"></i>${t("st_futuro")}</span></div>
    <div class="sett-scala"><span class="sett-et"></span><span class="sett-assi">${["", ...Array.from({length: 7}, (_, d) => giornoSett(d))].slice(1).map(g => `<span>${g}</span>`).join("")}</span><span class="sett-val"></span></div>
    ${righe}
    <div class="riga"><button class="b" onclick="ST.tabellaSett=!ST.tabellaSett;disegnaStatistiche()">${t(ST.tabellaSett ? "st_nascondi_tab" : "st_mostra_tab")}</button></div>${tabella}</div>`;
}

// ------------------------------------------------------------ promemoria dell'ora di stop (pagina Sonno)
function bloccoPromemoria(D){
  const P = D.promemoria; if (!P) return "";
  const esito = D.esito || [];
  const entro = esito.filter(e => e.chiuso && e.minuti_dopo <= 15).length, chiuse = esito.filter(e => e.chiuso).length;
  const righe = esito.slice().reverse().map(e => `<tr><td>${t("sn_sera_di", {g: giornoSett(e.settimana)})} ${giornoBreve(e.sera)}</td>
      <td>${oraTxt(e.avviso)}</td><td>${e.chiuso ? oraTxt(e.chiuso) : `<span class="tenue">${t("pr_in_corso")}</span>`}</td>
      <td>${e.chiuso ? (e.minuti_dopo <= 15 ? `✓ ` : "") + `+${durataTxt(e.minuti_dopo * 60)}` : ""}</td><td>${e.rimandato || ""}</td></tr>`).join("");
  return `<div class="blocco"><div class="tit-graf">⏰ ${t("pr_titolo")}</div><div class="tenue sotto">${t("pr_info")}</div>
    <div class="riga" style="gap:14px">
      <label><input type="checkbox" ${P.attivo ? "checked" : ""} onchange="salvaPromemoria({attivo: this.checked})"> ${t("pr_attivo")}</label>
      <label class="tenue">${t("pr_ora")} <select onchange="salvaPromemoria({ora: this.value === 'auto' ? '' : SN.dati.promemoria.stop})">
        <option value="auto" ${P.automatica ? "selected" : ""}>${t("pr_auto")}</option><option value="fissa" ${P.automatica ? "" : "selected"}>${t("pr_fissa")}</option></select></label>
      ${P.automatica ? `<span><b>${P.stop}</b> <span class="tenue">${P.sveglia ? t("pr_auto_come", {s: P.sveglia, o: P.obiettivo}) : t("pr_auto_pochi")}</span></span>`
                     : `<input type="time" value="${P.ora}" onchange="salvaPromemoria({ora: this.value})">`}
      <button class="b" onclick="api('/api/tempo/promemoria', {prova: true})">${t("pr_prova")}</button></div>
    <div class="tit-graf" style="margin-top:14px;font-size:14px">${t("pr_esito")}</div>
    ${esito.length ? `<div class="tenue sotto">${t("pr_riassunto", {n: entro, m: chiuse})}</div>
      <table><tr><th>${t("sn_notte")}</th><th>${t("pr_avviso")}</th><th>${t("pr_chiuso")}</th><th>${t("pr_dopo")}</th><th>${t("pr_rimandato")}</th></tr>${righe}</table>`
      : `<div class="tenue">${t("pr_esito_vuoto")}</div>`}</div>`;
}
async function salvaPromemoria(dati){
  const r = await api("/api/tempo/promemoria", dati);
  if (r.ok === false) return toast(tS(r.messaggio));
  caricaSonno();
}

// ------------------------------------------------------------ Sonno
const SN = {giorni: 30, dati: null, modifica: null};
function vSonno(){
  setTimeout(caricaSonno);
  return `<div id="zonaSonno" class="vuoto">…</div>`;
}
async function caricaSonno(){
  SN.dati = await api("/api/tempo/sonno?giorni=" + SN.giorni);
  disegnaSonno();
}
const minDaSera = (ts, data) => (ts - new Date(data + "T00:00").getTime() / 1000) / 60 + 6 * 60;   // minuti dalle 18:00 della sera prima
const mediaDi = l => l.length ? l.reduce((a, v) => a + v, 0) / l.length : null;

function disegnaSonno(){
  const el = document.getElementById("zonaSonno"); if (!el) return;
  el.className = "";
  const D = SN.dati, ob = D.obiettivo;
  const notti = D.notti.filter(n => n.ore != null);
  const ultime7 = D.notti.slice(-7).filter(n => n.ore != null);
  const debito = ultime7.reduce((a, n) => a + Math.max(0, ob - n.ore), 0);
  const sotto = notti.filter(n => n.ore < ob).length;
  const lettoMedio = mediaDi(notti.map(n => minDaSera(n.letto, n.data)));
  const svegliaMedia = mediaDi(notti.map(n => minDaSera(n.sveglia, n.data)));
  const periodi = [[14, "14g"], [30, "30g"], [90, "90g"], [365, "1a"]];
  const filtri = `<div class="filtri">${periodi.map(([g, e]) => `<button class="chip ${SN.giorni === g ? "on" : ""}" onclick="SN.giorni=${g};caricaSonno()">${e}</button>`).join("")}
    <span class="spazio"></span><label class="tenue">${t("sn_obiettivo")} <input type="number" min="4" max="12" step="0.25" value="${ob}" style="width:70px" onchange="salvaObiettivo(this.value)"> h</label></div>`;
  const info = `<div class="blocco tenue">${t("sn_come")}</div>`;
  if (!notti.length) {
    el.innerHTML = filtri + info + `<div class="blocco vuoto">${t("sn_vuoto")}</div>` + bloccoPromemoria(D) + listaNotti(D);
    return;
  }
  el.innerHTML = filtri + `<div class="tiles">
      <div class="tile"><div class="tenue">${t("sn_media7")}</div><div class="num">${ultime7.length ? durataTxt(mediaDi(ultime7.map(n => n.ore)) * 3600) : "—"}</div><div class="tenue">${t("sn_obiettivo_breve", {h: ob})}</div></div>
      <div class="tile"><div class="tenue">${t("sn_debito")}</div><div class="num">${durataTxt(debito * 3600)}</div><div class="tenue">${t("sn_ultime7")}</div></div>
      <div class="tile"><div class="tenue">${t("sn_sotto")}</div><div class="num">${sotto} / ${notti.length}</div><div class="tenue">${t("sn_notti_reg")}</div></div>
      <div class="tile"><div class="tenue">${t("sn_orari_medi")}</div><div class="num piccolo">${daSeraTxt(lettoMedio)} → ${daSeraTxt(svegliaMedia)}</div></div></div>
    ${consigli(D, notti, svegliaMedia)}
    ${bloccoPromemoria(D)}
    <div class="blocco"><div class="tit-graf">${t("sn_g_ore")}</div><div class="tenue sotto">${t("sn_g_ore_info")}</div>
      <div class="legenda"><span><i style="background:#3987e5"></i>${t("sn_manuale")}</span><span><i style="background:#3987e5;opacity:.45"></i>${t("sn_stima")}</span><span><i style="background:#e7e9ef;height:2px"></i>${t("sn_obiettivo")}</span></div><div id="gNotti"></div></div>
    <div class="blocco"><div class="tit-graf">${t("sn_g_orari")}</div><div class="tenue sotto">${t("sn_g_orari_info")}</div><div id="gOrari"></div></div>
    <div class="blocco"><div class="tit-graf">${t("sn_g_sett")}</div><div id="sottoSett" class="tenue sotto"></div><div id="gSett"></div></div>
    ${legami(notti, ob)}
    ${info}${listaNotti(D)}`;
  graficoNotti(D, ob);
  graficoOrari(D);
  graficoSettimanaSonno(notti, ob);
}

function graficoNotti(D, ob){
  const id = "gNotti", W = larghezzaGrafico(id), H = 220, sx = 40, su = 10, giu = 26;
  const top = Math.max(10, Math.ceil(Math.max(ob, ...D.notti.map(n => n.ore || 0)) + 1));
  const y = v => su + (H - su - giu) * (1 - v / top);
  const passo = (W - sx - 8) / D.notti.length, bw = Math.max(3, Math.min(26, passo * 0.68));
  const ogni = Math.ceil(D.notti.length / Math.max(4, Math.floor(W / 70)));
  let s = "";
  for (let v = 0; v <= top; v += 2) s += `<line x1="${sx}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}" class="griglia-l"/><text x="${sx - 6}" y="${y(v) + 4}" class="asse-t" text-anchor="end">${v}h</text>`;
  D.notti.forEach((n, i) => {
    const x = sx + passo * i + (passo - bw) / 2;
    if (n.ore != null) s += barra(x, y(n.ore), bw, y(0) - y(n.ore), 3, `fill="#3987e5" ${n.fonte === "stima" ? 'fill-opacity=".45"' : ""}`);
    const tt = n.ore != null ? `<b>${giornoSett(n.settimana)} → ${giornoBreve(n.data)}</b><br>${durataTxt(n.ore * 3600)} (${oraTxt(n.letto)} → ${oraTxt(n.sveglia)})<br>${t(n.fonte === "stima" ? "sn_stima" : "sn_manuale")}` : `<b>${giornoBreve(n.data)}</b><br>${t("sn_nessun_dato")}`;
    s += `<rect x="${sx + passo * i}" y="${su}" width="${passo}" height="${H - su - giu}" fill="transparent" data-tt="${esc(tt)}"/>`;
    if (i % ogni === 0) s += `<text x="${sx + passo * i + passo / 2}" y="${H - 8}" class="asse-t" text-anchor="middle">${giornoBreve(n.data)}</text>`;
  });
  s += `<line x1="${sx}" x2="${W - 8}" y1="${y(ob)}" y2="${y(ob)}" stroke="#e7e9ef" stroke-width="2" stroke-dasharray="6 4" pointer-events="none"/>`;
  document.getElementById(id).innerHTML = `<svg width="${W}" height="${H}" class="grafico">${s}</svg>`;
}

// barre "fluttuanti" da quando vai a letto a quando ti svegli, su un asse dalle 20 alle 14
function graficoOrari(D){
  const id = "gOrari", W = larghezzaGrafico(id), H = 240, sx = 46, su = 8, giu = 26;
  const da = 2 * 60, a = 20 * 60;                                     // minuti dalle 18: 20:00 → 14:00
  const y = m => su + (H - su - giu) * (Math.min(a, Math.max(da, m)) - da) / (a - da);
  const passo = (W - sx - 8) / D.notti.length, bw = Math.max(3, Math.min(20, passo * 0.6));
  const ogni = Math.ceil(D.notti.length / Math.max(4, Math.floor(W / 70)));
  let s = "";
  for (let m = da; m <= a; m += 120) s += `<line x1="${sx}" x2="${W - 8}" y1="${y(m)}" y2="${y(m)}" class="griglia-l"/><text x="${sx - 6}" y="${y(m) + 4}" class="asse-t" text-anchor="end">${daSeraTxt(m)}</text>`;
  D.notti.forEach((n, i) => {
    const x = sx + passo * i + (passo - bw) / 2;
    if (n.ore != null) {
      const l = minDaSera(n.letto, n.data), sv = minDaSera(n.sveglia, n.data);
      s += `<rect x="${x}" y="${y(l)}" width="${bw}" height="${Math.max(2, y(sv) - y(l))}" rx="3" fill="#3987e5" ${n.fonte === "stima" ? 'fill-opacity=".45"' : ""} data-tt="<b>${giornoSett(n.settimana)} → ${giornoBreve(n.data)}</b><br>${oraTxt(n.letto)} → ${oraTxt(n.sveglia)} · ${durataTxt(n.ore * 3600)}"/>`;
      if (n.ultimo_gioco) s += `<circle cx="${x + bw / 2}" cy="${y(minDaSera(n.ultimo_gioco, n.data))}" r="4" fill="#e7e9ef" stroke="var(--pan)" stroke-width="1.5" data-tt="${esc(t("sn_fine_gioco"))} ${oraTxt(n.ultimo_gioco)}"/>`;
    }
    if (i % ogni === 0) s += `<text x="${sx + passo * i + passo / 2}" y="${H - 8}" class="asse-t" text-anchor="middle">${giornoBreve(n.data)}</text>`;
  });
  document.getElementById(id).innerHTML = `<div class="legenda"><span><i style="background:#3987e5"></i>${t("sn_dormito")}</span><span><i style="background:#e7e9ef;border-radius:50%"></i>${t("sn_fine_gioco")}</span></div><svg width="${W}" height="${H}" class="grafico">${s}</svg>`;
}

function graficoSettimanaSonno(notti, ob){
  const per = Array.from({length: 7}, () => []);
  notti.forEach(n => per[n.settimana].push(n));
  const medie = per.map(l => mediaDi(l.map(n => n.ore)));
  const peggio = medie.reduce((b, v, i) => v != null && (b < 0 || v < medie[b]) ? i : b, -1);
  document.getElementById("sottoSett").innerHTML = peggio >= 0 && per[peggio].length >= 2
    ? t("sn_sett_peggio", {g: giornoSett(peggio), h: durataTxt(medie[peggio] * 3600), l: daSeraTxt(mediaDi(per[peggio].map(n => minDaSera(n.letto, n.data))))}) : t("sn_sett_info");
  const id = "gSett", W = larghezzaGrafico(id), H = 200, sx = 40, su = 10, giu = 26;
  const top = Math.max(10, Math.ceil(Math.max(ob, ...medie.filter(v => v != null)) + 1));
  const y = v => su + (H - su - giu) * (1 - v / top);
  const passo = (W - sx - 8) / 7, bw = Math.min(46, passo * 0.6);
  let s = "";
  for (let v = 0; v <= top; v += 2) s += `<line x1="${sx}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}" class="griglia-l"/><text x="${sx - 6}" y="${y(v) + 4}" class="asse-t" text-anchor="end">${v}h</text>`;
  medie.forEach((v, d) => {
    const x = sx + passo * d + (passo - bw) / 2;
    if (v != null) s += barra(x, y(v), bw, y(0) - y(v), 4, `fill="#3987e5" data-tt="<b>${t("sn_sera_di", {g: giornoSett(d)})}</b><br>${durataTxt(v * 3600)} ${t("st_in_media")} (${per[d].length} ${t("sn_notti")})"`);
    s += `<text x="${x + bw / 2}" y="${H - 8}" class="asse-t" text-anchor="middle" ${d === peggio ? 'style="fill:var(--testo);font-weight:600"' : ""}>${giornoSett(d)}</text>`;
  });
  s += `<line x1="${sx}" x2="${W - 8}" y1="${y(ob)}" y2="${y(ob)}" stroke="#e7e9ef" stroke-width="2" stroke-dasharray="6 4" pointer-events="none"/>`;
  document.getElementById(id).innerHTML = `<svg width="${W}" height="${H}" class="grafico">${s}</svg>`;
}

// cosa succede alle notti dopo le sere in cui si gioca fino a tardi
function legami(notti, ob){
  const tardi = notti.filter(n => n.ultimo_gioco && minDaSera(n.ultimo_gioco, n.data) >= 5.5 * 60);   // giocato dopo le 23:30
  const altre = notti.filter(n => !tardi.includes(n));
  const schermi = notti.filter(n => Object.values(n.prima || {}).reduce((a, v) => a + v, 0) >= 1800);  // ≥30 min di giochi/video nelle 2 ore prima
  const senza = notti.filter(n => !schermi.includes(n));
  const riga = (a, b, ta, tb) => {
    if (a.length < 2 || b.length < 2) return "";
    const da = mediaDi(a.map(n => n.ore)), db = mediaDi(b.map(n => n.ore));
    const la = mediaDi(a.map(n => minDaSera(n.letto, n.data))), lb = mediaDi(b.map(n => minDaSera(n.letto, n.data)));
    return `<tr><td>${ta} <span class="tenue">(${a.length})</span></td><td><b>${durataTxt(da * 3600)}</b></td><td>${daSeraTxt(la)}</td></tr>
            <tr><td>${tb} <span class="tenue">(${b.length})</span></td><td><b>${durataTxt(db * 3600)}</b></td><td>${daSeraTxt(lb)}</td></tr>
            <tr><td colspan="3" class="tenue">${t(da < db ? "sn_differenza_meno" : "sn_differenza_piu", {d: durataTxt(Math.abs(db - da) * 3600)})}</td></tr>`;
  };
  const corpo = riga(tardi, altre, t("sn_gioco_tardi"), t("sn_altre_sere")) + riga(schermi, senza, t("sn_schermi_prima"), t("sn_senza_schermi"));
  return `<div class="blocco"><div class="tit-graf">${t("sn_legami")}</div><div class="tenue sotto">${t("sn_legami_info")}</div>
    ${corpo ? `<table><tr><th></th><th>${t("sn_sonno_medio")}</th><th>${t("sn_letto_medio")}</th></tr>${corpo}</table>` : `<div class="tenue">${t("sn_legami_pochi")}</div>`}</div>`;
}

// da dove partire: orari consigliati calcolati dai tuoi dati (sveglia abituale - obiettivo)
// gli orari sono gli stessi del promemoria (calcolati dall'app: sveglia delle ultime 2 settimane - obiettivo - 1 ora)
function consigli(D, notti, svegliaMedia){
  const P = D.promemoria || {};
  const stop = P.stop || daSeraTxt(svegliaMedia - D.obiettivo * 60 - 60);
  const letto = P.letto || daSeraTxt(svegliaMedia - D.obiettivo * 60);
  return `<div class="blocco"><div class="tit-graf">${t("sn_consigli")}</div>
    <div class="tiles" style="margin:8px 0">
      <div class="tile"><div class="tenue">${t("sn_sveglia_abituale")}</div><div class="num">${P.sveglia || daSeraTxt(svegliaMedia)}</div></div>
      <div class="tile"><div class="tenue">${t("sn_letto_entro")}</div><div class="num">${letto}</div></div>
      <div class="tile"><div class="tenue">${t("sn_stop_schermi")}</div><div class="num">${stop}</div></div></div>
    <ul class="consigli">${[1, 2, 3, 4, 5].map(i => `<li>${t("sn_c" + i, {stop})}</li>`).join("")}</ul></div>`;
}

function listaNotti(D){
  const righe = D.notti.slice().reverse().slice(0, 21).map(n => {
    const m = n.manuale || {};
    const st = n.stima ? `${oraTxt(n.stima[0])} → ${oraTxt(n.stima[1])}` : "—";
    return `<tr><td>${t("sn_sera_di", {g: giornoSett(n.settimana)})} → ${giornoBreve(n.data)}</td><td class="tenue">${st}</td>
      <td><input type="time" id="l-${n.data}" value="${m.letto || ""}"> → <input type="time" id="s-${n.data}" value="${m.sveglia || ""}"></td>
      <td><button class="b" onclick="salvaNotte('${n.data}')">${t("salva")}</button>${n.manuale ? ` <button class="b" onclick="salvaNotte('${n.data}',true)">${t("sn_torna_stima")}</button>` : ""}</td>
      <td>${n.ore != null ? durataTxt(n.ore * 3600) : ""}</td></tr>`;
  }).join("");
  return `<div class="blocco"><div class="tit-graf">${t("sn_registro")}</div><div class="tenue sotto">${t("sn_registro_info")}</div>
    <table><tr><th>${t("sn_notte")}</th><th>${t("sn_stima_pc")}</th><th>${t("sn_orari_veri")}</th><th></th><th>${t("sn_dormito")}</th></tr>${righe}</table></div>`;
}
async function salvaNotte(data, cancella){
  const letto = cancella ? "" : document.getElementById("l-" + data).value, sveglia = cancella ? "" : document.getElementById("s-" + data).value;
  if (!cancella && (!letto || !sveglia)) return toast(t("sn_servono_orari"));
  const r = await api("/api/tempo/sonno", {data, letto, sveglia});
  if (r.ok === false) return toast(r.messaggio);
  caricaSonno();
}
async function salvaObiettivo(v){ await api("/api/tempo/sonno", {obiettivo: +v}); caricaSonno(); }

// ridisegna i grafici quando cambia la larghezza della finestra
let _ridimensiona;
addEventListener("resize", () => {
  clearTimeout(_ridimensiona);
  _ridimensiona = setTimeout(() => { if (sezione === "statistiche" && ST.dati) disegnaStatistiche(); if (sezione === "sonno" && SN.dati) disegnaSonno(); }, 200);
});
