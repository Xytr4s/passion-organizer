"""Tracker di serie TV, film e anime: dati locali in media.json, schede da TVmaze (serie) e AniList (anime).

Ogni titolo ha una o più stagioni; ogni stagione ha episodi visti/totali e uno stato:
  da_vedere · in_corso · completata · droppata · in_pausa
"""

import json
import re
import threading
import time
import uuid
from datetime import date, datetime
from difflib import SequenceMatcher
from pathlib import Path

import requests

BASE = Path(__file__).resolve().parent
FILE = BASE / "media.json"
STATI = ("in_corso", "da_vedere", "in_pausa", "completata", "droppata")
_lock = threading.Lock()


# ================================================================ archivio

def carica():
    if FILE.exists():
        d = json.loads(FILE.read_text(encoding="utf-8"))
        for t in d["titoli"]:                       # film aggiunti nella scheda serie prima della sezione Film
            if t.get("tipo") == "film" and t.get("categoria") == "serie":
                t["categoria"] = "film"
        return d
    return {"titoli": [], "da_confermare": []}


def salva(d):
    tmp = FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(FILE)


def adesso():
    return datetime.now().isoformat(timespec="seconds")


def nuova_stagione(numero, episodi_totali=None, stato="da_vedere"):
    return {"numero": numero, "episodi_totali": episodi_totali, "visti": 0, "stato": stato,
            "voto": None, "inizio": None, "fine": None, "note": "", "aggiornato": adesso()}


def stato_generale(t):
    """Stato del titolo intero, ricavato dalle stagioni."""
    st = [s["stato"] for s in t["stagioni"]] or ["da_vedere"]
    for x in ("in_corso", "in_pausa"):
        if x in st:
            return x
    if "droppata" in st:
        return "droppata"      # droppata una stagione (e nessun'altra in corso): serie droppata
    if all(s == "completata" for s in st):
        return "completata"
    if "completata" in st:
        return "in_corso"      # finite alcune stagioni, le prossime ancora da iniziare
    return "da_vedere"


def _aggiorna_stato(t):
    t["stato"] = stato_generale(t)
    t["aggiornato"] = adesso()


def stagione_attuale(t):
    """La stagione su cui si sta lavorando: la prima non completata/droppata, altrimenti l'ultima."""
    for s in t["stagioni"]:
        if s["stato"] not in ("completata", "droppata"):
            return s
    return t["stagioni"][-1] if t["stagioni"] else None


def trova(d, mid):
    return next((t for t in d["titoli"] if t["id"] == mid), None)


# ================================================================ modifiche

def aggiungi(scheda):
    """scheda: {categoria, tipo, titolo, fonte, fonte_id, anno, copertina, trama, stagioni:[{numero, episodi_totali}], alias}"""
    with _lock:
        d = carica()
        if scheda.get("fonte_id"):
            gia = next((t for t in d["titoli"] if t.get("fonte") == scheda.get("fonte") and t.get("fonte_id") == scheda["fonte_id"]), None)
            if gia:
                return gia
        stagioni = scheda.get("stagioni") or [{"numero": 1, "episodi_totali": None}]
        t = {
            "id": uuid.uuid4().hex[:10], "categoria": scheda.get("categoria", "serie"), "tipo": scheda.get("tipo", "serie"),
            "titolo": scheda["titolo"].strip(), "titolo_originale": scheda.get("titolo_originale", ""),
            "fonte": scheda.get("fonte", "manuale"), "fonte_id": scheda.get("fonte_id"),
            "anno": scheda.get("anno"), "copertina": scheda.get("copertina"), "trama": scheda.get("trama", ""),
            "alias": [a for a in scheda.get("alias", []) if a], "voto": None, "note": "",
            "stagioni": [nuova_stagione(s["numero"], s.get("episodi_totali")) for s in stagioni],
            "creato": adesso(),
        }
        _aggiorna_stato(t)
        d["titoli"].append(t)
        salva(d)
        return t


