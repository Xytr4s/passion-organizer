"""Tempo passato a giocare e a guardare serie, film e anime.

- Giochi: ogni 15 secondi si guarda quale programma ha la finestra in primo piano; se il suo eseguibile sta
  nella cartella di un gioco del catalogo (installato o Steam), quel tempo conta per il gioco.
- Serie, film e anime: l'estensione di Firefox manda un "battito" ogni 15 secondi mentre un video è in
  riproduzione sui siti scelti (se l'app è chiusa li tiene da parte e li manda dopo, con l'ora giusta).

I battiti vengono uniti in sessioni {c: categoria, t: titolo, i: inizio, f: fine} (secondi epoch), salvate in
tempo.json. Le statistiche (giorno per giorno, ore della giornata, titoli) si calcolano da lì.
"""

import ctypes
import datetime as dt
import json
import os
import threading
import time
from ctypes import wintypes

import percorsi

FILE = percorsi.DATI / "tempo.json"
CATEGORIE = ("giochi", "serie", "film", "anime")
PASSO = 15            # secondi tra un controllo (o un battito) e l'altro
UNIONE = 45           # un battito entro questi secondi dalla fine di una sessione la prolunga
ATTIVO = 40           # una sessione finita da meno di così è "in corso"
UNIONE_ATTIVITA = 300 # due momenti d'uso del PC distanti meno di 5 minuti sono un'unica attività
CAMBIO_GIORNO = 5     # una serata finisce alle 5 del mattino: giocare all'1:30 di giovedì conta per mercoledì sera

_lock = threading.Lock()
_dati = None
_modificato = False


# ---------------------------------------------------------------- archivio

def _carica():
    global _dati
    if _dati is None:
        try:
            _dati = json.loads(FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _dati = {}
        _dati.setdefault("sessioni", [])
    return _dati


def salva():
    """Scrive su disco se qualcosa è cambiato (chiamata ogni minuto dal controllo in background)."""
    global _modificato
    with _lock:
        if not _modificato or _dati is None:
            return
        tmp = FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(_dati, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        tmp.replace(FILE)
        _modificato = False


def registra(categoria, titolo, quando=None, durata=PASSO):
    """Aggiunge `durata` secondi terminati all'istante `quando` alla sessione giusta (o ne apre una nuova)."""
    global _modificato
    if categoria not in CATEGORIE or not titolo:
        return
    quando = float(quando or time.time())
    titolo = str(titolo)[:200]
    with _lock:
        sess = _carica()["sessioni"]
        # cerca dall'ultima: i battiti arrivano quasi sempre in ordine
        for s in reversed(sess[-50:]):
            if s["c"] == categoria and s["t"] == titolo and s["i"] - UNIONE <= quando <= s["f"] + UNIONE:
                s["f"] = max(s["f"], round(quando))
                break
        else:
            sess.append({"c": categoria, "t": titolo, "i": round(quando - durata), "f": round(quando)})
            if len(sess) > 1 and sess[-1]["i"] < sess[-2]["i"]:
                sess.sort(key=lambda s: s["i"])
        _modificato = True


# ---------------------------------------------------------------- giochi in primo piano

_user32 = ctypes.WinDLL("user32", use_last_error=True) if os.name == "nt" else None
_kernel32 = ctypes.WinDLL("kernel32", use_last_error=True) if os.name == "nt" else None


def eseguibile_in_primo_piano():
    """Percorso completo dell'eseguibile che ha la finestra attiva (None se non si riesce a leggerlo)."""
    if not _user32:
        return None
    hwnd = _user32.GetForegroundWindow()
    if not hwnd:
        return None
    pid = wintypes.DWORD()
    _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if not pid.value:
        return None
    h = _kernel32.OpenProcess(0x1000, False, pid.value)        # PROCESS_QUERY_LIMITED_INFORMATION
    if not h:
        return None
    try:
        buf = ctypes.create_unicode_buffer(1024)
        n = wintypes.DWORD(len(buf))
        if _kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(n)):
            return buf.value
    finally:
        _kernel32.CloseHandle(h)
    return None


class Giochi:
    """Cartelle dei giochi del catalogo, dalla più lunga (così vince la cartella più specifica)."""
    def __init__(self, leggi_giochi):
        self.leggi_giochi = leggi_giochi
        self.cartelle, self.letto = [], 0

    def trova(self, exe):
        if time.time() - self.letto > 300:                     # il catalogo cambia di rado: si rilegge ogni 5 minuti
            try:
                g = [x for x in self.leggi_giochi() if x.get("steam") or x.get("tipo") == "installato"]
                self.cartelle = sorted(((os.path.normcase(x["percorso"]).rstrip("\\/") + os.sep, x["nome"]) for x in g),
                                       key=lambda c: -len(c[0]))
            except Exception:
                pass
            self.letto = time.time()
        e = os.path.normcase(exe)
        for cartella, nome in self.cartelle:
            if e.startswith(cartella):
                return nome
        return None


class _LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]


