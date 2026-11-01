// Impostazioni → Telefono: configurazione guidata della pagina su Google e sincronizzazione.

let TEL = null;

async function caricaTelefono(){
  TEL = await api("/api/telefono");
  disegnaTelefono();
}

function copia(testo){
  const fallback = () => {
    const a = document.createElement("textarea"); a.value = testo; document.body.appendChild(a);
    a.select(); document.execCommand("copy"); a.remove();
  };
  (navigator.clipboard ? navigator.clipboard.writeText(testo).catch(fallback) : Promise.resolve(fallback()))
    .then(() => toast(t("tel_copiato")));
}

function apriLink(url){ api("/api/apri_link", {url}); }

function disegnaTelefono(){
  const el = document.getElementById("telefono"); if (!el || !TEL) return;
  const stato = TEL.url
    ? `<p><span class="ok">● ${t("tel_collegato")}</span> <span class="tenue">· ${t("tel_ultima")}: ${TEL.ultima ? data(new Date(TEL.ultima)/1000) : t("tel_mai")}
        ${TEL.esito ? "· " + esc(TEL.esito) : ""}</span></p>
       <div class="riga"><button class="b p" onclick="sincronizzaOra()">${t("tel_sincronizza_ora")}</button>
         <button class="b" onclick="copia(TEL.link)">${t("tel_copia_link")}</button></div>
       <p class="tenue">${t("tel_link_info")}</p>
       <div class="percorso" style="user-select:all">${esc(TEL.link)}</div>`
    : `<p class="tenue">${t("tel_intro")}</p>`;
  el.innerHTML = stato + `
    <details ${TEL.url ? "" : "open"} style="margin-top:10px"><summary>${t(TEL.url ? "tel_riconfigura" : "tel_come")}</summary>
      <ol style="padding-left:20px;line-height:1.9">
        <li>${t("tel_p1")} <button class="b" onclick="apriLink('https://sheets.new')">${t("tel_apri_fogli")}</button></li>
        <li>${t("tel_p2")} <button class="b" onclick="copia(TEL.codice)">${t("tel_copia_codice")}</button></li>
        <li>${t("tel_p3")} <button class="b" onclick="copia(TEL.pagina)">${t("tel_copia_pagina")}</button></li>
        <li>${t("tel_p4")}</li>
        <li>${t("tel_p5")}
          <div class="riga"><input id="telUrl" value="${esc(TEL.url)}" placeholder="https://script.google.com/macros/s/…/exec" style="flex:1;min-width:0">
          <button class="b p" onclick="salvaTelefono()">${t("tel_salva")}</button></div></li>
        <li>${t("tel_p6")}</li>
      </ol>
    </details>`;
}

async function salvaTelefono(){
  const url = document.getElementById("telUrl").value.trim();
  const r = await api("/api/telefono", {url});
  if (r.ok === false) return toast(r.messaggio);
  await sincronizzaOra();
}

async function sincronizzaOra(){
  toast(t("tel_in_corso"));
  const r = await api("/api/telefono/sincronizza", {});
  toast(r.ok ? "✔ " + r.messaggio : "⚠ " + r.messaggio);
  await caricaTelefono();
  await caricaMedia();
}
