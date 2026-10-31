# 🎮 Gestore Giochi

🇬🇧 [English](README.md) · 🇮🇹 **Italiano**

App per Windows che riunisce in un'unica libreria tutti i giochi sparsi su più dischi
(cartelle normali, Steam, Amazon, Riot…) e aiuta a tenerli in ordine.

## Funzioni

| Sezione | Cosa fa |
|---|---|
| **Libreria** | Tutti i giochi installati, con nome pulito, disco, dimensione, versione e copertina. ▶ Gioca, 📁 Apri cartella, 🗑 Elimina. Cornice 🟩/🟨/🟦 se esiste un installer di backup. |
| **Recenti** | I giochi della cartella "recenti" (es. `H:\Games\__ins`), ordinati per numero `0001_…`. |
| **Installer** | Installer e archivi (rar/zip/iso/setup). Cornice 🟩 gioco installato, 🟨 nome simile, 🟦 non installato. Raggruppamento in cartelle `_Installer` ed eliminazione in blocco. |
| **Doppioni** | Copie multiple dello stesso gioco: tiene la migliore (installata, nei recenti, disco più veloce, versione più alta) + l'archivio più recente come backup. |
| **Spazio** | Occupazione per disco con tipo e velocità (NVMe / SSD / HDD / USB), giochi più grandi, cartelle `_DaEliminare`. |
| **Riordina** | Rinomina in blocco con nomi puliti (mantiene la numerazione `0001_`), annulla ultima operazione. |

## Sicurezza

- Ogni operazione mostra prima un'**anteprima**.
- Rinomina / sposta / "metti da parte" sono **annullabili** (`registro.json`).
- "Metti da parte" sposta in `X:\_DaEliminare` sullo stesso disco (istantaneo).
- L'eliminazione definitiva richiede di scrivere **ELIMINA** ed è annotata in `eliminati.json`.
- I giochi **Steam** non vengono mai spostati né cancellati dall'app (si usa Steam).
- Radici dei dischi, cartelle principali dei giochi, `_Installer` e `_DaEliminare` sono protette.

## Installazione

```
pip install -r requirements.txt
pythonw app.py            # finestra propria
python app.py --browser   # nel browser, su http://127.0.0.1:5577
```

All'avvio con `--avvio` (usato dall'esecuzione automatica di Windows) aggiorna la libreria dopo 20 s.

## Lingua

L'interfaccia è disponibile in **italiano** e **inglese**: si sceglie in *Impostazioni → Lingua*.

## Configurazione

`config.json` viene creato al primo avvio:

- `fonti`: cartelle i cui sottoelementi sono giochi
- `contenitori`: sottocartelle che contengono giochi (es. `__ins`, `INS`)
- `recenti`: contenitori dei giochi più recenti
- `exe_scelti`: eseguibile scelto a mano per un gioco

Le librerie Steam vengono lette da `libraryfolders.vdf`.

## Struttura

| File | Ruolo |
|---|---|
| `app.py` | Server Flask + finestra pywebview, API, avvio giochi, copertine, velocità dischi |
| `scanner.py` | Scansione dischi, pulizia nomi, versioni, eseguibile principale, Steam, doppioni |
| `operazioni.py` | Anteprima / esecuzione / annullamento di rinomina, spostamento, eliminazione |
| `static/index.html` | Interfaccia (HTML + JS, nessuna dipendenza) |
| `static/i18n.js` | Traduzioni dell'interfaccia (italiano, inglese) |

File di dati locali (non nel repo): `dati.json`, `copertine.json`, `registro.json`, `eliminati.json`, `config.json`, `app.log`.