def secondi_inattivo():
    """Secondi dall'ultimo uso di tastiera o mouse (il controller dei giochi non conta: lo copre il gioco in primo piano)."""
    if not _user32:
        return 0
    info = _LASTINPUTINFO(ctypes.sizeof(_LASTINPUTINFO), 0)
    if not _user32.GetLastInputInfo(ctypes.byref(info)):
        return 0
    return ((_kernel32.GetTickCount() - info.dwTime) & 0xFFFFFFFF) / 1000


def registra_attivita(quando=None, durata=PASSO):
    """Uso del PC (per stimare il sonno): intervalli [inizio, fine], uniti se distano meno di 5 minuti."""
    global _modificato
    quando = round(quando or time.time())
    with _lock:
        att = _carica().setdefault("attivita", [])
        if att and att[-1][1] + UNIONE_ATTIVITA >= quando - durata:
            att[-1][1] = max(att[-1][1], quando)
        else:
            att.append([quando - durata, quando])
        _modificato = True


def avvia_controllo(leggi_giochi):
    """Thread in background: gioco in primo piano e uso del PC ogni 15 s, salvataggio ogni minuto."""
    giochi = Giochi(leggi_giochi)

    def ciclo():
        ultimo_salvataggio = time.time()
        while True:
            inizio = time.time()
            try:
                exe = eseguibile_in_primo_piano()
                nome = giochi.trova(exe) if exe else None
                if nome:
                    registra("giochi", nome, inizio)
                if nome or secondi_inattivo() < PASSO + 5:
                    registra_attivita(inizio)
                if inizio - ultimo_salvataggio >= 60:
                    salva()
                    ultimo_salvataggio = inizio
            except Exception as e:                               # il controllo non deve mai fermarsi
                print("tempo:", e)
            time.sleep(max(1.0, PASSO - (time.time() - inizio)))

    threading.Thread(target=ciclo, daemon=True, name="tempo").start()


# ---------------------------------------------------------------- calcoli

def _pezzi_per_ora(i, f):
    """Divide l'intervallo [i, f) in pezzi che non superano il cambio d'ora (ora locale)."""
    while i < f:
        d = dt.datetime.fromtimestamp(i)
        fine_ora = (d.replace(minute=0, second=0, microsecond=0) + dt.timedelta(hours=1)).timestamp()
        j = min(f, fine_ora)
        yield d, j - i
        i = j


def _copia_sessioni():
    with _lock:
        return [dict(s) for s in _carica()["sessioni"]]


def oggi():
    """Secondi di oggi per categoria e, per ognuna, l'eventuale sessione in corso."""
    ora = time.time()
    mezzanotte = dt.datetime.combine(dt.date.today(), dt.time()).timestamp()
    tot = {c: 0 for c in CATEGORIE}
    in_corso = {}
    for s in _copia_sessioni():
        if s["f"] > mezzanotte:
            tot[s["c"]] += s["f"] - max(s["i"], mezzanotte)
        if ora - s["f"] <= ATTIVO:
            prec = in_corso.get(s["c"])
            if not prec or s["f"] > prec["fine"]:
                in_corso[s["c"]] = {"titolo": s["t"], "inizio": s["i"], "fine": s["f"]}
    return {"ora": ora, "oggi": tot, "in_corso": in_corso}


