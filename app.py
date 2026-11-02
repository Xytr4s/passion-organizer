"""PassionOrganizer: giochi, serie TV, film e anime in un'unica app locale (http://127.0.0.1:5577)."""

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

import operazioni
import scanner

import percorsi

BASE = percorsi.DATI            # dati dell'utente
RISORSE = percorsi.RISORSE      # file del programma (interfaccia, modelli)
PORTA = 5577
COPERTINE_FILE = BASE / "copertine.json"
VOTI_FILE = BASE / "voti.json"   # chiave del gioco -> "bello" | "sufficiente" | "brutto" | "nessuno"
VOTI = ("bello", "sufficiente", "brutto")

app = Flask(__name__, static_folder=str(RISORSE / "static"))


# ---------------------------------------------------------------- dati

def giochi():
    return scanner.carica_dati()["giochi"]


def per_id():
    return {g["id"]: g for g in giochi()}


def aggiorna_percorsi(mosse):
    """Dopo rinomina/spostamento aggiorna i percorsi nel catalogo (così non serve ricalcolare le dimensioni)."""
    dati = scanner.carica_dati()
    mappa = {os.path.normcase(m["da"]): m["a"] for m in mosse}
    tutti = dati["giochi"] + dati.get("cache", [])
    attivi, cache = [], []
    for g in tutti:
        nuovo = mappa.get(os.path.normcase(g["percorso"]))
        if nuovo:
            vecchio = g["percorso"]
            g.update(percorso=nuovo, nome_cartella=os.path.basename(nuovo), disco=nuovo[:2].upper(),
                     id=scanner.id_da_percorso(nuovo))
            for campo in ("exe", "avvio"):
                if g.get(campo) and g[campo].lower().startswith(vecchio.lower()):
                    g[campo] = nuovo + g[campo][len(vecchio):]
            g["exes"] = [nuovo + e[len(vecchio):] if e.lower().startswith(vecchio.lower()) else e for e in g.get("exes", [])]
            if os.path.basename(nuovo) != os.path.basename(vecchio):
                nome, versione, ordine, tag = scanner.analizza_nome(os.path.basename(nuovo))
                g.update(nome=nome, chiave=scanner.chiave(nome), versione=versione or g.get("versione"), ordine=ordine,
                         prefisso=scanner.prefisso(os.path.basename(nuovo)), voto_nome=scanner.voto_da_nome(os.path.basename(nuovo)))
        (cache if f"\\{operazioni.NOME_CESTINO}\\".lower() in g["percorso"].lower() else attivi).append(g)
    dati["giochi"], dati["cache"] = attivi, cache[-500:]
    scanner.salva_dati(dati)


_esegui_originale = operazioni._esegui


def rimuovi_dal_catalogo(percorsi):
    togli = {os.path.normcase(p) for p in percorsi}
    dati = scanner.carica_dati()
    dati["giochi"] = [g for g in dati["giochi"] if os.path.normcase(g["percorso"]) not in togli]
    dati["cache"] = [g for g in dati.get("cache", []) if os.path.normcase(g["percorso"]) not in togli]
    scanner.salva_dati(dati)


def _esegui_con_aggiornamento(ops, etichetta):
    _esegui_originale(ops, etichetta)
    riusciti = [o for o, e in zip(ops, operazioni.stato["esito"]) if e["ok"]]
    rimuovi_dal_catalogo([o["da"] for o in riusciti if o.get("tipo") == "elimina"])
    aggiorna_percorsi([{"da": o["da"], "a": o["a"]} for o in riusciti if o.get("tipo") != "elimina"])
    if etichetta == "annulla":
        scanner.avvia_scansione()  # rimette in libreria ciò che era in _DaEliminare


operazioni._esegui = _esegui_con_aggiornamento


# ---------------------------------------------------------------- velocità dei dischi

def leggi_velocita_dischi():
    """Lettera -> tipo di disco e livello di velocità (4 = NVMe ... 1 = HDD USB)."""
    ps = ("Get-Partition | Where-Object DriveLetter | ForEach-Object { $pd = Get-PhysicalDisk | "
          "Where-Object DeviceId -eq $_.DiskNumber; \"$($_.DriveLetter)|$($pd.MediaType)|$($pd.BusType)|$($pd.FriendlyName)\" }")
    out = {}
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True,
                           timeout=30, creationflags=subprocess.CREATE_NO_WINDOW)
        for riga in r.stdout.splitlines():
            parti = riga.strip().split("|")
            if len(parti) < 4:
                continue
            lettera, media, bus, nome = parti
            ssd = media == "SSD" or (media != "HDD" and re.search(r"ssd|nvme", nome, re.I))
            if ssd and bus == "NVMe":
                tipo, livello = "SSD NVMe", 4
            elif ssd:
                tipo, livello = "SSD", 3
            elif bus == "USB":
                tipo, livello = "HDD esterno USB", 1
            else:
                tipo, livello = "HDD", 2
            out[lettera.upper() + ":"] = {"tipo": tipo, "livello": livello, "modello": nome}
    except Exception:
        pass
    return out


