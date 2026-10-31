"""Gestore giochi: app locale nel browser (http://127.0.0.1:5577)."""

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

BASE = Path(__file__).resolve().parent
PORTA = 5577
COPERTINE_FILE = BASE / "copertine.json"

app = Flask(__name__, static_folder=str(BASE / "static"))


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
                g.update(nome=nome, chiave=scanner.chiave(nome), versione=versione or g.get("versione"), ordine=ordine)
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
    for g in dati["giochi"]:
        g["copertina"] = g.get("steam_appid") or cop.get(g["chiave"])
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
    })


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


# ---------------------------------------------------------------- avvio automatico con Windows

def collegamento_avvio():
    return Path(os.environ["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup" / "Gestore Giochi.lnk"


def imposta_avvio_automatico(attivo):
    lnk = collegamento_avvio()
    if not attivo:
        lnk.unlink(missing_ok=True)
        return
    pythonw = Path(sys.executable).with_name("pythonw.exe")
    ps = (
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK);"
        "$s.TargetPath = $env:PYW; $s.Arguments = '\"' + $env:APP + '\" --avvio';"
        "$s.WorkingDirectory = $env:DIR; $s.Description = 'Gestore Giochi';"
        "$s.IconLocation = \"$env:SystemRoot\\System32\\imageres.dll,186\"; $s.Save()"
    )
    env = dict(os.environ, LNK=str(lnk), PYW=str(pythonw), APP=str(BASE / "app.py"), DIR=str(BASE))
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
    threading.Timer(0.5, lambda: os._exit(0)).start()
    return jsonify(ok=True)


# ---------------------------------------------------------------- avvio

def porta_occupata():
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", PORTA)) == 0


def avvia_server():
    app.run(host="127.0.0.1", port=PORTA, debug=False, threaded=True, use_reloader=False)


if __name__ == "__main__":
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
            webview.create_window("Gestore Giochi", url, width=1360, height=880, min_size=(800, 560))
            webview.start()
        sys.exit()

    threading.Thread(target=cerca_copertine, daemon=True).start()
    threading.Thread(target=_carica_velocita, daemon=True).start()
    if not scanner.DATI_FILE.exists() or "--avvio" in sys.argv:
        # All'accensione del PC: aggiornamento veloce (ricalcola solo le cartelle cambiate)
        threading.Timer(20 if "--avvio" in sys.argv else 0, scanner.avvia_scansione).start()

    if usa_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
        avvia_server()
    else:
        # Finestra propria, come un normale programma; chiudendola si chiude tutto.
        import webview
        threading.Thread(target=avvia_server, daemon=True).start()
        while not porta_occupata():
            time.sleep(0.1)
        webview.create_window("Gestore Giochi", url, width=1360, height=880, min_size=(800, 560),
                              background_color="#12141A")
        webview.start()
        os._exit(0)
