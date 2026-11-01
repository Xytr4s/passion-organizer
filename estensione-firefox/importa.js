// Importa siti e impostazioni da un file creato con "Esporta su file".
const $ = id => document.getElementById(id);
const CATEGORIE = ["serie", "anime", "film"];
const NOMI = { serie: "Serie TV", anime: "Anime", film: "Film" };

function esito(html) { $("esito").innerHTML = html; }

$("file").onchange = async () => {
  const f = $("file").files[0];
  if (!f) return;
  let dati;
  try {
    dati = JSON.parse(await f.text());
  } catch (e) {
    esito('<span class="ko">Il file non è valido (non è un file esportato dall\'estensione).</span>');
    return;
  }
  const nuovi = (Array.isArray(dati.siti) ? dati.siti : [])
    .filter(s => s && typeof s.parola === "string" && s.parola.trim())
    .map(s => ({ parola: s.parola.trim().toLowerCase(), categoria: CATEGORIE.includes(s.categoria) ? s.categoria : "serie" }));
  if (!nuovi.length) {
    esito('<span class="ko">Nel file non ci sono siti.</span>');
    return;
  }
  const attuali = (await browser.storage.local.get({ siti: [] })).siti;
  const siti = $("sostituisci").checked ? [] : [...attuali];
  for (const s of nuovi) {
    const i = siti.findIndex(x => x.parola === s.parola);
    if (i >= 0) siti[i] = s; else siti.push(s);
  }
  const cambi = { siti };
  if (Number.isFinite(+dati.minuti) && +dati.minuti >= 1) cambi.minuti = Math.min(60, Math.round(+dati.minuti));
  if (dati.modalita === "auto" || dati.modalita === "conferma") cambi.modalita = dati.modalita;
  await browser.storage.local.set(cambi);
  const ul = document.createElement("ul");
  for (const s of siti) {
    const li = document.createElement("li");
    li.textContent = `${s.parola} · ${NOMI[s.categoria]}`;
    ul.appendChild(li);
  }
  esito('<div class="ok">✔ Importato. Siti seguiti ora:</div>');
  $("esito").appendChild(ul);
  const p = document.createElement("div");
  p.className = "tenue";
  p.textContent = "Puoi chiudere questa scheda. Ricarica le pagine dei siti già aperte.";
  $("esito").appendChild(p);
};