VELOCITA = {}


def _carica_velocita():
    VELOCITA.update(leggi_velocita_dischi())
    operazioni.VELOCITA = VELOCITA


# ---------------------------------------------------------------- copertine (dal negozio Steam, solo immagini)

def carica_copertine():
    if COPERTINE_FILE.exists():
        return json.loads(COPERTINE_FILE.read_text(encoding="utf-8"))
    return {}


def cerca_copertine():
    """In background: per ogni gioco non-Steam cerca l'ID sul negozio Steam per mostrarne la copertina."""
    cop = carica_copertine()
    while True:
        da_cercare = []
        visti = set()
        for g in giochi():
            if not g.get("steam") and g["chiave"] and g["chiave"] not in cop and g["chiave"] not in visti:
                visti.add(g["chiave"])
                da_cercare.append(g)
        for g in da_cercare:
            try:
                url = ("https://store.steampowered.com/api/storesearch/?cc=IT&l=italian&term="
                       + urllib.parse.quote(g["nome"]))
                with urllib.request.urlopen(url, timeout=15) as r:
                    items = json.loads(r.read().decode("utf-8")).get("items", [])
                trovato = None
                for it in items:
                    if scanner.chiave(it["name"]) == g["chiave"]:
                        trovato = str(it["id"])
                        break
                cop[g["chiave"]] = trovato
            except Exception:
                time.sleep(30)
                continue
            COPERTINE_FILE.write_text(json.dumps(cop), encoding="utf-8")
            time.sleep(1.6)  # gentile con il negozio Steam
        time.sleep(60)


# ---------------------------------------------------------------- API

@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/libreria")
def api_libreria():
    dati = scanner.carica_dati()
    operazioni.FONTI_PROTETTE = set(scanner.carica_config()["fonti"]) | set(scanner.carica_config()["contenitori"])
    cop = carica_copertine()
    voti = carica_voti()
    cfg_voti = scanner.carica_config().get("voti_da_prefisso", False)
    for g in dati["giochi"]:
        g["copertina"] = g.get("steam_appid") or cop.get(g["chiave"])
        v = voti.get(g["chiave"])
        g["voto"] = None if v == "nessuno" else v or (g.get("voto_nome") if cfg_voti else None)
    dischi = {}
    for g in dati["giochi"]:
        d = dischi.setdefault(g["disco"], {"disco": g["disco"], "giochi": 0, "occupato": 0})
        d["giochi"] += 1
        d["occupato"] += g.get("dimensione") or 0
    for d in dischi.values():
        d.update(VELOCITA.get(d["disco"], {"tipo": "?", "livello": 0}))
        try:
            u = shutil.disk_usage(d["disco"] + "\\")
            d.update(totale=u.total, libero=u.free)
        except OSError:
            pass
    return jsonify({
        "giochi": dati["giochi"],
        "aggiornato": dati.get("aggiornato"),
        "dischi": sorted(dischi.values(), key=lambda x: x["disco"]),
        "doppioni": scanner.doppioni(dati["giochi"], VELOCITA),
        "cestini": operazioni.contenuto_cestini(sorted(dischi)),
        "fonti": scanner.carica_config()["fonti"],
        "lingua": scanner.carica_config().get("lingua", "it"),
        "configurato": scanner.carica_config().get("configurato", True),
    })


NOMI_CARTELLE_GIOCHI = {"games", "giochi", "game", "jeux", "spiele", "juegos", "jogos", "my games", "gog games",
                        "epic games", "riot games", "ubisoft", "ea games", "xboxgames", "battle.net"}


@app.get("/api/setup/suggerimenti")
def api_setup_suggerimenti():
    """Configurazione guidata: cartelle che sembrano contenere giochi, su tutti i dischi."""
    trovate = []
    for lettera in "CDEFGHIJKLMNOPQRSTUVWXYZ":
        radice = f"{lettera}:\\"
        if not os.path.exists(radice):
            continue
        try:
            voci = list(os.scandir(radice))
        except OSError:
            continue
        for e in voci:
            try:
                if e.is_dir() and e.name.lower() in NOMI_CARTELLE_GIOCHI:
                    n = sum(1 for x in os.scandir(e.path) if x.is_dir())
                    if n:
                        trovate.append({"percorso": e.path, "giochi": n})
                    lib = os.path.join(e.path, "Library")           # es. "Amazon Games\Library"
                    if os.path.isdir(lib):
                        trovate.append({"percorso": lib, "giochi": sum(1 for x in os.scandir(lib) if x.is_dir())})
            except OSError:
                pass
    return jsonify(cartelle=trovate, steam=len([1 for g in scanner.giochi_steam()]))