def statistiche(giorni=30):
    """Dati per la pagina Statistiche negli ultimi `giorni` giorni (0 = tutto)."""
    sess = _copia_sessioni()
    oggi_d = dt.date.today()
    if giorni and giorni > 0:
        primo = oggi_d - dt.timedelta(days=giorni - 1)
    else:
        primo = dt.date.fromtimestamp(sess[0]["i"]) if sess else oggi_d
    da = dt.datetime.combine(primo, dt.time()).timestamp()

    n_giorni = (oggi_d - primo).days + 1
    per_giorno = {(primo + dt.timedelta(days=k)).isoformat(): {c: 0 for c in CATEGORIE} for k in range(n_giorni)}
    ore = {c: [0] * 24 for c in CATEGORIE}
    settimana = {c: [[0] * 24 for _ in range(7)] for c in CATEGORIE}
    titoli = {}
    for s in sess:
        if s["f"] <= da:
            continue
        i = max(s["i"], da)
        for d, secondi in _pezzi_per_ora(i, s["f"]):
            k = d.date().isoformat()
            if k in per_giorno:
                per_giorno[k][s["c"]] += secondi
            ore[s["c"]][d.hour] += secondi
            settimana[s["c"]][d.weekday()][d.hour] += secondi
        v = titoli.setdefault((s["c"], s["t"]), {"categoria": s["c"], "titolo": s["t"], "secondi": 0, "sessioni": 0, "ultimo": 0})
        v["secondi"] += s["f"] - i
        v["sessioni"] += 1
        v["ultimo"] = max(v["ultimo"], s["f"])
    arrot = lambda x: round(x)
    # fine serata: per ogni sera (dalle 18 alle 5 del mattino dopo) l'ora dell'ultima attività per categoria,
    # in minuti dalle 18:00; poi la media per giorno della settimana della sera
    fine_sera = {}
    for s in sess:
        if s["f"] <= da:
            continue
        fine = dt.datetime.fromtimestamp(s["f"])
        sera = (fine - dt.timedelta(hours=CAMBIO_GIORNO)).date()
        minuti = (fine - dt.datetime.combine(sera, dt.time(18))).total_seconds() / 60
        if 0 < minuti <= (24 - 18 + CAMBIO_GIORNO) * 60:
            v = fine_sera.setdefault(sera.isoformat(), {})
            v[s["c"]] = max(v.get(s["c"], 0), minuti)
    serate = [{"data": k, **{c: round(v[c]) for c in v}} for k, v in sorted(fine_sera.items())]
    return {
        "da": primo.isoformat(), "a": oggi_d.isoformat(), "categorie": list(CATEGORIE),
        "giorni": [{"data": k, **{c: arrot(v[c]) for c in CATEGORIE}} for k, v in per_giorno.items()],
        "ore": {c: [arrot(x) for x in v] for c, v in ore.items()},
        "settimana": {c: [[arrot(x) for x in riga] for riga in v] for c, v in settimana.items()},
        "titoli": sorted(titoli.values(), key=lambda v: -v["secondi"])[:60],
        "serate": serate,
        "registrato_dal": dt.date.fromtimestamp(sess[0]["i"]).isoformat() if sess else None,
    }


# ---------------------------------------------------------------- sonno

OBIETTIVO_SONNO = 7.5     # ore per notte, modificabile dalla pagina Sonno


def _intervalli_attivita(da, a):
    """Uso del PC e sessioni (giochi e video) tra `da` e `a`, uniti e in ordine."""
    with _lock:
        d = _carica()
        iv = [(x[0], x[1]) for x in d.get("attivita", []) if x[1] > da and x[0] < a]
        iv += [(s["i"], s["f"]) for s in d["sessioni"] if s["f"] > da and s["i"] < a]
    iv.sort()
    uniti = []
    for i, f in iv:
        if uniti and i <= uniti[-1][1]:
            uniti[-1][1] = max(uniti[-1][1], f)
        else:
            uniti.append([i, f])
    return uniti


