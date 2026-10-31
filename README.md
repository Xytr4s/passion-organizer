# 🎮 Gestore Giochi (Game Manager)

🇬🇧 **English** · 🇮🇹 [Italiano](README.it.md)

A Windows app that gathers every game scattered across multiple drives (plain folders, Steam, Amazon, Riot…) into a single library and helps you keep it tidy.

📖 **Full guide in the [wiki](https://github.com/Xytr4s/gestore-giochi/wiki).**

## Features

| Section | What it does |
|---|---|
| **Library** | Every installed game with clean name, drive, size, version and cover art. ▶ Play, 📁 Open folder, 🗑 Delete. 🟩/🟨/🟦 frame if a backup installer exists. |
| **Recent** | Games from your "recent" folder (e.g. `H:\Games\__ins`), sorted by their `0001_…` number. |
| **Installers** | Installers and archives (rar/zip/iso/setup). Frame 🟩 game installed, 🟨 similar name, 🟦 not installed. Grouping into `_Installer` folders and bulk deletion. |
| **Duplicates** | Multiple copies of the same game: keeps the best one (installed, in recent, fastest drive, highest version) + the most recent archive as a backup. |
| **Space** | Usage per drive with type and speed (NVMe / SSD / HDD / USB), largest games, `_DaEliminare` folders. |
| **Tidy up** | Bulk renaming to clean names (keeps the `0001_` numbering), undo last operation. |

## Language

The interface is available in **Italian** and **English**: choose it in *Settings → Language*.

## Safety

- Every operation shows a **preview** first.
- Rename / move / "set aside" can be **undone** (`registro.json`).
- "Set aside" moves to `X:\_DaEliminare` on the same drive (instant).
- Permanent deletion requires typing **ELIMINA** and is logged in `eliminati.json`.
- **Steam** games are never moved or deleted by the app (use Steam).
- Drive roots, main game folders, `_Installer` and `_DaEliminare` are protected.

## Installation

```
pip install -r requirements.txt
pythonw app.py            # its own window
python app.py --browser   # in the browser, at http://127.0.0.1:5577
```

Launched with `--avvio` (used by start-with-Windows) it refreshes the library after 20 s.

## Configuration

`config.json` is created on first launch:

- `fonti`: folders whose sub-items are games
- `contenitori`: subfolders that contain games (e.g. `__ins`, `INS`)
- `recenti`: containers holding the most recent games
- `exe_scelti`: executable picked by hand for a game
- `lingua`: interface language (`it` / `en`)

Steam libraries are read from `libraryfolders.vdf`.

## Structure

| File | Role |
|---|---|
| `app.py` | Flask server + pywebview window, API, game launching, cover art, drive speed |
| `scanner.py` | Drive scanning, name cleaning, versions, main executable, Steam, duplicates |
| `operazioni.py` | Preview / run / undo of rename, move, delete |
| `static/index.html` | Interface (HTML + JS, no dependencies) |
| `static/i18n.js` | Interface translations (Italian, English) |

Local data files (not in the repo): `dati.json`, `copertine.json`, `registro.json`, `eliminati.json`, `config.json`, `app.log`.
