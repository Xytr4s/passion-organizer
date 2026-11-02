"""Finestrella del promemoria dell'ora di stop: in alto a destra, sempre in primo piano, senza rubare
il controllo al gioco (non prende la tastiera). Parte come processo a sé: avviso.py '<json>'.

json: {titolo, testo, ok, rimanda (testo del pulsante o ""), porta}. "Rimanda" chiede all'app 15 minuti di pausa.
Si chiude da sola dopo 40 secondi. Non si vede sopra i giochi a schermo intero "esclusivo": lì resta il suono.
"""

import ctypes
import json
import sys
import tkinter as tk
import urllib.request

FONDO, TESTO, TENUE, BLU = "#1b1e27", "#e7e9ef", "#a3a8b8", "#3987e5"


def mostra(dati):
    root = tk.Tk()
    root.overrideredirect(True)
    root.attributes("-topmost", True)
    root.attributes("-alpha", 0.96)
    root.configure(bg=BLU)
    corpo = tk.Frame(root, bg=FONDO, padx=18, pady=14)
    corpo.pack(padx=(4, 0), pady=0, fill="both", expand=True)       # bordo blu a sinistra
    tk.Label(corpo, text=dati.get("titolo", ""), bg=FONDO, fg=TESTO, font=("Segoe UI Semibold", 14),
             anchor="w", justify="left").pack(fill="x")
    tk.Label(corpo, text=dati.get("testo", ""), bg=FONDO, fg=TENUE, font=("Segoe UI", 11), anchor="w",
             justify="left", wraplength=360).pack(fill="x", pady=(6, 12))
    pulsanti = tk.Frame(corpo, bg=FONDO)
    pulsanti.pack(fill="x")

    def chiudi():
        root.destroy()

    def rimanda():
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{dati.get('porta', 5577)}/api/tempo/promemoria",
                                         data=json.dumps({"rimanda": 15}).encode(),
                                         headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=5).read()
        except Exception:
            pass
        root.destroy()

    stile = dict(relief="flat", bd=0, padx=14, pady=6, font=("Segoe UI", 10), cursor="hand2")
    tk.Button(pulsanti, text=dati.get("ok", "OK"), command=chiudi, bg=BLU, fg="white",
              activebackground="#2f74c9", activeforeground="white", **stile).pack(side="right")
    if dati.get("rimanda"):
        tk.Button(pulsanti, text=dati["rimanda"], command=rimanda, bg="#2a2e3a", fg=TESTO,
                  activebackground="#363b49", activeforeground=TESTO, **stile).pack(side="right", padx=(0, 8))

    root.update_idletasks()
    w, h = max(400, root.winfo_reqwidth()), root.winfo_reqheight()
    posizione = f"{w}x{h}+{root.winfo_screenwidth() - w - 24}+24"     # in alto a destra
    root.geometry(posizione)
    root.update()
    root.geometry(posizione)                             # riapplicata dopo la comparsa (senza bordi a volte viene ignorata)

    # non prendere il controllo della tastiera: il gioco resta attivo (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW)
    try:
        u = ctypes.windll.user32
        hwnd = u.GetParent(root.winfo_id()) or root.winfo_id()
        stile_ex = u.GetWindowLongW(hwnd, -20)
        u.SetWindowLongW(hwnd, -20, stile_ex | 0x08000000 | 0x00000080)
        u.SetWindowPos(hwnd, -1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040)   # TOPMOST, senza attivare
    except Exception:
        pass
    try:
        import winsound
        winsound.MessageBeep(0x40)
    except Exception:
        pass

    def resta_sopra():                                   # alcuni giochi si rimettono sopra: riporta su la finestrella
        try:
            root.attributes("-topmost", True)
            root.lift()
        except tk.TclError:
            return
        root.after(1500, resta_sopra)

    resta_sopra()
    root.after(40000, chiudi)
    root.mainloop()


if __name__ == "__main__":
    mostra(json.loads(sys.argv[1]) if len(sys.argv) > 1 else {"titolo": "⏰ Prova", "testo": "Promemoria di prova.",
                                                                "ok": "OK", "rimanda": "Ancora 15 min"})