def stima_notte(giorno):
    """Notte che finisce la mattina di `giorno`: la pausa più lunga senza attività sul PC iniziata tra le 19 e le 7
    e finita tra le 3 e le 15, lunga da 3 a 16 ore. Serve attività sia prima sia dopo: (letto, sveglia) o None.
    È un limite massimo: se dopo il PC si resta svegli (es. col telefono), si dorme meno di così."""
    sera = dt.datetime.combine(giorno - dt.timedelta(days=1), dt.time(18)).timestamp()
    fine = sera + 22 * 3600
    iv = _intervalli_attivita(sera - 6 * 3600, fine)
    migliore = None
    for (_, f1), (i2, _) in zip(iv, iv[1:]):
        if not (sera + 3600 <= f1 <= sera + 13 * 3600 and sera + 9 * 3600 <= i2 <= fine - 3600):
            continue
        if 3 * 3600 <= i2 - f1 <= 16 * 3600 and (not migliore or i2 - f1 > migliore[1] - migliore[0]):
            migliore = (f1, i2)
    return migliore


def _da_orari(giorno, letto, sveglia):
    """Orari scritti a mano ("23:40", "07:10") -> istanti. Prima di mezzogiorno il letto è già nel giorno della sveglia."""
    hl, ml = map(int, letto.split(":"))
    hs, ms = map(int, sveglia.split(":"))
    s = dt.datetime.combine(giorno, dt.time(hs, ms))
    l = dt.datetime.combine(giorno if hl < 12 else giorno - dt.timedelta(days=1), dt.time(hl, ml))
    if l >= s:
        l -= dt.timedelta(days=1)
    return l.timestamp(), s.timestamp()


def sonno(giorni=60):
    """Una riga per notte (indicata con la data del risveglio), dalla più vecchia alla più recente."""
    with _lock:
        d = _carica()
        manuali = dict(d.get("sonno", {}))
        obiettivo = d.get("obiettivo_sonno", OBIETTIVO_SONNO)
        att = d.get("attivita", [])
        dal = att[0][0] if att else None
    sess = _copia_sessioni()
    oggi_d = dt.date.today()
    notti = []
    for k in range(max(1, giorni) - 1, -1, -1):
        g = oggi_d - dt.timedelta(days=k)
        stima = stima_notte(g)
        m = manuali.get(g.isoformat()) or {}
        letto = sveglia = None
        fonte = None
        if m.get("letto") and m.get("sveglia"):
            try:
                letto, sveglia = _da_orari(g, m["letto"], m["sveglia"])
                fonte = "manuale"
            except ValueError:
                pass
        if fonte is None and stima:
            letto, sveglia = stima
            fonte = "stima"
        prima, ultimo_gioco = {}, None
        if letto:
            # cosa hai fatto nelle 2 ore prima di dormire, e quando hai smesso di giocare quella sera
            for s in sess:
                a, b = max(s["i"], letto - 7200), min(s["f"], letto)
                if b > a:
                    prima[s["c"]] = prima.get(s["c"], 0) + round(b - a)
                if s["c"] == "giochi" and letto - 12 * 3600 < s["f"] <= letto + 600:
                    ultimo_gioco = max(ultimo_gioco or 0, s["f"])
        notti.append({
            "data": g.isoformat(), "settimana": (g - dt.timedelta(days=1)).weekday(),   # giorno della sera prima
            "fonte": fonte, "letto": letto, "sveglia": sveglia,
            "ore": round((sveglia - letto) / 3600, 2) if letto else None,
            "stima": list(stima) if stima else None, "manuale": m or None,
            "prima": prima, "ultimo_gioco": ultimo_gioco,
        })
    return {"obiettivo": obiettivo, "notti": notti, "dal": dal}


def imposta_notte(giorno, letto=None, sveglia=None):
    """Orari veri di una notte (scritti a mano); senza orari si torna alla stima."""
    global _modificato
    if letto and sveglia:
        _da_orari(dt.date.fromisoformat(giorno), letto, sveglia)     # controlla il formato
    with _lock:
        s = _carica().setdefault("sonno", {})
        if letto and sveglia:
            s[giorno] = {"letto": letto, "sveglia": sveglia}
        else:
            s.pop(giorno, None)
        _modificato = True
    salva()


def imposta_obiettivo(ore):
    global _modificato
    with _lock:
        _carica()["obiettivo_sonno"] = max(4.0, min(12.0, float(ore)))
        _modificato = True
    salva()
