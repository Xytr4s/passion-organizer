"""Scansione dei dischi: trova i giochi, ne ricava nome pulito, versione, dimensione ed eseguibile."""

import hashlib
import json
import os
import re
import threading
import time
from difflib import SequenceMatcher
from pathlib import Path

import percorsi

BASE = percorsi.DATI          # dati dell'utente (cartella del progetto, o %LOCALAPPDATA% per il .exe)
CONFIG_FILE = BASE / "config.json"
DATI_FILE = BASE / "dati.json"

CONFIG_DEFAULT = {
    # Cartelle che contengono giochi (ogni sottocartella = un gioco): scelte nella configurazione al primo avvio
    "fonti": [],
    # Sottocartelle che non sono giochi ma contenitori di giochi (es. una cartella "nuovi" dentro Games)
    "contenitori": [],
    # Contenitori con i giochi più recenti (il numero 0001_ nel nome indica l'ordine)
    "recenti": [],
    "steam": True,
    "exe_scelti": {},          # percorso gioco -> eseguibile scelto a mano
    "configurato": False,      # False = mostra la configurazione guidata
    "voti_da_prefisso": False, # True = cartelle "x0001 Nome" = bello, "L0001 Nome" = brutto
}

NOME_INSTALLER = "_Installer"  # sottocartella in cui l'app raggruppa installer e archivi
ESTENSIONI_ARCHIVIO ={".rar", ".zip", ".7z", ".iso", ".bin", ".img"}
ESTENSIONI_INSTALLER = {".exe", ".msi"}
FILE_DA_IGNORARE = {"desktop.ini", "thumbs.db", "installer.settings"}
CARTELLE_DA_IGNORARE = {"_daeliminare", "$recycle.bin", "system volume information"}

EXE_ESCLUSI = re.compile(
    r"unins|setup|install|redist|vc_?redist|dxsetup|directx|dxwebsetup|crash|report|"
    r"updater|^update|patcher|config|settings|dotnet|prereq|ue4prereq|helper|cefprocess|"
    r"easyanticheat|^eac|battleye|dedicated|server|benchmark|^7z|python|java|node|"
    r"quicksfv|touchup|notification|overlay|webhelper|subprocess|dumper|uploader|"
    r"register|activation|cleanup|repair|vcrun|oalinst|physx|steam_?api|steamcmd|"
    r"handler|cmd$|console$|tool|editor|sdk",
    re.I,
)

GRUPPI_SCENA = re.compile(
    r"[-_.](tenoke|razor1911|i_know|rune|flt|unleashed|tinyiso|dinobytes|darksiders|codex|"
    r"plaza|skidrow|empress|doge|p2p|elamigos|gog|cpy|hoodlum|reloaded|prophet|chronos|"
    r"simplex|goldberg|kaos|fitgirl|dodi|tinyiso|ali213|3dm|fckdrm|venom|rept|ksp)$",
    re.I,
)
PREFISSI_SCENA = re.compile(r"^(codex|cpy|plaza|rld|skidrow|hoodlum)[-_.]", re.I)
VERSIONE = re.compile(
    r"[ ._-]v?(\d+(?:\.\d+){1,4}[a-z]?)(?=$|[ ._-])|[ ._-]v(\d+[a-z]?)(?=$|[ ._-])|"
    r"[ ._-]build[ ._]?(\d+)|[ ._-]patch[ ._]?(\d+)",
    re.I,
)
PAROLE_EDIZIONE = re.compile(
    r"\b(goty|game of the year|complete|edition|collectors?|definitive|digital|deluxe|gold|"
    r"ultimate|enhanced|early access|repack|the)\b",
    re.I,
)

# ---------------------------------------------------------------- stato condiviso

stato = {"in_corso": False, "fase": "", "fatti": 0, "totale": 0, "corrente": "", "fine": None}
_lock = threading.Lock()