def modifica(mid, campi):
    """Modifica campi del titolo (voto, note, alias, titolo) o di una stagione (campi['stagione'] = numero)."""
    with _lock:
        d = carica()
        t = trova(d, mid)
        if not t:
            return None
        if "stagione" in campi:
            s = next((x for x in t["stagioni"] if x["numero"] == campi["stagione"]), None)
            if not s:
                return None
            for k in ("episodi_totali", "visti", "stato", "voto", "note", "inizio", "fine"):
                if k in campi:
                    s[k] = campi[k]
            _coerenza(s)
            s["aggiornato"] = adesso()
        else:
            for k in ("titolo", "voto", "note", "alias", "anno", "copertina", "trama"):
                if k in campi:
                    t[k] = campi[k]
        _aggiorna_stato(t)
        salva(d)
        return t


def _coerenza(s):
    """Regole automatiche: date di inizio/fine, completata quando visti = totali."""
    s["visti"] = max(0, int(s.get("visti") or 0))
    if s.get("episodi_totali"):
        s["visti"] = min(s["visti"], int(s["episodi_totali"]))
    oggi = date.today().isoformat()
    if s["visti"] > 0 and not s.get("inizio"):
        s["inizio"] = oggi
    if s["visti"] > 0 and s["stato"] == "da_vedere":
        s["stato"] = "in_corso"
    if s.get("episodi_totali") and s["visti"] >= int(s["episodi_totali"]) and s["stato"] in ("in_corso", "da_vedere", "in_pausa"):
        s["stato"] = "completata"
    if s["stato"] in ("completata", "droppata") and not s.get("fine"):
        s["fine"] = oggi


def episodio(mid, numero_stagione, delta=1, episodio_esatto=None):
    """+1 / -1 episodio, oppure imposta l'episodio visto (dall'estensione)."""
    with _lock:
        d = carica()
        t = trova(d, mid)
        if not t:
            return None
        s = next((x for x in t["stagioni"] if x["numero"] == numero_stagione), None) if numero_stagione else stagione_attuale(t)
        if s is None:
            s = nuova_stagione(numero_stagione)
            t["stagioni"].append(s)
            t["stagioni"].sort(key=lambda x: x["numero"])
        if episodio_esatto is not None:
            if episodio_esatto <= s["visti"]:
                return t                                    # rivisto un episodio già segnato: niente
            s["visti"] = episodio_esatto
            if s["stato"] in ("da_vedere", "in_pausa", "droppata"):
                s["stato"] = "in_corso"
        else:
            s["visti"] += delta
            if delta < 0 and s["stato"] == "completata":
                s["stato"] = "in_corso"
                s["fine"] = None
        _coerenza(s)
        s["aggiornato"] = adesso()
        _aggiorna_stato(t)
        salva(d)
        return t


def aggiungi_stagione(mid, episodi_totali=None):
    with _lock:
        d = carica()
        t = trova(d, mid)
        n = max([s["numero"] for s in t["stagioni"]] or [0]) + 1
        t["stagioni"].append(nuova_stagione(n, episodi_totali))
        _aggiorna_stato(t)
        salva(d)
        return t


def elimina_stagione(mid, numero):
    with _lock:
        d = carica()
        t = trova(d, mid)
        if t and len(t["stagioni"]) > 1:
            t["stagioni"] = [s for s in t["stagioni"] if s["numero"] != numero]
            _aggiorna_stato(t)
            salva(d)
        return t


def elimina(mid):
    with _lock:
        d = carica()
        d["titoli"] = [t for t in d["titoli"] if t["id"] != mid]
        d.setdefault("eliminati", []).append(mid)     # da comunicare al foglio del telefono
        salva(d)


# ================================================================ fonti esterne

def cerca_serie(q):
    """TVmaze: serie TV (gratuito, senza chiave)."""
    r = requests.get("https://api.tvmaze.com/search/shows", params={"q": q}, timeout=15)
    out = []
    for x in r.json()[:12]:
        s = x["show"]
        out.append({
            "categoria": "serie", "tipo": "serie", "fonte": "tvmaze", "fonte_id": str(s["id"]), "titolo": s["name"],
            "anno": (s.get("premiered") or "")[:4] or None, "copertina": (s.get("image") or {}).get("medium"),
            "trama": re.sub("<[^>]+>", "", s.get("summary") or "")[:400], "lingua": s.get("language"),
            "stato_serie": s.get("status"), "rete": ((s.get("network") or s.get("webChannel") or {}) or {}).get("name"),
        })
    return out