@app.post("/api/setup")
def api_setup():
    j = request.json or {}
    cfg = scanner.carica_config()
    cfg["fonti"] = [f.strip() for f in j.get("fonti", []) if f.strip() and os.path.isdir(f.strip())]
    cfg["lingua"] = j.get("lingua") if j.get("lingua") in ("it", "en") else cfg.get("lingua", "en")
    cfg["configurato"] = True
    scanner.salva_config(cfg)
    scanner.avvia_scansione()
    return jsonify(ok=True, fonti=cfg["fonti"])


class ApiFinestra:
    """Funzioni chiamabili dalla pagina quando gira nella finestra (pywebview): scelta di una cartella."""
    def scegli_cartella(self):
        import webview
        r = webview.windows[0].create_file_dialog(webview.FOLDER_DIALOG)
        return r[0] if r else ""


@app.post("/api/lingua")
def api_lingua():
    lingua = request.json.get("lingua", "it")
    if lingua not in ("it", "en"):
        return jsonify(ok=False), 400
    cfg = scanner.carica_config()
    cfg["lingua"] = lingua
    scanner.salva_config(cfg)
    return jsonify(ok=True)


@app.get("/api/stato")
def api_stato():
    return jsonify({"scansione": scanner.stato, "operazioni": operazioni.stato})


@app.post("/api/scansiona")
def api_scansiona():
    scanner.avvia_scansione(completa=bool(request.json.get("completa")))
    return jsonify(ok=True)


@app.post("/api/avvia/<gid>")
def api_avvia(gid):
    g = per_id().get(gid)
    if not g:
        return jsonify(ok=False, messaggio="Gioco non trovato"), 404
    exe = request.json.get("exe") if request.is_json else None
    if g.get("steam"):
        os.startfile(g["avvio"])
        return jsonify(ok=True, messaggio=f"Avvio {g['nome']} con Steam")
    exe = exe or g.get("exe")
    if not exe or not os.path.exists(exe):
        return jsonify(ok=False, messaggio="Nessun eseguibile: scegline uno dal dettaglio del gioco"), 400
    subprocess.Popen([exe], cwd=os.path.dirname(exe),
                     creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP)
    return jsonify(ok=True, messaggio=f"Avvio {g['nome']}")


@app.post("/api/scegli_exe/<gid>")
def api_scegli_exe(gid):
    g = per_id().get(gid)
    exe = request.json["exe"]
    cfg = scanner.carica_config()
    cfg["exe_scelti"][g["percorso"]] = exe
    scanner.salva_config(cfg)
    dati = scanner.carica_dati()
    for x in dati["giochi"]:
        if x["id"] == gid:
            x.update(exe=exe, avvio=exe, tipo="installato")
    scanner.salva_dati(dati)
    return jsonify(ok=True)


@app.post("/api/apri/<gid>")
def api_apri(gid):
    g = per_id().get(gid)
    if g and os.path.exists(g["percorso"]):
        subprocess.Popen(["explorer", "/select,", g["percorso"]])
        return jsonify(ok=True)
    return jsonify(ok=False, messaggio="Cartella non trovata"), 404


@app.post("/api/apri_link")
def api_apri_link():
    """Apre nel browser predefinito solo indirizzi di Google necessari alla configurazione del telefono."""
    url = (request.json or {}).get("url", "")
    if url.startswith(("https://sheets.new", "https://docs.google.com/", "https://script.google.com/")):
        webbrowser.open(url)
        return jsonify(ok=True)
    return jsonify(ok=False), 400


@app.post("/api/apri_percorso")
def api_apri_percorso():
    p = request.json["percorso"]
    if os.path.exists(p):
        os.startfile(p)
    return jsonify(ok=True)


@app.post("/api/anteprima")
def api_anteprima():
    return jsonify(operazioni.anteprima(request.json["ops"], per_id()))


@app.post("/api/esegui")
def api_esegui():
    controllate = operazioni.anteprima(request.json["ops"], per_id())
    ok = operazioni.esegui(controllate, request.json.get("etichetta", "operazioni"))
    return jsonify(ok=ok, messaggio=None if ok else "C'è già un'operazione in corso")


def carica_voti():
    return json.loads(VOTI_FILE.read_text(encoding="utf-8")) if VOTI_FILE.exists() else {}