def carica_config():
    cfg = dict(CONFIG_DEFAULT)
    if CONFIG_FILE.exists():
        salvata = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        if "configurato" not in salvata:
            # installazione precedente alla configurazione guidata: è già configurata e usa i prefissi x/L
            salvata.update(configurato=True, voti_da_prefisso=True)
            CONFIG_FILE.write_text(json.dumps({**cfg, **salvata}, indent=2, ensure_ascii=False), encoding="utf-8")
        cfg.update(salvata)
    else:
        salva_config(cfg)
    return cfg


def salva_config(cfg):
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


def carica_dati():
    if DATI_FILE.exists():
        return json.loads(DATI_FILE.read_text(encoding="utf-8"))
    return {"giochi": [], "aggiornato": None}


def salva_dati(dati):
    tmp = DATI_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(dati, ensure_ascii=False), encoding="utf-8")
    tmp.replace(DATI_FILE)


# ---------------------------------------------------------------- nomi

def id_da_percorso(p):
    return hashlib.md5(os.path.normcase(p).encode("utf-8")).hexdigest()[:12]


def analizza_nome(nome):
    """'0012_Cult.of.the.Lamb.v1.2.7.186-TENOKE' -> (nome pulito, versione, numero d'ordine, tag)."""
    n = nome
    ordine = None
    m = re.match(r"^([xXlL]?)(\d{3,5})[ _](.+)$", n)
    if m:
        ordine, n = int(m.group(2)), m.group(3)
    n = re.sub(r"\.(rar|zip|7z|iso|exe|msi)$", "", n, flags=re.I)
    tag = []
    for t in re.findall(r"[\[\(]([^\]\)]*)[\]\)]", n):
        tag.append(t.strip())
    n = re.sub(r"[\[\(][^\]\)]*[\]\)]", " ", n)
    n = re.sub(r"\s\+\s.*$", "", n)  # "Gioco + Patch" / "+ DLC"
    n = PREFISSI_SCENA.sub("", n)
    while True:
        m = GRUPPI_SCENA.search(n.strip())
        if not m:
            break
        tag.append(m.group(1))
        n = n.strip()[: m.start()]
    # "Gioco.Update.v1.2", "Gioco Fix Online v7", "Gioco Hotfix": conta solo il nome del gioco
    m = re.search(r"[ ._-](update|hotfix|fix|crackfix|patch only)(?=$|[ ._-])", n, re.I)
    if m and m.start() > 2:
        tag.append(m.group(1).title())
        n = n[: m.start()]
    # versione attaccata al nome: "Minion3.0.5"
    n = re.sub(r"(?<![ ._-][vV])(?<=[A-Za-z])(\d+(?:\.\d+){1,3})$", r" v\1", n)
    if re.search(r"early[ ._]access", n, re.I):
        tag.append("Early Access")
        n = re.sub(r"[ ._-]?early[ ._]access", "", n, flags=re.I)
    versione = None
    m = VERSIONE.search(n)
    if m:
        versione = next(g for g in m.groups() if g)
        if m.group(3):
            versione = "build " + versione
        elif m.group(4):
            versione = "patch " + versione
        n = n[: m.start()]
    if " " not in n.strip():
        n = re.sub(r"[._]", " ", n)
    n = re.sub(r"\s+", " ", n).strip(" -_.")
    if n and n == n.lower():
        n = n.title()
    return n or nome, versione, ordine, tag