def stagioni_tvmaze(fonte_id):
    r = requests.get(f"https://api.tvmaze.com/shows/{fonte_id}/seasons", timeout=15)
    out = []
    for s in r.json():
        if s.get("number") is None:
            continue
        tot = s.get("episodeOrder")
        if not tot:
            try:
                ep = requests.get(f"https://api.tvmaze.com/seasons/{s['id']}/episodes", timeout=15).json()
                tot = len([e for e in ep if e.get("type", "regular") == "regular"]) or None
            except Exception:
                tot = None
        out.append({"numero": s["number"], "episodi_totali": tot})
    return out or [{"numero": 1, "episodi_totali": None}]


ANILIST_QUERY = """
query ($q: String) { Page(perPage: 12) { media(search: $q, type: ANIME) {
  id title { romaji english native } synonyms episodes format status seasonYear
  coverImage { large } description(asHtml: false) } } }"""


def cerca_anime(q):
    """AniList: anime (gratuito, senza chiave). Su AniList ogni stagione è una scheda a sé."""
    r = requests.post("https://graphql.anilist.co", json={"query": ANILIST_QUERY, "variables": {"q": q}}, timeout=15)
    out = []
    for m in r.json()["data"]["Page"]["media"]:
        tit = m["title"]
        out.append({
            "categoria": "anime", "tipo": "film" if m.get("format") == "MOVIE" else "serie", "fonte": "anilist",
            "fonte_id": str(m["id"]), "titolo": tit.get("english") or tit.get("romaji"), "titolo_originale": tit.get("romaji") or "",
            "anno": m.get("seasonYear"), "copertina": (m.get("coverImage") or {}).get("large"),
            "trama": re.sub("<[^>]+>", "", m.get("description") or "")[:400], "formato": m.get("format"),
            "stato_serie": m.get("status"), "episodi": m.get("episodes"),
            "alias": [x for x in [tit.get("romaji"), tit.get("english")] + (m.get("synonyms") or []) if x],
            "stagioni": [{"numero": 1, "episodi_totali": m.get("episodes")}],
        })
    return out