@app.post("/api/voto/<gid>")
def api_voto(gid):
    """Voto del gioco (vale per tutte le sue copie). None = togli il voto, anche quello dato dal prefisso x/L."""
    g = per_id().get(gid)
    if not g:
        return jsonify(ok=False), 404
    voto = (request.json or {}).get("voto")
    voti = carica_voti()
    voti[g["chiave"]] = voto if voto in VOTI else "nessuno"
    VOTI_FILE.write_text(json.dumps(voti, indent=1, ensure_ascii=False), encoding="utf-8")
    return jsonify(ok=True, voto=voto if voto in VOTI else None)


@app.post("/api/disinstalla_steam/<gid>")
def api_disinstalla_steam(gid):
    g = per_id().get(gid)
    if g and g.get("steam_appid"):
        os.startfile(f"steam://uninstall/{g['steam_appid']}")  # Steam chiede conferma da sé
        return jsonify(ok=True, messaggio="Si apre Steam per la disinstallazione")
    return jsonify(ok=False, messaggio="Non è un gioco Steam"), 400


@app.post("/api/svuota")
def api_svuota():
    ok = operazioni.svuota_cestino(request.json["percorso"])
    return jsonify(ok=ok, messaggio=None if ok else "Impossibile svuotare (operazione già in corso?)")


@app.post("/api/annulla")
def api_annulla():
    return jsonify(operazioni.annulla_ultimo())


@app.get("/api/registro")
def api_registro():
    return jsonify(list(reversed(operazioni.carica_registro()))[:20])


@app.post("/api/fonti")
def api_fonti():
    cfg = scanner.carica_config()
    cfg["fonti"] = [f.strip() for f in request.json["fonti"] if f.strip()]
    scanner.salva_config(cfg)
    return jsonify(ok=True)


# ---------------------------------------------------------------- serie TV e anime

import media
import sincronizza
import tempo


@app.after_request
def _dopo_modifica(risposta):
    """Dopo ogni modifica a serie, film e anime: sincronizza con il telefono (se configurato)."""
    if request.method == "POST" and risposta.status_code < 400 and (
            request.path.startswith("/api/media/") or request.path == "/api/estensione"):
        sincronizza.richiedi()
    return risposta


@app.get("/api/telefono")
def api_telefono():
    cfg = sincronizza.carica_config()
    codice = (RISORSE / "telefono" / "Codice.gs").read_text(encoding="utf-8").replace("__TOKEN__", cfg["token"])
    pagina = (RISORSE / "telefono" / "Pagina.html").read_text(encoding="utf-8")
    link = f"{cfg['url']}?token={cfg['token']}" if cfg.get("url") else ""
    return jsonify(url=cfg.get("url", ""), ultima=cfg.get("ultima"), esito=cfg.get("esito"), link=link,
                   codice=codice, pagina=pagina)


@app.post("/api/telefono")
def api_telefono_salva():
    url = (request.json or {}).get("url", "").strip()
    if url and not url.startswith("https://script.google.com/"):
        return jsonify(ok=False, messaggio="L'indirizzo deve iniziare con https://script.google.com/"), 400
    cfg = sincronizza.carica_config()
    cfg["url"] = url
    sincronizza.salva_config(cfg)
    return jsonify(ok=True)


@app.post("/api/telefono/sincronizza")
def api_telefono_sincronizza():
    return jsonify(sincronizza.sincronizza())


@app.get("/api/media")
def api_media():
    return jsonify(media.carica())


@app.get("/api/media/cerca")
def api_media_cerca():
    q, categoria = request.args.get("q", "").strip(), request.args.get("categoria", "serie")
    if not q:
        return jsonify([])
    try:
        cerca = {"anime": media.cerca_anime, "film": media.cerca_film}.get(categoria, media.cerca_serie)
        return jsonify(cerca(q))
    except Exception as e:
        return jsonify({"errore": str(e)}), 502


@app.post("/api/media/aggiungi")
def api_media_aggiungi():
    scheda = request.json
    try:
        scheda = media.scheda_completa(scheda)
    except Exception:
        pass  # senza rete: si aggiunge comunque con una stagione
    return jsonify(media.aggiungi(scheda))


@app.post("/api/media/<mid>/modifica")
def api_media_modifica(mid):
    t = media.modifica(mid, request.json)
    return (jsonify(t), 200) if t else (jsonify(ok=False), 404)


@app.post("/api/media/<mid>/episodio")
def api_media_episodio(mid):
    j = request.json or {}
    return jsonify(media.episodio(mid, j.get("stagione"), int(j.get("delta", 1))))


@app.post("/api/media/<mid>/stagione")
def api_media_stagione(mid):
    j = request.json or {}
    if j.get("elimina"):
        return jsonify(media.elimina_stagione(mid, j["elimina"]))
    return jsonify(media.aggiungi_stagione(mid, j.get("episodi_totali")))