ROMANI = {"ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "vii": "7", "viii": "8", "ix": "9", "x": "10"}


def prefisso(nome_cartella):
    """Prefisso di numerazione così com'è scritto (es. "x0235 ", "0270_"), da conservare nelle rinomine."""
    m = re.match(r"^([xXlL]?\d{3,5}[ _])", nome_cartella)
    return m.group(1) if m else ""


def voto_da_nome(nome_cartella):
    """Convenzione dell'utente in __ins: x0000 = bello, L0000 = brutto."""
    p = prefisso(nome_cartella)[:1].lower()
    return {"x": "bello", "l": "brutto"}.get(p)


def chiave(nome_pulito):
    k = PAROLE_EDIZIONE.sub(" ", nome_pulito.lower())
    k = re.sub(r"\b(royal|anniversary|10th|remastered edition)\b", " ", k)
    # numeri romani come parole a sé ("Settlers II" = "Settlers 2"); "v" solo se in fondo
    k = re.sub(r"\b(ii|iii|iv|vi|vii|viii|ix)\b", lambda m: ROMANI[m.group(1)], k)
    k = re.sub(r"\b(v|x)$", lambda m: ROMANI[m.group(1)], k.strip())
    return re.sub(r"[^a-z0-9]", "", k)


def confronta_versioni(a, b):
    """>0 se a è più nuova di b."""
    def numeri(v):
        return [int(x) for x in re.findall(r"\d+", v or "")]
    na, nb = numeri(a), numeri(b)
    return (na > nb) - (na < nb)


# ---------------------------------------------------------------- esplorazione cartelle

def esplora(cartella, profondita_exe=3):
    """Dimensione totale, numero file, eseguibili (fino a una certa profondità), archivi grandi."""
    totale, nfile, exes, archivi, errori = 0, 0, [], [], 0
    pila = [(cartella, 0)]
    while pila:
        d, prof = pila.pop()
        try:
            with os.scandir(d) as it:
                for e in it:
                    try:
                        if e.is_dir(follow_symlinks=False):
                            pila.append((e.path, prof + 1))
                        elif e.is_file(follow_symlinks=False):
                            st = e.stat(follow_symlinks=False)
                            totale += st.st_size
                            nfile += 1
                            ext = os.path.splitext(e.name)[1].lower()
                            if ext == ".exe" and prof <= profondita_exe:
                                exes.append((e.path, st.st_size, prof))
                            elif ext in ESTENSIONI_ARCHIVIO and st.st_size > 50_000_000 and prof <= 1:
                                archivi.append(e.path)
                    except OSError:
                        errori += 1
        except OSError:
            errori += 1
    return totale, nfile, exes, archivi, errori


def scegli_exe(exes, nome):
    """Sceglie l'eseguibile principale del gioco tra quelli trovati."""
    k = chiave(nome)
    candidati = []
    for path, size, prof in exes:
        stem = Path(path).stem
        if EXE_ESCLUSI.search(stem) and chiave(stem) != k:
            continue
        sim = SequenceMatcher(None, chiave(stem), k).ratio() if k else 0
        bonus_cartella = 0.3 if re.search(r"[\\/](win64|x64|bin|binaries)[\\/]", path, re.I) else 0
        punteggio = sim * 3 + min(size / 50_000_000, 1.5) - prof * 0.4 + bonus_cartella
        candidati.append((punteggio, path))
    candidati.sort(reverse=True)
    return [p for _, p in candidati]


def classifica(exes_validi, exes_tutti, archivi, nfile, totale):
    if totale < 1_000_000:
        return "vuoto"
    nomi = [Path(p).stem.lower() for p, _, _ in exes_tutti]
    ha_setup = any(re.search(r"^setup|install", n) for n in nomi)
    if exes_validi:
        # Pochi file + setup + archivi grandi = cartella di installazione, non gioco installato
        if ha_setup and archivi and nfile < 60:
            return "installer"
        return "installato"
    if archivi or ha_setup:
        return "installer"
    return "sconosciuto"


# ---------------------------------------------------------------- Steam

def leggi_vdf_semplice(testo):
    return dict(re.findall(r'"(\w+)"\s+"([^"]*)"', testo))


def giochi_steam():
    steam = Path(r"C:\Program Files (x86)\Steam")
    vdf = steam / "steamapps" / "libraryfolders.vdf"
    if not vdf.exists():
        return []
    librerie = [p.replace("\\\\", "\\") for p in re.findall(r'"path"\s+"([^"]+)"', vdf.read_text(encoding="utf-8", errors="ignore"))]
    out = []
    for lib in librerie:
        sa = Path(lib) / "steamapps"
        for acf in sa.glob("appmanifest_*.acf"):
            try:
                info = leggi_vdf_semplice(acf.read_text(encoding="utf-8", errors="ignore"))
            except OSError:
                continue
            appid = info.get("appid")
            if not appid or appid in ("228980",):  # redistributable comuni
                continue
            cartella = sa / "common" / info.get("installdir", "")
            nome = info.get("name", info.get("installdir", "?"))
            out.append({
                "id": id_da_percorso(str(cartella)),
                "nome": nome,
                "chiave": chiave(nome),
                "nome_cartella": cartella.name,
                "percorso": str(cartella),
                "disco": str(cartella)[:2].upper(),
                "fonte": "Steam",
                "steam": True,
                "steam_appid": appid,
                "versione": None,
                "ordine": None,
                "recente": False,
                "tag": ["Demo"] if re.search(r"\bdemo\b|betatest|playtest", nome, re.I) else [],
                "tipo": "installato",
                "dimensione": int(info.get("SizeOnDisk", 0) or 0),
                "modificato": int(info.get("LastUpdated", 0) or 0),
                "exe": None,
                "exes": [],
                "avvio": f"steam://rungameid/{appid}",
            })
    return out


# ---------------------------------------------------------------- scansione completa

def elenco_elementi(cfg):
    """Restituisce [(percorso, è_cartella, fonte, recente)] per tutti i potenziali giochi."""
    contenitori = {os.path.normcase(c) for c in cfg["contenitori"]}
    recenti = {os.path.normcase(c) for c in cfg["recenti"]}
    fonti_norm = {os.path.normcase(f) for f in cfg["fonti"]}
    out, visti = [], set()

    def aggiungi_da(cartella, fonte, recente):
        try:
            voci = list(os.scandir(cartella))
        except OSError:
            return
        for e in voci:
            nc = os.path.normcase(e.path)
            if nc in visti or e.name.lower() in CARTELLE_DA_IGNORARE or e.name.lower() in FILE_DA_IGNORARE:
                continue
            try:
                is_dir = e.is_dir(follow_symlinks=False)
            except OSError:
                continue
            if is_dir and (nc in contenitori or nc in fonti_norm or e.name.lower() == NOME_INSTALLER.lower()):
                # _Installer dentro una cartella "recenti" resta recente
                aggiungi_da(e.path, fonte, nc in recenti or (recente and e.name.lower() == NOME_INSTALLER.lower()))
                continue
            if not is_dir:
                ext = os.path.splitext(e.name)[1].lower()
                if ext not in ESTENSIONI_ARCHIVIO | ESTENSIONI_INSTALLER:
                    continue
            visti.add(nc)
            out.append((e.path, is_dir, fonte, recente))

    for f in cfg["fonti"]:
        if os.path.isdir(f):
            aggiungi_da(f, f, os.path.normcase(f) in recenti)
    return out


def scansiona(completa=False):
    """Scansione in due fasi: elenco veloce, poi dimensioni ed eseguibili (con cache)."""
    with _lock:
        if stato["in_corso"]:
            return
        stato.update(in_corso=True, fase="Elenco cartelle", fatti=0, totale=0, corrente="", fine=None)
    try:
        cfg = carica_config()
        dati_prec = carica_dati()
        vecchi = {g["percorso"]: g for g in dati_prec.get("cache", []) + dati_prec["giochi"]}
        elementi = elenco_elementi(cfg)
        steam = giochi_steam() if cfg.get("steam") else []
        stato.update(fase="Analisi giochi", totale=len(elementi))

        giochi = []
        ultimo_salvataggio = time.time()
        for i, (percorso, is_dir, fonte, recente) in enumerate(elementi):
            stato.update(fatti=i, corrente=percorso)
            nome_cartella = os.path.basename(percorso)
            try:
                mtime = int(os.stat(percorso).st_mtime)
            except OSError:
                continue
            v = vecchi.get(percorso)
            if v and not completa and v.get("modificato") == mtime and v.get("dimensione") is not None:
                g = dict(v)
                # le regole sui nomi possono migliorare: ricalcolo sempre nome e chiave (costa nulla)
                nome, versione, ordine, tag = analizza_nome(nome_cartella)
                g.update(nome=nome, chiave=chiave(nome), versione=versione, ordine=ordine, tag=tag)
            else:
                nome, versione, ordine, tag = analizza_nome(nome_cartella)
                g = {
                    "id": id_da_percorso(percorso), "nome": nome, "chiave": chiave(nome),
                    "nome_cartella": nome_cartella, "percorso": percorso,
                    "disco": percorso[:2].upper(), "fonte": fonte, "steam": False,
                    "steam_appid": v.get("steam_appid") if v else None,
                    "versione": versione, "ordine": ordine, "tag": tag,
                    "modificato": mtime,
                }
                if is_dir:
                    totale, nfile, exes, archivi, errori = esplora(percorso)
                    validi = scegli_exe(exes, nome)
                    g.update(dimensione=totale, tipo=classifica(validi, exes, archivi, nfile, totale),
                             exes=validi[:15] + [p for p, _, _ in exes if p not in validi][:10],
                             exe=validi[0] if validi else None,
                             errore="accesso negato ad alcune cartelle" if errori else None)
                else:
                    ext = os.path.splitext(percorso)[1].lower()
                    g.update(dimensione=os.path.getsize(percorso), exes=[], exe=None,
                             tipo="archivio" if ext in ESTENSIONI_ARCHIVIO else "installer", errore=None)
            g["prefisso"], g["voto_nome"] = prefisso(nome_cartella), voto_da_nome(nome_cartella)
            g["recente"] = recente
            scelto = cfg["exe_scelti"].get(percorso)
            if scelto:
                g["exe"] = scelto
            g["avvio"] = g["exe"] if g.get("tipo") == "installato" else None
            giochi.append(g)

            if time.time() - ultimo_salvataggio > 20:  # salvataggi parziali: la libreria si riempie man mano
                salva_dati({"giochi": giochi + steam, "aggiornato": None, "parziale": True,
                            "cache": dati_prec.get("cache", [])})
                ultimo_salvataggio = time.time()

        salva_dati({"giochi": giochi + steam, "aggiornato": int(time.time()),
                    "cache": dati_prec.get("cache", [])})
        stato.update(fatti=len(elementi), corrente="", fine=int(time.time()))
    finally:
        stato.update(in_corso=False, fase="")


def avvia_scansione(completa=False):
    threading.Thread(target=scansiona, args=(completa,), daemon=True).start()


# ---------------------------------------------------------------- doppioni

def doppioni(giochi, velocita=None):
    velocita = velocita or {}
    gruppi = {}
    for g in giochi:
        if g["tipo"] == "vuoto" or not g["chiave"]:
            continue
        gruppi.setdefault(g["chiave"], []).append(g)
    out = []
    for k, lista in gruppi.items():
        if len(lista) < 2:
            continue
        # Da tenere: installato, poi Steam, poi nei "recenti" (__ins), poi sul disco più veloce,
        # poi versione più alta, poi modificato più di recente.
        def priorita(g):
            return (g["tipo"] == "installato", g["steam"], g.get("recente", False),
                    velocita.get(g["disco"], {}).get("livello", 0),
                    [int(x) for x in re.findall(r"\d+", g.get("versione") or "")], g.get("modificato", 0))
        ordinati = sorted(lista, key=priorita, reverse=True)
        tieni = ordinati[0]
        # Oltre alla copia da giocare, tengo l'archivio/installer più recente come copia di riserva.
        backup = None
        if tieni["tipo"] == "installato":
            archivi = [g for g in ordinati[1:] if g["tipo"] in ("archivio", "installer")]
            if archivi:
                backup = max(archivi, key=lambda g: ([int(x) for x in re.findall(r"\d+", g.get("versione") or "")],
                                                     g.get("modificato", 0)))
        superflui = [g for g in ordinati[1:] if g is not backup and not g["steam"]]
        if not superflui:
            continue  # solo gioco + backup: nessun doppione vero
        out.append({
            "chiave": k, "nome": tieni["nome"], "tieni": tieni["id"],
            "backup": backup["id"] if backup else None,
            "copie": [g["id"] for g in ordinati],
            "recuperabile": sum(g.get("dimensione") or 0 for g in superflui),
        })
    out.sort(key=lambda x: x["recuperabile"], reverse=True)
    return out
