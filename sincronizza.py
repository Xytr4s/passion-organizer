"""Sincronizzazione di serie, film e anime con il Foglio Google (pagina per il telefono).

Il Gestore invia tutta la lista allo script del foglio (telefono/Codice.gs), che la unisce con le
modifiche fatte dal telefono (per ogni titolo vince la modifica più recente) e restituisce il risultato.
Gli orari viaggiano in UTC; in media.json restano nell'ora locale del PC.
"""

import json
import secrets
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

import media

import percorsi

BASE = percorsi.DATI          # dati dell'utente (cartella del progetto, o %LOCALAPPDATA% per il .exe)
CONFIG = BASE / "telefono.json"      # url dello script, codice segreto, esito ultima sincronizzazione
_evento = threading.Event()
_lock = threading.Lock()
CAMPI_SCAMBIATI = ("categoria", "tipo", "titolo", "anno", "copertina", "voto", "note", "stagioni")


def carica_config():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {}
    if not cfg.get("token"):
        cfg["token"] = secrets.token_urlsafe(24)
        salva_config(cfg)
    cfg.setdefault("url", "")
    return cfg


def salva_config(cfg):
    CONFIG.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


def _utc(locale):
    """'2026-11-01T10:00:00' (ora del PC) -> '2026-11-01T09:00:00.000Z'."""
    try:
        return datetime.fromisoformat(locale).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    except (TypeError, ValueError):
        return "1970-01-01T00:00:00.000Z"


def _locale(utc):
    try:
        return datetime.fromisoformat(str(utc).replace("Z", "+00:00")).astimezone().replace(tzinfo=None).isoformat(timespec="seconds")
    except ValueError:
        return media.adesso()


def _riga(t):
    return {"id": t["id"], **{k: t.get(k) for k in CAMPI_SCAMBIATI}, "stato": t.get("stato"), "aggiornato": _utc(t.get("aggiornato"))}


def _stagione(s):
    base = media.nuova_stagione(int(s.get("numero") or 1), s.get("episodi_totali"))
    for k in ("visti", "stato", "voto", "note", "inizio", "fine"):
        if s.get(k) not in (None, ""):
            base[k] = s[k]
    base["visti"] = int(base.get("visti") or 0)
    return base


def sincronizza():
    """Una sincronizzazione completa. Restituisce {"ok", "messaggio", "nuovi", "aggiornati"}."""
    cfg = carica_config()
    if not cfg.get("url"):
        return {"ok": False, "messaggio": "telefono non configurato"}
    with _lock:
        d = media.carica()
        corpo = {"token": cfg["token"], "azione": "sincronizza",
                 "titoli": [_riga(t) for t in d["titoli"]], "eliminati": d.get("eliminati", [])}
        try:
            r = requests.post(cfg["url"], json=corpo, timeout=60)
            risposta = r.json()
        except Exception as e:
            esito = {"ok": False, "messaggio": f"Google non raggiungibile: {e}"}
            cfg.update(ultima=media.adesso(), esito=esito["messaggio"])
            salva_config(cfg)
            return esito
        if not risposta.get("ok"):
            esito = {"ok": False, "messaggio": risposta.get("errore", "errore sconosciuto")}
            cfg.update(ultima=media.adesso(), esito=esito["messaggio"])
            salva_config(cfg)
            return esito

        # applica le modifiche arrivate dal telefono (rilette ora: la lista può essere cambiata nel frattempo)
        d = media.carica()
        locali = {t["id"]: t for t in d["titoli"]}
        nuovi = aggiornati = 0
        for x in risposta["titoli"]:
            t = locali.get(x["id"])
            if t is None:
                if x["id"] in d.get("eliminati", []):
                    continue
                t = {"id": x["id"], "fonte": "telefono", "fonte_id": None, "titolo_originale": "", "trama": "",
                     "alias": [], "creato": media.adesso()}
                d["titoli"].append(t)
                nuovi += 1
            elif str(x.get("aggiornato")) <= _utc(t.get("aggiornato")):
                continue          # la versione del PC è uguale o più recente
            else:
                aggiornati += 1
            for k in CAMPI_SCAMBIATI:
                if k == "stagioni":
                    t["stagioni"] = [_stagione(s) for s in (x.get("stagioni") or [])] or [media.nuova_stagione(1)]
                elif x.get(k) not in (None, "") or k in ("voto", "note"):
                    t[k] = x.get(k) if x.get(k) != "" else None
            t["stato"] = media.stato_generale(t)
            t["aggiornato"] = _locale(x.get("aggiornato"))
        d["eliminati"] = []          # le eliminazioni sono state comunicate al foglio
        media.salva(d)
        esito = {"ok": True, "messaggio": f"ok · {nuovi} nuovi e {aggiornati} aggiornati dal telefono",
                 "nuovi": nuovi, "aggiornati": aggiornati}
        cfg.update(ultima=media.adesso(), esito=esito["messaggio"])
        salva_config(cfg)
        return esito


def richiedi():
    """Chiamata dopo ogni modifica: la sincronizzazione parte pochi secondi dopo (raggruppa modifiche ravvicinate)."""
    _evento.set()


def avvia_in_background(intervallo=300):
    def ciclo():
        while True:
            _evento.wait(timeout=intervallo)
            _evento.clear()
            time.sleep(5)
            try:
                if carica_config().get("url"):
                    sincronizza()
            except Exception:
                pass
    threading.Thread(target=ciclo, daemon=True).start()