@app.post("/api/media/<mid>/elimina")
def api_media_elimina(mid):
    media.elimina(mid)
    return jsonify(ok=True)


@app.post("/api/media/conferma/<voce>")
def api_media_conferma(voce):
    j = request.json or {}
    if j.get("scarta"):
        d = media.carica()
        d["da_confermare"] = [x for x in d["da_confermare"] if x["id"] != voce]
        media.salva(d)
        return jsonify(ok=True)
    return jsonify(media.conferma(voce, j.get("id"), j.get("scheda")) or {"ok": False})


@app.get("/api/media/stagione")
def api_stagione_mal():
    anno, stagione = media.stagione_attuale_mal()
    if request.args.get("anno") and request.args.get("stagione") in media.STAGIONI:
        anno, stagione = int(request.args["anno"]), request.args["stagione"]
    try:
        return jsonify(media.stagione_per_interfaccia(anno, stagione, forza=request.args.get("forza") == "1"))
    except Exception as e:
        return jsonify(errore=str(e), anno=anno, stagione=stagione), 502


@app.get("/api/media/stagioni/archivio")
def api_stagioni_archivio():
    return jsonify(media.archivio_per_interfaccia())


@app.get("/api/media/stagioni/elenco")
def api_stagioni_elenco():
    return jsonify([{"anno": a, "stagione": s} for a, s in media.elenco_stagioni(media.PRIMO_ANNO_MAL)])


@app.post("/api/media/stagione/scelta")
def api_stagione_mal_scelta():
    j = request.json or {}
    return jsonify(media.scelta_stagione(j["voce"], j["azione"]) or {"ok": False})


@app.post("/api/media/importa")
def api_media_importa():
    """Importa la lista anime da un servizio: myanimelist / anilist (nome utente) o animeunity (indirizzo del profilo)."""
    j = request.json or {}
    servizio, utente = j.get("servizio"), (j.get("utente") or "").strip()
    if not utente:
        return jsonify(ok=False, messaggio="nome utente mancante"), 400
    try:
        if servizio == "myanimelist":
            esito = media.importa_lista(media.leggi_lista_mal(utente), {"servizio": servizio, "utente": utente})
        elif servizio == "anilist":
            esito = media.importa_lista(media.leggi_lista_anilist(utente), {"servizio": servizio, "utente": utente})
        elif servizio == "animeunity":
            esito = media.importa_animeunity(media.leggi_profilo_animeunity(utente))
            d = media.carica()
            d["profilo_animeunity"] = utente
            d.setdefault("profili_import", {})["animeunity"] = utente
            media.salva(d)
        else:
            return jsonify(ok=False, messaggio="servizio sconosciuto"), 400
    except Exception as e:
        return jsonify(ok=False, messaggio=str(e)), 400
    return jsonify(ok=True, **esito)


@app.post("/api/media/importa_animeunity")
def api_importa_animeunity():
    url = (request.json or {}).get("url", "").strip()
    try:
        records = media.leggi_profilo_animeunity(url)
    except Exception as e:
        return jsonify(ok=False, messaggio=str(e)), 400
    esito = media.importa_animeunity(records)
    d = media.carica()
    d["profilo_animeunity"] = url
    media.salva(d)
    return jsonify(ok=True, **esito)


@app.route("/api/estensione", methods=["POST", "OPTIONS"])
def api_estensione():
    """Chiamata dall'estensione di Firefox (solo dal PC: il server ascolta su 127.0.0.1)."""
    if request.method == "OPTIONS":
        return ("", 204)
    return jsonify(media.da_estensione(request.get_json(force=True, silent=True) or {}))


@app.get("/api/estensione/ping")
def api_estensione_ping():
    return jsonify(ok=True, app="gestore-giochi")


IMPOSTAZIONI_ESTENSIONE = BASE / "estensione_impostazioni.json"


