"""Rinomina, sposta e "metti da parte" (in _DaEliminare) con anteprima, esecuzione e annulla.
Nessuna cancellazione definitiva: quella la fa l'utente svuotando _DaEliminare."""

import json
import os
import re
import shutil
import threading
import time
from pathlib import Path

import percorsi

BASE = percorsi.DATI          # dati dell'utente (cartella del progetto, o %LOCALAPPDATA% per il .exe)
REGISTRO = BASE / "registro.json"
NOME_CESTINO = "_DaEliminare"

VELOCITA = {}  # impostato da app.py: lettera -> {"tipo", "livello"}
stato = {"in_corso": False, "fatti": 0, "totale": 0, "corrente": "", "esito": []}
_lock = threading.Lock()

CARATTERI_VIETATI = re.compile(r'[<>:"/\\|?*]')
PERCORSI_GESTITI = re.compile(r"\\(steamapps|Riot Games|Amazon Games|Epic Games|Battle\.net)\\", re.I)


def carica_registro():
    if REGISTRO.exists():
        return json.loads(REGISTRO.read_text(encoding="utf-8"))
    return []


def salva_registro(reg):
    REGISTRO.write_text(json.dumps(reg, indent=2, ensure_ascii=False), encoding="utf-8")


def stesso_disco(a, b):
    return os.path.splitdrive(a)[0].upper() == os.path.splitdrive(b)[0].upper()


def spazio_libero(percorso):
    try:
        return shutil.disk_usage(os.path.splitdrive(percorso)[0] + "\\").free
    except OSError:
        return 0


def destinazione(op, gioco):
    """Calcola il percorso finale di un'operazione."""
    src = gioco["percorso"]
    if op["tipo"] == "rinomina":
        return os.path.join(os.path.dirname(src), op["nuovo_nome"].strip())
    if op["tipo"] == "sposta":
        return os.path.join(op["cartella"], os.path.basename(src))
    if op["tipo"] == "da_parte":
        disco = os.path.splitdrive(src)[0]
        return os.path.join(disco + "\\", NOME_CESTINO, os.path.basename(src))
    raise ValueError(op["tipo"])


def anteprima(ops, giochi_per_id):
    """Controlla ogni operazione e restituisce l'elenco con eventuali problemi."""
    out, dest_viste = [], set()
    libero = {}
    for op in ops:
        g = giochi_per_id.get(op["id"])
        r = {**op, "problema": None, "avviso": None}
        if not g:
            r["problema"] = "gioco non trovato (rifai la scansione)"
            out.append(r)
            continue
        r["nome"], r["da"] = g["nome"], g["percorso"]
        r["dimensione"] = g.get("dimensione") or 0
        if op["tipo"] == "elimina":
            if g.get("steam"):
                r["problema"] = "gioco Steam: usa “Disinstalla con Steam”"
            elif not os.path.exists(g["percorso"]):
                r["problema"] = "non esiste più"
            elif not percorso_eliminabile(g["percorso"]):
                r["problema"] = "percorso protetto (radice di un disco o cartella principale dei giochi)"
            else:
                r["a"] = None
                r["avviso"] = "ELIMINAZIONE DEFINITIVA: non si può annullare"
            out.append(r)
            continue
        if g.get("steam"):
            r["problema"] = "gioco Steam: spostalo da Steam (Proprietà > File installati > Sposta)"
        elif not os.path.exists(g["percorso"]):
            r["problema"] = "la cartella non esiste più"
        else:
            if op["tipo"] == "rinomina" and (not op.get("nuovo_nome", "").strip() or CARATTERI_VIETATI.search(op["nuovo_nome"])):
                r["problema"] = "nome non valido"
            else:
                a = destinazione(op, g)
                r["a"] = a
                if os.path.normcase(a) == os.path.normcase(g["percorso"]):
                    r["problema"] = "nessun cambiamento"
                elif os.path.exists(a) and os.path.normcase(a) != os.path.normcase(g["percorso"]):
                    r["problema"] = "esiste già una cartella con quel nome"
                elif os.path.normcase(a) in dest_viste:
                    r["problema"] = "due operazioni verso la stessa destinazione"
                elif op["tipo"] == "sposta" and not stesso_disco(a, g["percorso"]):
                    d = os.path.splitdrive(a)[0].upper()
                    libero.setdefault(d, spazio_libero(a))
                    if (g.get("dimensione") or 0) > libero[d] - 2_000_000_000:
                        r["problema"] = "spazio insufficiente sul disco di destinazione"
                    else:
                        libero[d] -= g.get("dimensione") or 0
                        r["avviso"] = "copia tra dischi: può richiedere molto tempo"
                        v_da = VELOCITA.get(g["percorso"][:2].upper(), {})
                        v_a = VELOCITA.get(d, {})
                        if v_da and v_a and v_a["livello"] < v_da["livello"]:
                            r["avviso"] += (f". Attenzione: passa da {v_da['tipo']} a {v_a['tipo']}, "
                                            "il gioco caricherà più lentamente")
                        elif v_da and v_a and v_a["livello"] > v_da["livello"]:
                            r["avviso"] += f". Passa su un disco più veloce ({v_a['tipo']})"
                dest_viste.add(os.path.normcase(a))
            if not r["problema"] and PERCORSI_GESTITI.search(g["percorso"]):
                r["avviso"] = "cartella di un launcher: dopo lo spostamento il launcher potrebbe non trovarla"
        out.append(r)
    return out


