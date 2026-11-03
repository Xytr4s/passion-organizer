"""Sezione "Bot di trading": collega PassionOrganizer a un bot che vive in un'altra cartella (config.json: "bot_trading").

Il bot resta un programma a sé (i giri automatici li fa l'Utilità di pianificazione di Windows): qui se ne leggono lo
stato e i report HTML, e si possono lanciare solo comandi che non inviano ordini:
  confronto  rigenera report/confronto.html (simulazione vs backtest vs ETF, come stanno andando i titoli)
  prova      mostra gli ordini che il bot invierebbe oggi, SENZA inviarli
  stato      capitale, posizioni aperte e ultimi ordini
"""

import csv
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

import percorsi
import scanner

REPORT = {"confronto": "confronto.html", "scopritore": "scopritore.html", "backtest": "report.html"}
COMANDI = {
    "confronto": ["-c", "import confronto; confronto.genera()"],
    "prova": ["bot.py", "prova"],
    "stato": ["bot.py", "stato"],
}
_lavoro = {"comando": None, "in_corso": False, "uscita": "", "inizio": None, "fine": None, "codice": None}
_lock = threading.Lock()
_cache_attivita = (0, None)


def cartella():
    c = (scanner.carica_config().get("bot_trading") or "").strip()
    return Path(c) if c and (Path(c) / "bot.py").exists() else None


def imposta_cartella(c):
    c = (c or "").strip().strip('"')
    if c and not (Path(c) / "bot.py").exists():
        raise ValueError("Nella cartella non c'è bot.py")
    cfg = scanner.carica_config()
    cfg["bot_trading"] = c
    scanner.salva_config(cfg)


def _python():
    """Python per il bot (console, senza finestra): quello dell'app, oppure quello trovato nel PATH (app come .exe)."""
    if not percorsi.CONGELATO:
        p = Path(sys.executable).with_name("python.exe")
        if p.exists():
            return str(p)
    return shutil.which("python") or "python"


def _json(p):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _attivita(c):
    """Giri automatici (Utilità di pianificazione) che lanciano bot.py di questa cartella: ultimo giro, esito, prossimo."""
    global _cache_attivita
    if time.time() - _cache_attivita[0] < 60 and _cache_attivita[1] is not None:
        return _cache_attivita[1]
    ps = ("$c = $env:BOT; Get-ScheduledTask | Where-Object { ($_.Actions | ForEach-Object { \"$($_.Execute) $($_.Arguments)\" }) -like \"*$c*\" } | "
          "ForEach-Object { $i = $_ | Get-ScheduledTaskInfo; [pscustomobject]@{ nome = $_.TaskName; stato = \"$($_.State)\"; "
          "argomenti = \"$($_.Actions[0].Arguments)\"; "
          "ultimo = $(if ($i.LastRunTime.Year -gt 2000) { $i.LastRunTime.ToString('s') } else { $null }); esito = $i.LastTaskResult; "
          "prossimo = $(if ($i.NextRunTime) { $i.NextRunTime.ToString('s') } else { $null }) } } | ConvertTo-Json -Compress")
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], capture_output=True, text=True,
                           timeout=30, env=dict(os.environ, BOT=str(c)), creationflags=subprocess.CREATE_NO_WINDOW)
        dati = json.loads(r.stdout) if r.stdout.strip() else []
        dati = dati if isinstance(dati, list) else [dati]
    except Exception:
        dati = []
    _cache_attivita = (time.time(), dati)
    return dati


def _errore_recente(log):
    """Se l'ultimo giro registrato in bot.log contiene un errore, le sue ultime righe."""
    try:
        righe = log.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return None
    inizio = max((i for i, r in enumerate(righe) if r.startswith("=== ")), default=0)
    giro = righe[inizio:]
    if any("Traceback" in r for r in giro):
        return "\n".join(giro[-8:])
    return None


def _errore_scopritore(c):
    """Lo Scopritore scrive gli errori in scopritore.log: se è più recente del portafoglio, l'ultimo giro non è riuscito."""
    log, port = c / "scopritore.log", c / "scopritore_portafoglio.json"
    try:
        if log.exists() and (not port.exists() or log.stat().st_mtime > port.stat().st_mtime):
            return "\n".join(log.read_text(encoding="utf-8", errors="replace").splitlines()[-6:])
    except OSError:
        pass
    return None