def cerca_film(q):
    """Film dai suggerimenti di ricerca di IMDb (servizio non ufficiale, senza chiave)."""
    r = requests.get(f"https://v2.sg.media-imdb.com/suggestion/x/{requests.utils.quote(q.lower())}.json",
                     headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
    out = []
    for x in r.json().get("d", []):
        if x.get("qid") not in ("movie", "tvMovie"):
            continue
        img = (x.get("i") or {}).get("imageUrl")
        if img and "._V1_" in img:
            img = img.split("._V1_")[0] + "._V1_UX300_.jpg"       # locandina ridotta, più leggera
        out.append({"categoria": "film", "tipo": "film", "fonte": "imdb", "fonte_id": x.get("id"),
                    "titolo": x.get("l"), "anno": x.get("y"), "copertina": img, "trama": x.get("s", ""),
                    "stagioni": [{"numero": 1, "episodi_totali": 1}]})
    return out[:12]


def scheda_completa(risultato):
    """Prima di aggiungere: per le serie TVmaze scarica le stagioni con il numero di episodi."""
    if risultato.get("fonte") == "tvmaze" and not risultato.get("stagioni"):
        risultato["stagioni"] = stagioni_tvmaze(risultato["fonte_id"])
    if risultato.get("tipo") == "film":
        risultato["stagioni"] = [{"numero": 1, "episodi_totali": 1}]
    return risultato


# ================================================================ estensione del browser

RUMORE_TITOLO = re.compile(
    r"\b(streaming|guarda|watch|online|gratis|free|hd|full ?hd|4k|sub ?ita|ita|eng|dub|doppiato|"
    r"episodio|episode|ep|stagione|season|serie ?tv|anime|film|movie|in|su|on)\b", re.I)


def analizza_pagina(titolo_pagina, url="", nome_sito=""):
    """Dal titolo della scheda e dall'indirizzo ricava (titolo, stagione, episodio)."""
    testo = f"{titolo_pagina} {url.replace('-', ' ').replace('_', ' ').replace('/', ' ')}"
    stagione = episodio = None
    for pat in (r"\bS(\d{1,2})\s*E(\d{1,4})\b", r"\b(\d{1,2})x(\d{1,4})\b",
                r"stagione\s*(\d{1,2}).{0,20}?episodio\s*(\d{1,4})", r"season\s*(\d{1,2}).{0,20}?episode\s*(\d{1,4})"):
        m = re.search(pat, testo, re.I)
        if m:
            stagione, episodio = int(m.group(1)), int(m.group(2))
            break
    if episodio is None:
        m = re.search(r"\b(?:episodio|episode|ep)\.?\s*(\d{1,4})\b", testo, re.I)
        if m:
            episodio = int(m.group(1))
    if stagione is None:
        m = re.search(r"\b(?:stagione|season)\s*(\d{1,2})\b", testo, re.I)
        if m:
            stagione = int(m.group(1))
    # nome della serie: parte del titolo prima dei riferimenti a episodio/stagione, senza il nome del sito
    t = titolo_pagina
    if nome_sito:
        t = re.sub(re.escape(nome_sito), " ", t, flags=re.I)
    t = re.split(r"\bS\d{1,2}\s*E\d|\b\d{1,2}x\d|\b(?:stagione|season|episodio|episode|ep)\b\.?\s*\d", t, flags=re.I)[0]
    pezzi = [p.strip() for p in re.split(r"\s[|–—-]\s|\s·\s", t) if p.strip()]
    t = max(pezzi, key=len) if pezzi else t
    t = RUMORE_TITOLO.sub(" ", t)
    t = re.sub(r"[\(\[].*?[\)\]]", " ", t)
    t = re.sub(r"\s+", " ", t).strip(" -:|·")
    return t, stagione, episodio


def chiave(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def abbina(d, titolo, categoria=None):
    """Titolo già in lista più simile (titolo, originale, alias). Restituisce (titolo, somiglianza)."""
    k = chiave(titolo)
    if not k:
        return None, 0
    migliore, punti = None, 0.0
    for t in d["titoli"]:
        if categoria and t["categoria"] != categoria:
            continue
        for nome in [t["titolo"], t.get("titolo_originale")] + t.get("alias", []):
            kn = chiave(nome)
            if not kn:
                continue
            p = 1.0 if kn == k else 0.92 if (len(k) >= 5 and (k in kn or kn in k)) else SequenceMatcher(None, k, kn).ratio()
            if p > punti:
                migliore, punti = t, p
    return migliore, punti


def da_estensione(dati_pagina):
    """Chiamato dall'estensione di Firefox quando hai guardato un episodio.
    dati_pagina: {titolo, url, sito, categoria, automatico}"""
    titolo, stagione, ep = analizza_pagina(dati_pagina.get("titolo", ""), dati_pagina.get("url", ""), dati_pagina.get("sito", ""))
    categoria = dati_pagina.get("categoria")
    if categoria == "film" and titolo:
        stagione, ep = 1, 1                          # un film è un solo "episodio": guardato = visto
    if not titolo or ep is None:
        return {"esito": "non_riconosciuto", "titolo": titolo, "stagione": stagione, "episodio": ep}
    d = carica()
    t, punti = abbina(d, titolo, categoria)
    if t and punti >= 0.85:
        if stagione is None and t["categoria"] == "anime":
            stagione = stagione_attuale(t)["numero"] if t["stagioni"] else 1
        prima = stagione_attuale(t)
        t2 = episodio(t["id"], stagione, episodio_esatto=ep)
        return {"esito": "aggiornato", "id": t2["id"], "titolo": t2["titolo"], "stagione": stagione or (prima or {}).get("numero"),
                "episodio": ep, "stato": t2["stato"]}
    # non in lista: va nella casella "da confermare" dell'app (non si aggiunge nulla da solo)
    with _lock:
        d = carica()
        voce = {"id": uuid.uuid4().hex[:10], "titolo": titolo, "stagione": stagione, "episodio": ep, "categoria": categoria,
                "pagina": dati_pagina.get("titolo", ""), "quando": adesso()}
        d["da_confermare"] = [x for x in d["da_confermare"] if chiave(x["titolo"]) != chiave(titolo)] + [voce]
        salva(d)
    return {"esito": "da_confermare", "titolo": titolo, "stagione": stagione, "episodio": ep,
            "simile": t["titolo"] if t and punti >= 0.6 else None}


def conferma(voce_id, mid=None, scheda=None):
    """Risolve una voce 'da confermare': collega a un titolo esistente (mid) o a una nuova scheda; aggiunge l'alias."""
    d = carica()
    voce = next((x for x in d["da_confermare"] if x["id"] == voce_id), None)
    if not voce:
        return None
    if scheda:
        t = aggiungi(scheda_completa(scheda))
        mid = t["id"]
    if mid:
        t = trova(carica(), mid)
        if chiave(voce["titolo"]) not in [chiave(a) for a in [t["titolo"]] + t.get("alias", [])]:
            modifica(mid, {"alias": t.get("alias", []) + [voce["titolo"]]})   # la prossima volta lo riconosce da solo
        stagione = voce["stagione"] or (stagione_attuale(t)["numero"] if t["stagioni"] else 1)
        episodio(mid, stagione, episodio_esatto=voce["episodio"])
    with _lock:
        d = carica()
        d["da_confermare"] = [x for x in d["da_confermare"] if x["id"] != voce_id]
        salva(d)
    return trova(carica(), mid) if mid else None


# ================================================================ importazione da AnimeUnity (profilo pubblico)

STATI_ANIMEUNITY = {"Watching": "in_corso", "Completed": "completata", "Dropped": "droppata",
                    "Plan To Watch": "da_vedere", "On Hold": "in_pausa", "Paused": "in_pausa"}


def leggi_profilo_animeunity(url):
    """Scarica la lista pubblica di un profilo AnimeUnity (es. https://www.animeunity.co/user/NOME/animelist)."""
    import html as _html
    m = re.match(r"^https://(www\.)?animeunity\.[a-z]+/user/[^/]+/animelist/?$", url.strip())
    if not m:
        raise ValueError("indirizzo non valido: deve essere https://www.animeunity…/user/NOME/animelist")
    r = requests.get(url.strip(), headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
                                           "Accept-Language": "it-IT,it;q=0.9"}, timeout=60)
    r.raise_for_status()
    m = re.search(r'<anime-list[^>]*?records="(.*?)"', r.text, re.S)
    if not m:
        raise ValueError("lista non trovata nella pagina (profilo privato o pagina cambiata)")
    return json.loads(_html.unescape(m.group(1)))


def _data_locale(s):
    return (s or "").replace(" ", "T")[:19] or None


def importa_animeunity(records):
    """Aggiunge o aggiorna gli anime della lista. Per i titoli già presenti vince la modifica più recente."""
    unici = {}
    for r in records:
        data = ((r.get("pivot") or {}).get("updated_at") or "")
        vecchio = unici.get(r["id"])
        if vecchio is None or data > ((vecchio.get("pivot") or {}).get("updated_at") or ""):
            unici[r["id"]] = r
    records = list(unici.values())
    with _lock:
        d = carica()
        # ogni voce di AnimeUnity ha un suo codice (la versione doppiata "ITA" è una voce separata con lo stesso codice AniList)
        per_au = {t["au_id"]: t for t in d["titoli"] if t.get("au_id")}
        nuovi = aggiornati = invariati = 0
        for r in records:
            p = r.get("pivot") or {}
            stato = STATI_ANIMEUNITY.get(p.get("status"), "da_vedere")
            # serie finita: episodi totali; serie in onda: solo il totale previsto (se il sito non lo sa, sconosciuto),
            # perché real_episodes_count sono gli episodi usciti finora e bloccherebbe il conteggio alle nuove uscite
            if r.get("status") == "Terminato":
                totali = r.get("episodes_count") or r.get("real_episodes_count") or None
            else:
                totali = r.get("episodes_count") or None
            visti = int(p.get("progress") or 0)
            if totali and visti > totali:
                totali = visti                          # dato del sito non aggiornato
            if stato == "completata":
                visti = totali or visti
            elif stato == "da_vedere":
                visti = 0                               # pianificato: nessun episodio contato
            aggiornato = _data_locale(p.get("updated_at")) or _data_locale(p.get("created_at")) or "2000-01-01T00:00:00"
            fonte_id = str(r["anilist_id"]) if r.get("anilist_id") else None
            au_id = str(r["id"])
            t = per_au.get(au_id)
            if t and (t.get("aggiornato") or "") >= aggiornato:
                invariati += 1                          # modificato nel Gestore dopo l'ultima modifica sul sito
                if r.get("mal_id") and not t.get("mal_id"):
                    t["mal_id"] = str(r["mal_id"])
                continue
            nomi = [x for x in (r.get("title_eng"), r.get("title"), r.get("title_it")) if x]
            stagione = nuova_stagione(1, totali, stato)
            stagione.update(visti=visti, voto=p.get("score") or None,
                            inizio=(p.get("created_at") or "")[:10] or None,
                            fine=(p.get("updated_at") or "")[:10] if stato in ("completata", "droppata") else None,
                            aggiornato=aggiornato)
            scheda = {
                "categoria": "anime", "tipo": "film" if r.get("type") == "Movie" else "serie",
                "titolo": nomi[0] if nomi else r.get("slug", "?"), "titolo_originale": r.get("title") or "",
                "fonte": "anilist" if r.get("anilist_id") else "animeunity", "fonte_id": fonte_id, "au_id": au_id,
                "anno": r.get("date"), "copertina": r.get("imageurl"), "trama": (r.get("plot") or "")[:600],
                "alias": list(dict.fromkeys(nomi)), "voto": p.get("score") or None,
                "preferito": bool(p.get("favorite")), "stagioni": [stagione],
                "mal_id": str(r["mal_id"]) if r.get("mal_id") else None,
            }
            if t:
                t.update({k: v for k, v in scheda.items() if k not in ("alias",)})
                t["alias"] = list(dict.fromkeys(t.get("alias", []) + scheda["alias"]))
                aggiornati += 1
            else:
                t = {"id": uuid.uuid4().hex[:10], "note": "", "creato": adesso(), **scheda}
                d["titoli"].append(t)
                per_au[au_id] = t
                nuovi += 1
            t["stato"] = stato_generale(t)
            t["aggiornato"] = aggiornato
        salva(d)
    return {"nuovi": nuovi, "aggiornati": aggiornati, "invariati": invariati, "totale": len(records)}


# ================================================================ stagione di MyAnimeList (anime per voto)

STAGIONI = ["winter", "spring", "summer", "fall"]
CACHE_STAGIONI = BASE / "stagioni_cache"


def stagione_attuale_mal(oggi=None):
    oggi = oggi or date.today()
    return oggi.year, STAGIONI[(oggi.month - 1) // 3]


def stagione_vicina(anno, stagione, passo):
    i = STAGIONI.index(stagione) + passo
    return anno + i // 4, STAGIONI[i % 4]


def _testo_html(s):
    import html as _html
    return re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def leggi_stagione_mal(anno, stagione, forza=False):
    """Anime della stagione dalla pagina di MyAnimeList (con cache di 6 ore)."""
    CACHE_STAGIONI.mkdir(exist_ok=True)
    f = CACHE_STAGIONI / f"{anno}-{stagione}.json"
    # stagione in corso o futura: si aggiorna ogni 6 ore; stagioni passate: una volta al mese (i voti cambiano poco)
    passata = (anno, STAGIONI.index(stagione)) < (lambda a, s: (a, STAGIONI.index(s)))(*stagione_attuale_mal())
    futura = (anno, STAGIONI.index(stagione)) > (lambda a, s: (a, STAGIONI.index(s)))(*stagione_attuale_mal())
    durata = 30 * 86400 if passata else 86400 if futura else 6 * 3600
    if f.exists() and not forza and time.time() - f.stat().st_mtime < durata:
        return json.loads(f.read_text(encoding="utf-8"))
    r = requests.get(f"https://myanimelist.net/anime/season/{anno}/{stagione}",
                     headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0"},
                     timeout=60)
    r.raise_for_status()
    titolo = (re.search(r"<title>\s*(\w+)\s+(\d{4})\s+-\s+Anime", r.text) or [None, "", ""])
    if (titolo[1].lower(), titolo[2]) != (stagione, str(anno)):
        f.write_text("[]", encoding="utf-8")       # stagione non ancora pubblicata: nessun anime (si ricontrolla)
        return []
    out, visti = [], set()
    # la pagina è divisa in sezioni: TV (New), TV (Continuing), ONA, OVA, Movie, Special
    pezzi = re.split(r'<div class="anime-header">([^<]+)</div>', r.text)
    for k in range(1, len(pezzi), 2):
        sezione, contenuto = pezzi[k].strip(), pezzi[k + 1]
        for blocco in contenuto.split('class="js-anime-category-producer seasonal-anime js-seasonal-anime')[1:]:
            m = re.search(r'href="https://myanimelist\.net/anime/(\d+)/', blocco)
            if not m or m.group(1) in visti:
                continue
            visti.add(m.group(1))
            prendi = lambda cls: (re.search(rf'class="{cls}">([^<]*)<', blocco) or [None, ""])[1].strip()
            voto = prendi("js-score")
            ep = re.search(r"<span>(\d+|\?) eps?</span>", blocco)
            img = re.search(r'<img[^>]+(?:data-src|src)="(https://cdn\.myanimelist\.net/[^"]+)"', blocco)
            piattaforme = []
            raw = re.search(r"data-raw='(\{.*?\})'", blocco, re.S)
            if raw:
                try:
                    piattaforme = [p["platform"]["name"] for p in json.loads(raw.group(1)).get("data", []) if p.get("available")]
                except Exception:
                    pass
            out.append({
                "mal_id": m.group(1), "titolo": prendi("js-title") or "?", "sezione": sezione,
                "voto_mal": float(voto) if re.fullmatch(r"\d+(\.\d+)?", voto) and float(voto) > 0 else None,
                "membri": int(prendi("js-members") or 0), "inizio": prendi("js-start_date"),
                "episodi": int(ep.group(1)) if ep and ep.group(1).isdigit() else None,
                "generi": [_testo_html(g) for g in re.findall(r'<span class="genre">\s*<a[^>]*>(.*?)</a>', blocco)][:4],
                "copertina": img.group(1) if img else None,
                "trama": _testo_html((re.search(r'<p class="preline">(.*?)</p>', blocco, re.S) or [None, ""])[1])[:500],
                "piattaforme": list(dict.fromkeys(piattaforme))[:4],
            })
    f.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def stagione_per_interfaccia(anno, stagione, forza=False):
    voci = leggi_stagione_mal(anno, stagione, forza)
    d = carica()
    per_mal = {str(t.get("mal_id")): t for t in d["titoli"] if t.get("mal_id")}
    scartati = set(d.get("stagione_scartati", []))
    for v in voci:
        t = per_mal.get(v["mal_id"])
        if t is None:
            t, punti = abbina(d, v["titolo"], "anime")
            t = t if punti >= 0.95 else None
        v["in_lista"] = {"id": t["id"], "stato": t["stato"]} if t else None
        v["scartato"] = v["mal_id"] in scartati
    vista = f"{anno}-{stagione}"
    if vista not in d.get("stagioni_viste", []):
        d.setdefault("stagioni_viste", []).append(vista)
        salva(d)
    return {"anno": anno, "stagione": stagione, "voci": voci}


def scelta_stagione(voce, azione):
    """▶ guarda / 📌 pianifica / ✕ scarta / ripristina, per un anime della pagina stagionale."""
    if azione in ("scarta", "ripristina"):
        with _lock:
            d = carica()
            s = set(d.get("stagione_scartati", []))
            (s.add if azione == "scarta" else s.discard)(str(voce["mal_id"]))
            d["stagione_scartati"] = sorted(s)
            salva(d)
        return {"ok": True}
    stato = "in_corso" if azione == "guarda" else "da_vedere"
    esistente = (voce.get("in_lista") or {}).get("id")
    if not esistente:
        t = aggiungi({"categoria": "anime", "tipo": "film" if voce.get("sezione") == "Movie" else "serie",
                      "titolo": voce["titolo"], "fonte": "mal", "fonte_id": str(voce["mal_id"]),
                      "anno": (voce.get("inizio") or "")[:4] or None, "copertina": voce.get("copertina"),
                      "trama": voce.get("trama", ""), "alias": [voce["titolo"]],
                      "stagioni": [{"numero": 1, "episodi_totali": voce.get("episodi")}]})
        esistente = t["id"]
        with _lock:
            d = carica()
            for x in d["titoli"]:
                if x["id"] == esistente:
                    x["mal_id"] = str(voce["mal_id"])
            salva(d)
    t = trova(carica(), esistente)
    numero = (stagione_attuale(t) or {}).get("numero", 1)
    return modifica(esistente, {"stagione": numero, "stato": stato})



# ================================================================ archivio delle stagioni dal 2020

ARCHIVIO = {"in_corso": False, "fatte": 0, "totale": 0, "errore": None}


def elenco_stagioni(dal=2020, future=4):
    """Dall'inverno dell'anno indicato fino a `future` stagioni dopo quella in corso."""
    fine = stagione_vicina(*stagione_attuale_mal(), future)
    out, a, st = [], dal, "winter"
    while (a, STAGIONI.index(st)) <= (fine[0], STAGIONI.index(fine[1])):
        out.append((a, st))
        a, st = stagione_vicina(a, st, 1)
    return out


PRIMO_ANNO_MAL = 1917     # le pagine stagionali di MyAnimeList partono da qui (molte annate antiche sono quasi vuote)


def ordine_scaricamento():
    """Prima le stagioni dal 2020 (più le future), poi a ritroso dal 2019 fino al 1917."""
    recenti = elenco_stagioni(2020)
    storiche = [x for x in elenco_stagioni(PRIMO_ANNO_MAL, future=0) if x[0] < 2020]
    return recenti + list(reversed(storiche))


def scarica_archivio(pausa=15):
    """In background: scarica le stagioni mancanti, una ogni `pausa` secondi (gentile con MyAnimeList)."""
    elenco = ordine_scaricamento()
    ARCHIVIO.update(in_corso=True, totale=len(elenco), errore=None)
    try:
        for i, (a, st) in enumerate(elenco):
            f = CACHE_STAGIONI / f"{a}-{st}.json"
            ARCHIVIO["fatte"] = i
            futura = (a, STAGIONI.index(st)) > (lambda x, y: (x, STAGIONI.index(y)))(*stagione_attuale_mal())
            if f.exists() and not (futura and time.time() - f.stat().st_mtime > 86400):
                continue
            try:
                leggi_stagione_mal(a, st)
            except Exception as e:
                ARCHIVIO["errore"] = f"{a} {st}: {e}"
            time.sleep(pausa)
        ARCHIVIO["fatte"] = len(elenco)
    finally:
        ARCHIVIO["in_corso"] = False


def archivio_per_interfaccia():
    """Tutte le stagioni scaricate insieme: ogni anime una volta sola, con la stagione in cui è uscito."""
    d = carica()
    per_mal = {str(t.get("mal_id")): t for t in d["titoli"] if t.get("mal_id")}
    scartati = set(d.get("stagione_scartati", []))
    voci, visti, scaricate = [], {}, 0
    for a, st in elenco_stagioni(PRIMO_ANNO_MAL, future=0):
        f = CACHE_STAGIONI / f"{a}-{st}.json"
        if not f.exists():
            continue
        scaricate += 1
        for v in json.loads(f.read_text(encoding="utf-8")):
            vecchia = visti.get(v["mal_id"])
            if vecchia is not None:
                # già vista in una stagione precedente: tengo l'uscita, aggiorno solo voto e membri più recenti
                vecchia["voto_mal"] = v["voto_mal"] or vecchia["voto_mal"]
                vecchia["membri"] = max(vecchia["membri"], v["membri"])
                continue
            v = dict(v, anno_stagione=a, nome_stagione=st)
            if v["sezione"] == "TV (Continuing)":
                v["sezione"] = "TV (New)"     # serie iniziata prima del 2020: la tratto come una serie TV
            t = per_mal.get(v["mal_id"])
            v["in_lista"] = {"id": t["id"], "stato": t["stato"]} if t else None
            v["scartato"] = v["mal_id"] in scartati
            visti[v["mal_id"]] = v
            voci.append(v)
    return {"voci": voci, "scaricate": scaricate, "totale": len(elenco_stagioni(PRIMO_ANNO_MAL, future=0)),
            "scaricamento": dict(ARCHIVIO)}