FONTI_PROTETTE = set()  # impostato da app.py: cartelle principali dei giochi, mai eliminabili


def percorso_eliminabile(p):
    p = os.path.normcase(os.path.abspath(p))
    if len(p) <= 3:  # "h:\"
        return False
    if os.path.basename(p) in ("_installer", NOME_CESTINO.lower()):  # cartelle di raggruppamento
        return False
    if p in {os.path.normcase(os.path.abspath(f)) for f in FONTI_PROTETTE}:
        return False
    return os.path.dirname(p) != p


def _elimina(percorso):
    """Cancellazione definitiva, gestendo file in sola lettura e percorsi molto lunghi."""
    import stat

    def sblocca(func, path, _exc):
        os.chmod(path, stat.S_IWRITE)
        func(path)

    lungo = "\\\\?\\" + os.path.abspath(percorso)
    if os.path.isdir(lungo):
        shutil.rmtree(lungo, onexc=sblocca)
    else:
        try:
            os.remove(lungo)
        except PermissionError:
            os.chmod(lungo, stat.S_IWRITE)
            os.remove(lungo)


def annota_eliminati(voci):
    f = BASE / "eliminati.json"
    reg = json.loads(f.read_text(encoding="utf-8")) if f.exists() else []
    reg.extend(voci)
    f.write_text(json.dumps(reg, indent=2, ensure_ascii=False), encoding="utf-8")


def _sposta(da, a):
    os.makedirs(os.path.dirname(a), exist_ok=True)
    if stesso_disco(da, a):
        os.rename(da, a)  # istantaneo
    else:
        shutil.move(da, a)  # copia + eliminazione dell'originale solo a copia finita


def _esegui(ops, etichetta):
    reg = carica_registro()
    gruppo = {"quando": int(time.time()), "etichetta": etichetta, "mosse": []}
    eliminati = []
    stato.update(in_corso=True, fatti=0, totale=len(ops), esito=[])
    try:
        for i, op in enumerate(ops):
            stato.update(fatti=i, corrente=op["da"])
            try:
                if op.get("tipo") == "elimina":
                    _elimina(op["da"])
                    eliminati.append({"quando": int(time.time()), "percorso": op["da"],
                                      "nome": op["nome"], "dimensione": op.get("dimensione", 0)})
                else:
                    _sposta(op["da"], op["a"])
                    gruppo["mosse"].append({"da": op["da"], "a": op["a"]})
                stato["esito"].append({"nome": op["nome"], "ok": True})
            except OSError as e:
                errore = str(e)
                if op.get("tipo") == "elimina" and os.path.exists(op["da"]):
                    errore += " (eliminazione parziale: forse il gioco è aperto o un file è in uso)"
                stato["esito"].append({"nome": op["nome"], "ok": False, "errore": errore})
        stato["fatti"] = len(ops)
    finally:
        if gruppo["mosse"]:
            reg.append(gruppo)
            salva_registro(reg)
        if eliminati:
            annota_eliminati(eliminati)
        stato.update(in_corso=False, corrente="")


def esegui(ops_controllate, etichetta="operazioni"):
    valide = [o for o in ops_controllate if not o.get("problema")]
    with _lock:
        if stato["in_corso"]:
            return False
        stato["in_corso"] = True
    threading.Thread(target=_esegui, args=(valide, etichetta), daemon=True).start()
    return True


def annulla_ultimo():
    """Rimette a posto l'ultimo gruppo di operazioni, in ordine inverso."""
    reg = carica_registro()
    if not reg:
        return {"ok": False, "messaggio": "Niente da annullare."}
    gruppo = reg[-1]
    ops = [{"da": m["a"], "a": m["da"], "nome": os.path.basename(m["da"])} for m in reversed(gruppo["mosse"])
           if os.path.exists(m["a"]) and not os.path.exists(m["da"])]
    reg.pop()
    salva_registro(reg)
    with _lock:
        if stato["in_corso"]:
            return {"ok": False, "messaggio": "C'è già un'operazione in corso."}
        stato["in_corso"] = True

    def lavoro():
        _esegui(ops, "annulla")
        r = carica_registro()  # l'annullamento non va a sua volta nel registro
        if r and r[-1]["etichetta"] == "annulla":
            r.pop()
            salva_registro(r)
    threading.Thread(target=lavoro, daemon=True).start()
    return {"ok": True, "messaggio": f"Annullo {len(ops)} operazioni ({gruppo['etichetta']})."}


def svuota_cestino(cartella):
    """Elimina definitivamente tutto il contenuto di una cartella _DaEliminare."""
    if os.path.basename(cartella.rstrip("\\")) != NOME_CESTINO or not os.path.isdir(cartella):
        return False
    ops = []
    for e in os.scandir(cartella):
        ops.append({"tipo": "elimina", "da": e.path, "a": None, "nome": e.name, "dimensione": 0})
    with _lock:
        if stato["in_corso"]:
            return False
        stato["in_corso"] = True
    threading.Thread(target=_esegui, args=(ops, "svuota " + cartella), daemon=True).start()
    return True


def contenuto_cestini(dischi):
    out = []
    for d in dischi:
        c = os.path.join(d + "\\", NOME_CESTINO)
        if os.path.isdir(c):
            n = len(os.listdir(c))
            if n:
                out.append({"percorso": c, "elementi": n})
    return out