@app.route("/api/estensione/impostazioni", methods=["GET", "POST"])
def api_estensione_impostazioni():
    """Copia di sicurezza dei siti e delle impostazioni dell'estensione: se Firefox la reinstalla
    (o la versione firmata parte vuota), l'estensione li riprende da qui."""
    if request.method == "GET":
        try:
            return jsonify(json.loads(IMPOSTAZIONI_ESTENSIONE.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            return jsonify({})
    j = request.get_json(force=True, silent=True) or {}
    siti = [{"parola": str(s.get("parola", "")).strip().lower()[:60], "categoria": s.get("categoria") if s.get("categoria") in ("serie", "anime", "film") else "serie"}
            for s in j.get("siti", []) if isinstance(s, dict) and str(s.get("parola", "")).strip()]
    dati = {"siti": siti, "minuti": max(1, min(60, int(j.get("minuti") or 5))),
            "modalita": "conferma" if j.get("modalita") == "conferma" else "auto",
            "salvato": time.strftime("%Y-%m-%d %H:%M")}
    IMPOSTAZIONI_ESTENSIONE.write_text(json.dumps(dati, indent=2, ensure_ascii=False), encoding="utf-8")
    return jsonify(ok=True)


@app.post("/api/estensione/analizza")
def api_estensione_analizza():
    """Cosa riconosce l'estensione in una pagina, senza salvare nulla."""
    j = request.get_json(force=True, silent=True) or {}
    titolo, stagione, ep = media.analizza_dati(j)
    if j.get("categoria") == "film" and titolo:
        stagione, ep = 1, 1
    try:          # solo sul PC dell'utente, per capire i siti che non vengono riconosciuti
        (BASE / "estensione_ultima.json").write_text(json.dumps(
            {**j, "riconosciuto": {"titolo": titolo, "stagione": stagione, "episodio": ep}},
            indent=2, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass
    t, punti = media.abbina(media.carica(), titolo, j.get("categoria"))
    trovato = t if t and punti >= 0.85 else None
    return jsonify(titolo=titolo, stagione=stagione, episodio=ep,
                   in_lista=trovato["titolo"] if trovato else None,
                   visti=(media.stagione_attuale(trovato) or {}).get("visti") if trovato else None)


# ---------------------------------------------------------------- tempo di gioco e di visione

_titoli_video = {}        # indirizzo della pagina -> (titolo della scheda, categoria, titolo riconosciuto)


def titolo_video(j):
    """Titolo con cui registrare il tempo di un video: quello già in lista se lo si riconosce,
    altrimenti quello letto dalla pagina."""
    categoria = j.get("categoria") if j.get("categoria") in ("serie", "film", "anime") else "serie"
    chiave = (j.get("url", ""), j.get("titolo", ""))
    if chiave in _titoli_video:
        return _titoli_video[chiave]
    titolo = media.analizza_dati(j)[0]
    if titolo:
        d = media.carica()
        t, punti = media.abbina(d, titolo, categoria)
        if not (t and punti >= 0.85):
            t, punti = media.abbina(d, titolo)
        if t and punti >= 0.85:
            titolo, categoria = t["titolo"], t["categoria"]
    if not titolo:
        titolo = (j.get("titolo") or j.get("sito") or "?").strip()[:120]
    if len(_titoli_video) > 500:
        _titoli_video.clear()
    _titoli_video[chiave] = (categoria, titolo)
    return categoria, titolo


@app.route("/api/tempo/battito", methods=["POST", "OPTIONS"])
def api_tempo_battito():
    """Dall'estensione: 15 secondi di video in riproduzione (anche più battiti insieme, tenuti da parte
    mentre l'app era chiusa: ognuno ha l'ora in cui è avvenuto)."""
    if request.method == "OPTIONS":
        return ("", 204)
    j = request.get_json(force=True, silent=True) or {}
    battiti = j.get("battiti") if isinstance(j.get("battiti"), list) else [j]
    adesso = time.time()
    n = 0
    for b in battiti[:20000]:
        if not isinstance(b, dict):
            continue
        quando = b.get("quando")
        quando = quando / 1000 if isinstance(quando, (int, float)) else adesso
        if quando > adesso + 60 or quando < adesso - 30 * 86400:
            continue
        categoria, titolo = titolo_video(b)
        tempo.registra(categoria, titolo, quando)
        n += 1
    if n > 1:
        tempo.salva()
    return jsonify(ok=True, registrati=n)


@app.get("/api/tempo/oggi")
def api_tempo_oggi():
    return jsonify(tempo.oggi())


@app.get("/api/tempo/statistiche")
def api_tempo_statistiche():
    try:
        giorni = int(request.args.get("giorni", 30))
    except ValueError:
        giorni = 30
    return jsonify(tempo.statistiche(giorni))


@app.get("/api/tempo/sonno")
def api_tempo_sonno():
    try:
        giorni = max(7, min(400, int(request.args.get("giorni", 60))))
    except ValueError:
        giorni = 60
    return jsonify(tempo.sonno(giorni))


@app.post("/api/tempo/sonno")
def api_tempo_sonno_salva():
    """Orari veri di una notte ({data, letto, sveglia}; senza orari si torna alla stima) o l'obiettivo ({obiettivo})."""
    j = request.get_json(force=True, silent=True) or {}
    try:
        if "obiettivo" in j:
            tempo.imposta_obiettivo(j["obiettivo"])
        else:
            tempo.imposta_notte(str(j["data"]), j.get("letto") or None, j.get("sveglia") or None)
    except (KeyError, ValueError, TypeError):
        return jsonify(ok=False, messaggio="Orari non validi"), 400
    return jsonify(ok=True)


TESTI_PROMEMORIA = {
    "it": {
        "preavviso": ("⏰ Tra 15 minuti si chiude", "Alle {stop} stop a giochi e video ({titolo}). Cerca un punto di salvataggio "
                      "e non iniziare un nuovo episodio o una nuova partita."),
        "stop": ("⏰ Ora di chiudere", "Sono le {adesso}: chiudi {titolo}, così sei a letto entro le {letto} "
                 "e dormi {obiettivo} ore."),
        "oltre": ("⏰ Sei oltre l'ora di stop", "Sono le {adesso}, {oltre} minuti dopo le {stop}. Chiudi {titolo}: {sveglia}"),
        "sveglia": "la sveglia arriva comunque alle {sveglia}.", "sveglia_no": "ogni minuto in più è sonno in meno.",
        "ok": "Ok, chiudo", "rimanda": "Ancora 15 min",
    },
    "en": {
        "preavviso": ("⏰ Closing in 15 minutes", "At {stop} games and videos stop ({titolo}). Look for a save point "
                      "and don't start a new episode or match."),
        "stop": ("⏰ Time to stop", "It's {adesso}: close {titolo}, so you're in bed by {letto} and sleep {obiettivo} hours."),
        "oltre": ("⏰ You're past stop time", "It's {adesso}, {oltre} minutes after {stop}. Close {titolo}: {sveglia}"),
        "sveglia": "your alarm still rings at {sveglia}.", "sveglia_no": "every extra minute is less sleep.",
        "ok": "OK, closing", "rimanda": "15 more min",
    },
}


def mostra_promemoria(tipo, info):
    """Apre la finestrella del promemoria (avviso.py) in un processo a sé, sopra il gioco o il video."""
    lingua = scanner.carica_config().get("lingua", "it")
    T = TESTI_PROMEMORIA["en" if lingua == "en" else "it"]
    titolo, testo = T[tipo]
    valori = {**info, "obiettivo": f"{info['obiettivo']:g}",
              "sveglia": T["sveglia"].format(sveglia=info["sveglia"]) if info.get("sveglia") else T["sveglia_no"]}
    dati = json.dumps({"titolo": titolo, "testo": testo.format(**valori), "ok": T["ok"],
                       "rimanda": T["rimanda"] if tipo != "preavviso" else "", "porta": PORTA}, ensure_ascii=False)
    if percorsi.CONGELATO:
        cmd = [str(percorsi.ESEGUIBILE), "--promemoria", dati]
    else:
        cmd = [str(Path(sys.executable).with_name("pythonw.exe")), str(RISORSE / "avviso.py"), dati]
    subprocess.Popen(cmd, creationflags=subprocess.CREATE_NO_WINDOW)


@app.get("/api/tempo/promemoria")
def api_tempo_promemoria():
    return jsonify(tempo.promemoria_info())


@app.post("/api/tempo/promemoria")
def api_tempo_promemoria_salva():
    """{attivo}, {ora: "HH:MM" o "" per l'ora automatica}, {rimanda: minuti} (dalla finestrella) o {prova: true}."""
    j = request.get_json(force=True, silent=True) or {}
    try:
        if j.get("rimanda"):
            if tempo.promemoria:
                tempo.promemoria.rimanda(max(5, min(60, int(j["rimanda"]))))
        elif j.get("prova"):
            info = tempo.promemoria_info()
            mostra_promemoria("stop", {**info, "titolo": tempo.video_in_corso() or "Elden Ring", "oltre": 0,
                                       "adesso": info["stop"]})
        else:
            tempo.imposta_promemoria(j.get("attivo"), j.get("ora"))
    except (ValueError, TypeError):
        return jsonify(ok=False, messaggio="Orari non validi"), 400
    return jsonify(ok=True, **tempo.promemoria_info())


# ---------------------------------------------------------------- avvio automatico con Windows

def collegamento_avvio():
    return CARTELLA_AVVIO / "PassionOrganizer.lnk"


CARTELLA_AVVIO = Path(os.environ.get("APPDATA", ".")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"


def migra_collegamento_avvio():
    """Il vecchio collegamento 'Gestore Giochi.lnk' diventa 'PassionOrganizer.lnk' (stessa impostazione di prima)."""
    vecchio = CARTELLA_AVVIO / "Gestore Giochi.lnk"
    if vecchio.exists():
        try:
            imposta_avvio_automatico(True)
            vecchio.unlink()
        except Exception:
            pass


def imposta_avvio_automatico(attivo):
    lnk = collegamento_avvio()
    if not attivo:
        lnk.unlink(missing_ok=True)
        return
    pythonw = Path(sys.executable).with_name("pythonw.exe")
    ps = (
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK);"
        "$s.TargetPath = $env:PYW; $s.Arguments = '\"' + $env:APP + '\" --avvio';"
        "$s.WorkingDirectory = $env:DIR; $s.Description = 'PassionOrganizer';"
        "$s.IconLocation = \"$env:SystemRoot\\System32\\imageres.dll,186\"; $s.Save()"
    )
    if percorsi.CONGELATO:
        ps = ps.replace("'\"' + $env:APP + '\" --avvio'", "'--avvio'")
        env = dict(os.environ, LNK=str(lnk), PYW=str(percorsi.ESEGUIBILE), APP="", DIR=str(percorsi.ESEGUIBILE.parent))
    else:
        env = dict(os.environ, LNK=str(lnk), PYW=str(pythonw), APP=str(RISORSE / "app.py"), DIR=str(RISORSE))
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], env=env, check=True, timeout=30,
                   creationflags=subprocess.CREATE_NO_WINDOW)


@app.get("/api/avvio_automatico")
def api_avvio_get():
    return jsonify(attivo=collegamento_avvio().exists())


@app.post("/api/avvio_automatico")
def api_avvio_set():
    try:
        imposta_avvio_automatico(bool(request.json["attivo"]))
    except Exception as e:
        return jsonify(ok=False, attivo=collegamento_avvio().exists(), messaggio=str(e)), 500
    return jsonify(ok=True, attivo=collegamento_avvio().exists())


@app.post("/api/esci")
def api_esci():
    tempo.salva()
    threading.Timer(0.5, lambda: os._exit(0)).start()
    return jsonify(ok=True)


# ---------------------------------------------------------------- avvio

def porta_occupata():
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", PORTA)) == 0


def avvia_server():
    app.run(host="127.0.0.1", port=PORTA, debug=False, threaded=True, use_reloader=False)


if __name__ == "__main__":
    if "--promemoria" in sys.argv:                    # .exe: finestrella del promemoria (avviso.py)
        import avviso
        avviso.mostra(json.loads(sys.argv[sys.argv.index("--promemoria") + 1]))
        sys.exit()
    url = f"http://127.0.0.1:{PORTA}"
    usa_browser = "--browser" in sys.argv
    if sys.stdout is None:  # avviata con pythonw: log su file
        sys.stdout = sys.stderr = open(BASE / "app.log", "a", encoding="utf-8")
    if porta_occupata():
        # Il server è già attivo (finestra già aperta o scansione in corso): apro solo una finestra.
        if usa_browser:
            webbrowser.open(url)
        else:
            import webview
            webview.create_window("PassionOrganizer", url, width=1360, height=880, min_size=(800, 560))
            webview.start()
        sys.exit()

    tempo.avvia_controllo(giochi, mostra_promemoria)  # tempo di gioco ogni 15 s e promemoria dell'ora di stop
    threading.Thread(target=cerca_copertine, daemon=True).start()
    threading.Thread(target=_carica_velocita, daemon=True).start()
    sincronizza.avvia_in_background()                 # telefono: ogni 5 minuti e dopo ogni modifica
    threading.Thread(target=migra_collegamento_avvio, daemon=True).start()
    threading.Timer(60, media.scarica_archivio).start()   # stagioni MAL dal 2020, una ogni 15 s, solo quelle mancanti
    sincronizza.richiedi()                            # e una volta all'avvio
    if scanner.carica_config().get("configurato") and (not scanner.DATI_FILE.exists() or "--avvio" in sys.argv):
        # All'accensione del PC: aggiornamento veloce (ricalcola solo le cartelle cambiate)
        threading.Timer(20 if "--avvio" in sys.argv else 0, scanner.avvia_scansione).start()

    if usa_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
        avvia_server()
    elif "--avvio" in sys.argv:
        # All'accensione del PC: solo in background (conta il tempo di gioco e riceve i dati dell'estensione).
        # La finestra si apre lanciando di nuovo PassionOrganizer, che trova il server già attivo.
        avvia_server()
    else:
        # Finestra propria, come un normale programma. Chiudendola l'app resta attiva in background
        # (per contare il tempo); si chiude del tutto con il pulsante ⏻.
        import webview
        threading.Thread(target=avvia_server, daemon=True).start()
        while not porta_occupata():
            time.sleep(0.1)
        webview.create_window("PassionOrganizer", url, width=1360, height=880, min_size=(800, 560),
                              background_color="#12141A", js_api=ApiFinestra())
        webview.start()
        tempo.salva()
        while True:
            time.sleep(3600)