def stato():
    c = cartella()
    if not c:
        return {"configurato": False, "cartella": scanner.carica_config().get("bot_trading", "")}
    cfg = _json(c / "config.json") or {}
    ese = cfg.get("esecuzione", {})
    modalita = ese.get("modalita", "?")
    st = (_json(c / "stato_bot.json") or {}).get(modalita, {})
    andamento = []
    try:
        with open(c / "andamento.csv", newline="", encoding="utf-8") as f:
            andamento = [{"data": r["data"], "equity": float(r["equity_eur"])} for r in csv.DictReader(f, delimiter=";")
                         if r.get("modalita") == modalita]
    except (OSError, ValueError, KeyError):
        pass
    sc = _json(c / "scopritore_portafoglio.json") or {}
    storico = sc.get("storico") or []
    capitale_sc = (cfg.get("scopritore", {}).get("portafoglio", {}) or {}).get("capitale_usd")
    report = {}
    for k, nome in REPORT.items():
        p = c / "report" / nome
        if p.exists():
            report[k] = datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="minutes")
    return {
        "configurato": True, "cartella": str(c), "modalita": modalita, "strategia": ese.get("strategia"),
        "bloccato": bool(st.get("bloccato")) or (c / "STOP.txt").exists(),
        "ultima_esecuzione": st.get("ultima_esecuzione"),
        "capitale": andamento[-1]["equity"] if andamento else None,
        "capitale_inizio": andamento[0]["equity"] if andamento else None,
        "posizioni": len((_json(c / "simulazione.json") or {}).get("posizioni", [])) if modalita == "simula" else None,
        "scopritore": {"valore": storico[-1]["valore"], "data": storico[-1]["data"], "capitale": capitale_sc,
                       "posizioni": len(sc.get("posizioni", []))} if storico else None,
        "errore": _errore_recente(c / "bot.log"),
        "errore_scopritore": _errore_scopritore(c),
        "attivita": _attivita(c),
        "report": report,
        "lavoro": dict(_lavoro),
    }


def percorso_report(nome):
    c = cartella()
    if not c or nome not in REPORT.values():
        return None
    p = c / "report" / nome
    return p if p.exists() else None


def esegui(comando):
    """Lancia un comando del bot in background (uno alla volta); l'uscita si legge da stato()["lavoro"]."""
    c = cartella()
    if not c:
        raise ValueError("Cartella del bot non impostata")
    if comando not in COMANDI:
        raise ValueError("Comando non consentito")
    with _lock:
        if _lavoro["in_corso"]:
            raise ValueError("Un comando del bot è già in corso")
        _lavoro.update(comando=comando, in_corso=True, uscita="", inizio=datetime.now().isoformat(timespec="seconds"),
                       fine=None, codice=None)

    def lavora():
        try:
            r = subprocess.run([_python(), *COMANDI[comando]], cwd=c, capture_output=True, text=True, encoding="utf-8",
                               errors="replace", timeout=900, env=dict(os.environ, PYTHONIOENCODING="utf-8"),
                               creationflags=subprocess.CREATE_NO_WINDOW)
            uscita = (r.stdout or "") + (("\n" + r.stderr) if r.returncode and r.stderr else "")
            codice = r.returncode
        except Exception as e:
            uscita, codice = str(e), -1
        # niente avvisi tecnici di librerie (es. "Pandas4Warning") nell'uscita mostrata
        uscita = "\n".join(x for x in uscita.splitlines() if "Warning" not in x and "inplace" not in x
                           and not x.strip().startswith(("quotes.", "df.", "data.")))
        with _lock:
            _lavoro.update(in_corso=False, uscita=uscita.strip()[-20000:], fine=datetime.now().isoformat(timespec="seconds"),
                           codice=codice)

    threading.Thread(target=lavora, daemon=True, name="bot").start()


def apri_cartella():
    c = cartella()
    if c:
        os.startfile(c)
