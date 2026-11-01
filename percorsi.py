"""Dove stanno i file del programma e dove i dati dell'utente.

- Avviato da Python (python app.py): tutto nella cartella del progetto, come sempre.
- Avviato come .exe (PyInstaller): i file del programma (interfaccia, modelli) sono dentro l'eseguibile
  ed estratti in una cartella temporanea; i dati dell'utente vanno in %LOCALAPPDATA%\\PassionOrganizer,
  così sopravvivono alla chiusura e agli aggiornamenti del programma.
"""

import os
import sys
from pathlib import Path

CONGELATO = getattr(sys, "frozen", False)          # True quando gira come .exe

# file del programma: static/, telefono/
RISORSE = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))

# dati dell'utente: config.json, dati.json, media.json, voti.json, stagioni_cache/, …
if CONGELATO:
    DATI = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "PassionOrganizer"
else:
    DATI = Path(__file__).resolve().parent
DATI.mkdir(parents=True, exist_ok=True)

# eseguibile da avviare (per il collegamento "avvio con Windows")
ESEGUIBILE = Path(sys.executable) if CONGELATO else None
