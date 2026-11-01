// Traduzioni dell'interfaccia. t("chiave", {param}) -> testo nella lingua scelta.
// Per aggiungere una lingua: copia il blocco "en" e traducilo.
const LINGUE = {it: "Italiano", en: "English"};
let LINGUA = "it";

const TESTI = {
  it: {
    // header e navigazione
    aggiorna: "↻ Aggiorna", chiudi_app: "Chiudi l'app",
    nav_libreria: "Libreria", nav_recenti: "Recenti", nav_installer: "Installer", nav_doppioni: "Doppioni",
    nav_spazio: "Spazio", nav_riordina: "Riordina", nav_impostazioni: "Impostazioni",
    // card
    tipo_installato: "installato", tipo_installer: "installer", tipo_archivio: "archivio", tipo_vuoto: "vuota", tipo_sconosciuto: "senza exe",
    recente: "recente", demo: "demo",
    installer_su: "📦 installer su {dove}", installer_simile: "? installer simile: {nome}", nessun_installer: "nessun installer",
    installato_su: "✔ installato su {dove}", simile_a: "? simile a {nome}", non_installato: "non installato",
    apri: "📁 Apri", gioca: "▶ Gioca", apri_cartella_tt: "Apri cartella",
    disinstalla_steam_tt: "Disinstalla con Steam", elimina_def_tt: "Elimina definitivamente",
    // filtri
    cerca: "🔍 Cerca un gioco…", tutti_dischi: "Tutti i dischi",
    f_inst_tutti: "Installer e archivi", f_inst_con: "🟩 Con gioco installato", f_inst_forse: "🟨 Forse (nome simile)",
    f_inst_senza: "🟦 Gioco non installato", f_inst_cartelle: "Solo cartelle di installazione", f_inst_archivi: "Solo archivi (rar/zip/iso…)",
    f_tutti: "Tutti i tipi", f_giocabili: "Pronti da giocare", f_con: "🟩 Con installer", f_forse: "🟨 Installer simile",
    f_senza: "🟦 Senza installer", f_steam: "Solo Steam", f_senza_exe: "Senza eseguibile", f_vuote: "Cartelle vuote",
    o_nome: "Ordina: nome", o_dim: "Ordina: dimensione", o_data: "Ordina: modificati di recente", o_disco: "Ordina: disco",
    nessun_gioco: "Nessun gioco.", premi_aggiorna: "Premi “↻ Aggiorna” per cercare i giochi sui dischi.",
    mostra_altri: "Mostra altri ({n})", conteggio: "{n} giochi · {dim}",
    recenti_intro: "Giochi delle cartelle “recenti”, dal più nuovo in base al numero d'ordine.",
    // installer
    inst_tot: "{n} installer e archivi", inst_con: "🟩 {n} con gioco installato", inst_forse: "🟨 {n} forse (nome simile)", inst_senza: "🟦 {n} non installati",
    raggruppa_btn: "📦 Raggruppa {n} nelle cartelle _Installer",
    raggruppa_info: "Ogni installer va nella sottocartella <code>_Installer</code> accanto a dov'è ora (es. <code>Y:\\Games\\_Installer</code>). Stesso disco: istantaneo e annullabile.",
    gia_raggruppati: "✔ Tutti gli installer sono già raggruppati nelle cartelle _Installer.",
    blocco_btn: "🗑 Elimina in blocco gli installer 🟩 verdi / 🟨 gialli",
    blocco_info: "Solo installer e archivi di giochi già installati: i giochi installati non vengono toccati.",
    blocco_titolo: "Elimina installer in blocco",
    blocco_intro: "Vengono eliminati solo gli <b>installer/archivi</b> spuntati. I giochi installati restano dove sono.",
    verdi: "🟩 Verdi: {n} ({dim})", gialli: "🟨 Gialli: {n} ({dim})",
    gialli_avviso: "🟨 Gialli: controlla che il gioco simile sia davvero lo stesso",
    installato_dp: "✔ installato:", simile_dp: "? simile a:",
    selezionati: "Selezionati: <b>{n}</b> · spazio liberato: <b>{dim}</b>",
    annulla: "Annulla", metti_parte_recup: "🗑 Metti da parte (recuperabile)", elimina_def_dots: "❌ Elimina definitivamente…",
    nessun_installer_sel: "Nessun installer selezionato",
    et_blocco_elimina: "eliminazione installer in blocco", et_blocco_parte: "installer messi da parte", et_raggruppa: "raggruppa installer",
    // azioni
    avvio: "Avvio…",
    // dettaglio
    copie_avviso: "⚠ Questo gioco ha {n} copie: guarda in “Doppioni”.",
    apri_cartella: "📁 Apri cartella", eseguibile: "Eseguibile", usa_questo: "Usa questo",
    exe_info: "Se “Gioca” apre il programma sbagliato, scegli qui quello giusto.",
    steam_info: "Gioco gestito da Steam: per spostarlo usa Steam (tasto destro sul gioco → Proprietà → File installati → Sposta cartella d'installazione).",
    disinstalla_steam: "❌ Disinstalla con Steam", riordina: "Riordina", rinomina: "Rinomina", sposta: "Sposta",
    metti_parte_dett: "🗑 Metti da parte (in _DaEliminare)", elimina_def: "❌ Elimina definitivamente", chiudi: "Chiudi",
    exe_salvato: "Eseguibile salvato",
    et_rinomina: "rinomina", et_sposta: "spostamento", et_da_parte: "messa da parte", et_elimina: "eliminazione",
    et_elimina_di: "eliminazione di {nome}",
    // anteprima
    op_rinomina: "Rinomina", op_sposta: "Sposta", op_da_parte: "Metti da parte", op_elimina: "❌ Elimina",
    anteprima: "Anteprima: {et}", pronte: "{n} operazioni pronte", con_problemi: "{n} con problemi (verranno saltate)",
    col_gioco: "Gioco", col_da_a: "Da → A", e_altre: "…e altre {n}",
    elim_avviso: "⚠ Eliminazione definitiva di {dim}: i file non andranno nel Cestino e non si potranno recuperare.",
    scrivi_elimina: "Per confermare scrivi <b>ELIMINA</b>:", annullabili: "Tutte le operazioni si possono annullare dalla sezione “Riordina”.",
    elimina_n: "Elimina definitivamente {n} {cosa}", esegui_n: "Esegui {n} {cosa}", elemento: "elemento", operazioni: "operazioni",
    op_avviate: "Operazioni avviate…",
    // doppioni
    nessun_doppione: "Nessun doppione trovato 🎉",
    dp_tot: "<b>{n} giochi con più copie</b> · eliminando le copie in più liberi circa <b>{dim}</b>.",
    dp_info: "Per ogni gioco restano la copia migliore da giocare (installata, nei recenti, disco più veloce, versione più alta) e l'archivio più recente come backup. Le altre vengono spostate in <code>_DaEliminare</code> sullo stesso disco: niente viene cancellato.",
    dp_parte: "🗑 Metti da parte le copie selezionate", dp_elimina: "❌ Elimina definitivamente le selezionate",
    recuperabili: "· recuperabili {dim}", da_tenere: "✔ da tenere", backup: "✔ backup",
    nessuna_copia: "Nessuna copia selezionata", et_doppioni: "doppioni", et_elim_doppioni: "eliminazione doppioni",
    svuota_conferma: "Eliminare DEFINITIVAMENTE i {n} elementi in {percorso}?\nNon si potranno recuperare.\n\nScrivi ELIMINA per confermare:",
    annullato: "Annullato", svuotamento: "Svuotamento in corso…",
    // spazio
    dischi: "Dischi", leg_giochi: "giochi", leg_altro: "altro", leg_libero: "libero",
    disco_riga: "{n} giochi · {occ} · libero <b>{lib}</b> su {tot}",
    cestini_titolo: "Cartelle _DaEliminare", cestini_info: "Contengono i giochi messi da parte. Quando sei sicuro, svuotale per liberare davvero lo spazio.",
    elementi: "{n} elementi", apri_btn: "Apri", svuota: "❌ Svuota", piu_grandi: "I 25 giochi più grandi",
    // riordina
    annulla_titolo: "Annulla", nomi_puliti: "Nomi puliti",
    nomi_info: "Rinomina le cartelle con nomi leggibili (es. <code>Cult.of.the.Lamb.v1.2.7.186</code> → <code>Cult of the Lamb v1.2.7.186</code>). La numerazione <code>0012_</code> viene mantenuta. Steam, launcher, installer e archivi sono esclusi.",
    includi_versione: "Includi la versione nel nome", sel_tutti: "Seleziona tutti", nessuno: "Nessuno", anteprima_rinomina: "Anteprima rinomina",
    col_disco: "Disco", col_ora: "Ora", col_diventa: "Diventa", nomi_ok: "Tutti i nomi sono già puliti.",
    nessun_gioco_sel: "Nessun gioco selezionato", et_nomi: "nomi puliti",
    ultima_op: "Ultima operazione: <b>{et}</b> ({n} cartelle, {quando})", annulla_ultima: "↶ Annulla ultima operazione",
    prima_ancora: "Prima ancora: {lista}", nessuna_op: "Nessuna operazione eseguita finora.",
    annulla_conferma: "Rimettere le cartelle com'erano prima dell'ultima operazione?",
    // impostazioni
    lingua: "Lingua", avvio_titolo: "Avvio", avvio_chk: "Apri il Gestore Giochi all'avvio di Windows",
    avvio_info: "All'avvio aggiorna anche la libreria in automatico (dopo circa 20 secondi).",
    avvio_on: "Si aprirà all'avvio di Windows", avvio_off: "Avvio automatico disattivato", errore: "Errore: {msg}",
    cartelle_titolo: "Cartelle dei giochi", cartelle_info: "Una per riga. Ogni sottocartella viene considerata un gioco. Le librerie Steam sono trovate in automatico.",
    salva_aggiorna: "Salva e aggiorna", ricalcola: "Ricalcola tutto da zero",
    contenitori_info: "Le sottocartelle-contenitore (come __ins o INS) e le cartelle “recenti” si impostano in <code>config.json</code>.",
    info: "Info", ultimo_agg: "Ultimo aggiornamento: {quando}", in_corso_mai: "in corso / mai", salvato: "Salvato",
    // stato
    op_progresso: "Operazioni {a}/{b}", op_fallite: "Alcune operazioni non sono riuscite",
    esci_conferma: "Chiudere il Gestore Giochi?", app_chiusa: "App chiusa. Puoi chiudere questa scheda.",
  },

  en: {
    aggiorna: "↻ Refresh", chiudi_app: "Quit the app",
    nav_libreria: "Library", nav_recenti: "Recent", nav_installer: "Installers", nav_doppioni: "Duplicates",
    nav_spazio: "Space", nav_riordina: "Tidy up", nav_impostazioni: "Settings",
    tipo_installato: "installed", tipo_installer: "installer", tipo_archivio: "archive", tipo_vuoto: "empty", tipo_sconosciuto: "no exe",
    recente: "recent", demo: "demo",
    installer_su: "📦 installer on {dove}", installer_simile: "? similar installer: {nome}", nessun_installer: "no installer",
    installato_su: "✔ installed on {dove}", simile_a: "? similar to {nome}", non_installato: "not installed",
    apri: "📁 Open", gioca: "▶ Play", apri_cartella_tt: "Open folder",
    disinstalla_steam_tt: "Uninstall with Steam", elimina_def_tt: "Delete permanently",
    cerca: "🔍 Search a game…", tutti_dischi: "All drives",
    f_inst_tutti: "Installers and archives", f_inst_con: "🟩 Game installed", f_inst_forse: "🟨 Maybe (similar name)",
    f_inst_senza: "🟦 Game not installed", f_inst_cartelle: "Setup folders only", f_inst_archivi: "Archives only (rar/zip/iso…)",
    f_tutti: "All types", f_giocabili: "Ready to play", f_con: "🟩 With installer", f_forse: "🟨 Similar installer",
    f_senza: "🟦 No installer", f_steam: "Steam only", f_senza_exe: "No executable", f_vuote: "Empty folders",
    o_nome: "Sort: name", o_dim: "Sort: size", o_data: "Sort: recently modified", o_disco: "Sort: drive",
    nessun_gioco: "No games.", premi_aggiorna: "Press “↻ Refresh” to look for games on your drives.",
    mostra_altri: "Show more ({n})", conteggio: "{n} games · {dim}",
    recenti_intro: "Games from the “recent” folders, newest first by order number.",
    inst_tot: "{n} installers and archives", inst_con: "🟩 {n} with game installed", inst_forse: "🟨 {n} maybe (similar name)", inst_senza: "🟦 {n} not installed",
    raggruppa_btn: "📦 Group {n} into _Installer folders",
    raggruppa_info: "Each installer goes into an <code>_Installer</code> subfolder next to where it is now (e.g. <code>Y:\\Games\\_Installer</code>). Same drive: instant and undoable.",
    gia_raggruppati: "✔ All installers are already grouped in _Installer folders.",
    blocco_btn: "🗑 Bulk delete 🟩 green / 🟨 yellow installers",
    blocco_info: "Only installers and archives of games already installed: installed games are never touched.",
    blocco_titolo: "Bulk delete installers",
    blocco_intro: "Only the ticked <b>installers/archives</b> are deleted. Installed games stay where they are.",
    verdi: "🟩 Green: {n} ({dim})", gialli: "🟨 Yellow: {n} ({dim})",
    gialli_avviso: "🟨 Yellow: check that the similar game really is the same one",
    installato_dp: "✔ installed:", simile_dp: "? similar to:",
    selezionati: "Selected: <b>{n}</b> · space freed: <b>{dim}</b>",
    annulla: "Cancel", metti_parte_recup: "🗑 Set aside (recoverable)", elimina_def_dots: "❌ Delete permanently…",
    nessun_installer_sel: "No installer selected",
    et_blocco_elimina: "bulk installer deletion", et_blocco_parte: "installers set aside", et_raggruppa: "group installers",
    avvio: "Starting…",
    copie_avviso: "⚠ This game has {n} copies: see “Duplicates”.",
    apri_cartella: "📁 Open folder", eseguibile: "Executable", usa_questo: "Use this",
    exe_info: "If “Play” opens the wrong program, pick the right one here.",
    steam_info: "Game managed by Steam: to move it use Steam (right-click the game → Properties → Installed Files → Move install folder).",
    disinstalla_steam: "❌ Uninstall with Steam", riordina: "Tidy up", rinomina: "Rename", sposta: "Move",
    metti_parte_dett: "🗑 Set aside (into _DaEliminare)", elimina_def: "❌ Delete permanently", chiudi: "Close",
    exe_salvato: "Executable saved",
    et_rinomina: "rename", et_sposta: "move", et_da_parte: "set aside", et_elimina: "deletion",
    et_elimina_di: "deletion of {nome}",
    op_rinomina: "Rename", op_sposta: "Move", op_da_parte: "Set aside", op_elimina: "❌ Delete",
    anteprima: "Preview: {et}", pronte: "{n} operations ready", con_problemi: "{n} with problems (will be skipped)",
    col_gioco: "Game", col_da_a: "From → To", e_altre: "…and {n} more",
    elim_avviso: "⚠ Permanent deletion of {dim}: files will not go to the Recycle Bin and cannot be recovered.",
    scrivi_elimina: "To confirm, type <b>ELIMINA</b>:", annullabili: "All operations can be undone from the “Tidy up” section.",
    elimina_n: "Permanently delete {n} {cosa}", esegui_n: "Run {n} {cosa}", elemento: "item", operazioni: "operations",
    op_avviate: "Operations started…",
    nessun_doppione: "No duplicates found 🎉",
    dp_tot: "<b>{n} games with multiple copies</b> · removing the extra copies frees about <b>{dim}</b>.",
    dp_info: "For each game you keep the best copy to play (installed, in recent, fastest drive, highest version) and the most recent archive as a backup. The others are moved to <code>_DaEliminare</code> on the same drive: nothing is deleted.",
    dp_parte: "🗑 Set aside selected copies", dp_elimina: "❌ Permanently delete selected",
    recuperabili: "· recoverable {dim}", da_tenere: "✔ keep", backup: "✔ backup",
    nessuna_copia: "No copy selected", et_doppioni: "duplicates", et_elim_doppioni: "duplicates deletion",
    svuota_conferma: "PERMANENTLY delete the {n} items in {percorso}?\nThey cannot be recovered.\n\nType ELIMINA to confirm:",
    annullato: "Cancelled", svuotamento: "Emptying…",
    dischi: "Drives", leg_giochi: "games", leg_altro: "other", leg_libero: "free",
    disco_riga: "{n} games · {occ} · free <b>{lib}</b> of {tot}",
    cestini_titolo: "_DaEliminare folders", cestini_info: "They hold the games you set aside. When you're sure, empty them to actually free the space.",
    elementi: "{n} items", apri_btn: "Open", svuota: "❌ Empty", piu_grandi: "The 25 largest games",
    annulla_titolo: "Undo", nomi_puliti: "Clean names",
    nomi_info: "Renames folders with readable names (e.g. <code>Cult.of.the.Lamb.v1.2.7.186</code> → <code>Cult of the Lamb v1.2.7.186</code>). The <code>0012_</code> numbering is kept. Steam, launchers, installers and archives are excluded.",
    includi_versione: "Include version in the name", sel_tutti: "Select all", nessuno: "None", anteprima_rinomina: "Preview rename",
    col_disco: "Drive", col_ora: "Now", col_diventa: "Becomes", nomi_ok: "All names are already clean.",
    nessun_gioco_sel: "No game selected", et_nomi: "clean names",
    ultima_op: "Last operation: <b>{et}</b> ({n} folders, {quando})", annulla_ultima: "↶ Undo last operation",
    prima_ancora: "Before that: {lista}", nessuna_op: "No operations so far.",
    annulla_conferma: "Put the folders back as they were before the last operation?",
    lingua: "Language", avvio_titolo: "Startup", avvio_chk: "Open Gestore Giochi when Windows starts",
    avvio_info: "At startup it also refreshes the library automatically (after about 20 seconds).",
    avvio_on: "It will open when Windows starts", avvio_off: "Start with Windows disabled", errore: "Error: {msg}",
    cartelle_titolo: "Game folders", cartelle_info: "One per line. Each subfolder is treated as a game. Steam libraries are found automatically.",
    salva_aggiorna: "Save and refresh", ricalcola: "Recalculate everything from scratch",
    contenitori_info: "Container subfolders (like __ins or INS) and “recent” folders are set in <code>config.json</code>.",
    info: "Info", ultimo_agg: "Last refresh: {quando}", in_corso_mai: "in progress / never", salvato: "Saved",
    op_progresso: "Operations {a}/{b}", op_fallite: "Some operations failed",
    esci_conferma: "Quit Gestore Giochi?", app_chiusa: "App closed. You can close this tab.",
  },
};

function t(chiave, p = {}) {
  let s = (TESTI[LINGUA] && TESTI[LINGUA][chiave]) ?? TESTI.it[chiave] ?? chiave;
  for (const k in p) s = s.split("{" + k + "}").join(p[k]);
  return s;
}
const LOCALE = () => LINGUA === "en" ? "en-GB" : "it-IT";

// Messaggi che arrivano dal server (sempre in italiano) -> lingua scelta.
const SERVER_EN = [
  [/^gioco non trovato \(rifai la scansione\)$/, "game not found (rescan)"],
  [/^gioco Steam: spostalo da Steam.*$/, "Steam game: move it from Steam (Properties > Installed Files > Move)"],
  [/^gioco Steam: usa .*Disinstalla con Steam.*$/, "Steam game: use “Uninstall with Steam”"],
  [/^la cartella non esiste più$/, "the folder no longer exists"],
  [/^non esiste più$/, "no longer exists"],
  [/^nome non valido$/, "invalid name"],
  [/^nessun cambiamento$/, "no change"],
  [/^esiste già una cartella con quel nome$/, "a folder with that name already exists"],
  [/^due operazioni verso la stessa destinazione$/, "two operations with the same destination"],
  [/^spazio insufficiente sul disco di destinazione$/, "not enough space on the destination drive"],
  [/^percorso protetto.*$/, "protected path (drive root or main game folder)"],
  [/^ELIMINAZIONE DEFINITIVA: non si può annullare$/, "PERMANENT DELETION: cannot be undone"],
  [/cartella di un launcher: dopo lo spostamento il launcher potrebbe non trovarla/, "launcher folder: after moving, the launcher may not find it"],
  [/copia tra dischi: può richiedere molto tempo/, "copy between drives: may take a long time"],
  [/\. Attenzione: passa da (.+?) a (.+?), il gioco caricherà più lentamente/, ". Warning: moves from $1 to $2, the game will load more slowly"],
  [/\. Passa su un disco più veloce \((.+?)\)/, ". Moves to a faster drive ($1)"],
  [/HDD esterno USB/g, "USB HDD"],
  [/ \(eliminazione parziale: forse il gioco è aperto o un file è in uso\)/, " (partial deletion: the game may be running or a file is in use)"],
  [/^Avvio (.+) con Steam$/, "Starting $1 with Steam"],
  [/^Avvio (.+)$/, "Starting $1"],
  [/^Nessun eseguibile: scegline uno dal dettaglio del gioco$/, "No executable: pick one in the game details"],
  [/^Gioco non trovato$/, "Game not found"],
  [/^Si apre Steam per la disinstallazione$/, "Opening Steam to uninstall"],
  [/^Non è un gioco Steam$/, "Not a Steam game"],
  [/^Niente da annullare\.$/, "Nothing to undo."],
  [/^C'è già un'operazione in corso\.?$/, "An operation is already running."],
  [/^Annullo (\d+) operazioni \((.+)\)\.$/, "Undoing $1 operations ($2)."],
  [/^Impossibile svuotare.*$/, "Cannot empty (operation already running?)"],
  [/^accesso negato ad alcune cartelle$/, "access denied to some folders"],
  [/^Elenco cartelle$/, "Listing folders"],
  [/^Analisi giochi$/, "Analysing games"],
];
function tS(s) {
  if (!s || LINGUA === "it") return s;
  let r = String(s);
  for (const [re, sost] of SERVER_EN) r = r.replace(re, sost);
  return r;
}

// ---------------------------------------------------------------- schede Serie TV e Anime
Object.assign(TESTI.it, {
  nav_serie: "Serie TV", nav_anime: "Anime", ep: "ep",
  st_in_corso: "In corso", st_da_vedere: "Da vedere", st_in_pausa: "In pausa", st_completata: "Completata", st_droppata: "Droppata",
  fonte_tvmaze: "dati TVmaze", fonte_anilist: "dati AniList", fonte_manuale: "inserito a mano",
  m_aggiungi: "+ Aggiungi", m_tutti: "Tutti", m_o_agg: "Ordina: aggiornati di recente", m_o_titolo: "Ordina: titolo",
  m_o_voto: "Ordina: voto", m_o_anno: "Ordina: anno",
  m_inbox: "📥 Da confermare", m_inbox_info: "Episodi rilevati dall'estensione per titoli non ancora in lista: collegali a un titolo o aggiungili.",
  m_collega_a: "Collega a…", m_collega: "Collega", m_cerca_aggiungi: "Cerca e aggiungi", m_scegli_titolo: "Scegli un titolo dall'elenco",
  m_nessuno_filtro: "Nessun titolo con questi filtri.",
  m_vuoto_serie: "Nessuna serie ancora. Premi “+ Aggiungi” o guarda un episodio con l'estensione di Firefox attiva.",
  m_vuoto_anime: "Nessun anime ancora. Premi “+ Aggiungi” o guarda un episodio con l'estensione di Firefox attiva.",
  m_film: "film", m_serie: "serie", m_dettagli: "Dettagli", m_voto: "Voto", m_stato: "Stato", m_stagioni: "Stagioni",
  m_stagione: "Stagione", m_episodi: "Visti / totali", m_date: "Inizio → fine",
  m_completa: "Segna come completata", m_droppa: "Droppa", m_elimina_stagione: "Elimina stagione",
  m_nuova_stagione: "+ Nuova stagione", m_note: "Note", m_alias: "Altri titoli",
  m_alias_info: "Nomi alternativi separati da virgola (es. il titolo italiano usato dal sito): servono all'estensione per riconoscere la serie.",
  m_elimina: "🗑 Elimina dalla lista", m_droppa_chiedi: "A quale episodio l'hai droppata?",
  m_episodi_nuova: "Quanti episodi ha la nuova stagione? (vuoto se non lo sai)",
  m_conferma_elimina_stagione: "Eliminare questa stagione?", m_conferma_elimina: "Eliminare questo titolo dalla lista?",
  m_aggiungi_titolo_serie: "Aggiungi serie TV o film", m_aggiungi_titolo_anime: "Aggiungi anime",
  m_cerca_titolo: "Titolo da cercare…", m_cerca: "Cerca",
  m_fonte_serie: "Ricerca su TVmaze (titoli originali o inglesi funzionano meglio). Per i film usa l'inserimento a mano.",
  m_fonte_anime: "Ricerca su AniList: ogni stagione di un anime è una scheda separata.",
  m_manuale: "Inserisci a mano", m_titolo: "Titolo", m_n_stagioni: "Stagioni", m_ep_per_stagione: "episodi per stagione",
  m_aggiungi_btn: "Aggiungi", m_cerco: "Cerco…", m_aggiungo: "Aggiungo…", m_aggiunto: "Aggiunto:",
  m_nessun_risultato: "Nessun risultato: prova un altro titolo o l'inserimento a mano.",
});
Object.assign(TESTI.en, {
  nav_serie: "TV Series", nav_anime: "Anime", ep: "ep",
  st_in_corso: "Watching", st_da_vedere: "Plan to watch", st_in_pausa: "On hold", st_completata: "Completed", st_droppata: "Dropped",
  fonte_tvmaze: "TVmaze data", fonte_anilist: "AniList data", fonte_manuale: "added manually",
  m_aggiungi: "+ Add", m_tutti: "All", m_o_agg: "Sort: recently updated", m_o_titolo: "Sort: title",
  m_o_voto: "Sort: rating", m_o_anno: "Sort: year",
  m_inbox: "📥 To confirm", m_inbox_info: "Episodes detected by the extension for titles not in your list yet: link them to a title or add them.",
  m_collega_a: "Link to…", m_collega: "Link", m_cerca_aggiungi: "Search and add", m_scegli_titolo: "Pick a title from the list",
  m_nessuno_filtro: "No titles match these filters.",
  m_vuoto_serie: "No series yet. Press “+ Add” or watch an episode with the Firefox extension enabled.",
  m_vuoto_anime: "No anime yet. Press “+ Add” or watch an episode with the Firefox extension enabled.",
  m_film: "movie", m_serie: "series", m_dettagli: "Details", m_voto: "Rating", m_stato: "Status", m_stagioni: "Seasons",
  m_stagione: "Season", m_episodi: "Watched / total", m_date: "Start → end",
  m_completa: "Mark as completed", m_droppa: "Drop", m_elimina_stagione: "Delete season",
  m_nuova_stagione: "+ New season", m_note: "Notes", m_alias: "Other titles",
  m_alias_info: "Alternative names, comma separated (e.g. the localized title used by the site): the extension uses them to recognize the series.",
  m_elimina: "🗑 Remove from list", m_droppa_chiedi: "At which episode did you drop it?",
  m_episodi_nuova: "How many episodes does the new season have? (empty if unknown)",
  m_conferma_elimina_stagione: "Delete this season?", m_conferma_elimina: "Remove this title from the list?",
  m_aggiungi_titolo_serie: "Add TV series or movie", m_aggiungi_titolo_anime: "Add anime",
  m_cerca_titolo: "Title to search…", m_cerca: "Search",
  m_fonte_serie: "Searching TVmaze (original or English titles work best). For movies use manual entry.",
  m_fonte_anime: "Searching AniList: each anime season is a separate entry.",
  m_manuale: "Add manually", m_titolo: "Title", m_n_stagioni: "Seasons", m_ep_per_stagione: "episodes per season",
  m_aggiungi_btn: "Add", m_cerco: "Searching…", m_aggiungo: "Adding…", m_aggiunto: "Added:",
  m_nessun_risultato: "No results: try another title or manual entry.",
});

// ---------------------------------------------------------------- voto dei giochi
Object.assign(TESTI.it, {
  voto: "Voto:", voto_bello: "Bello", voto_sufficiente: "Sufficiente", voto_brutto: "Brutto", voto_nessuno: "Togli voto",
  voto_da_nome: "(dal prefisso del nome: x = bello, L = brutto)",
  f_voto_tutti: "Tutti i voti", f_voto_bello: "👍 Belli", f_voto_sufficiente: "👌 Sufficienti", f_voto_brutto: "👎 Brutti", f_voto_senza: "Senza voto",
});
Object.assign(TESTI.en, {
  voto: "Rating:", voto_bello: "Good", voto_sufficiente: "Okay", voto_brutto: "Bad", voto_nessuno: "Remove rating",
  voto_da_nome: "(from the name prefix: x = good, L = bad)",
  f_voto_tutti: "All ratings", f_voto_bello: "👍 Good", f_voto_sufficiente: "👌 Okay", f_voto_brutto: "👎 Bad", f_voto_senza: "Unrated",
});

// ---------------------------------------------------------------- barra laterale e sezione Film
Object.assign(TESTI.it, {
  sez_giochi: "Giochi", sez_serie: "Serie TV", sez_film: "Film", sez_anime: "Anime", sez_impostazioni: "Impostazioni",
  stf_da_vedere: "Da vedere", stf_completata: "Visto", stf_droppata: "Droppato", m_visto: "Visto",
  fonte_imdb: "dati IMDb",
  m_vuoto_film: "Nessun film ancora. Premi “+ Aggiungi” o guarda un film con l'estensione di Firefox attiva.",
  m_aggiungi_titolo_film: "Aggiungi film", m_cerca_lista: "🔍 Cerca nella lista…",
  m_fonte_film: "Ricerca sui suggerimenti di IMDb (funziona anche con titoli italiani). Se non lo trovi, usa l'inserimento a mano.",
});
Object.assign(TESTI.en, {
  sez_giochi: "Games", sez_serie: "TV Series", sez_film: "Movies", sez_anime: "Anime", sez_impostazioni: "Settings",
  stf_da_vedere: "Plan to watch", stf_completata: "Watched", stf_droppata: "Dropped", m_visto: "Watched",
  fonte_imdb: "IMDb data",
  m_vuoto_film: "No movies yet. Press “+ Add” or watch a movie with the Firefox extension enabled.",
  m_aggiungi_titolo_film: "Add movie", m_cerca_lista: "🔍 Search your list…",
  m_fonte_film: "Searching IMDb suggestions (localized titles work too). If you can't find it, use manual entry.",
});

// ---------------------------------------------------------------- impostazioni: telefono
Object.assign(TESTI.it, {
  tel_titolo: "Telefono (serie, film e anime ovunque)",
  tel_intro: "Collega un Foglio Google: avrai una pagina privata sul telefono con le tue serie, film e anime, e il Gestore si sincronizzerà da solo ogni 5 minuti e dopo ogni modifica. Gratis, una volta sola, circa 5 minuti.",
  tel_come: "Come si collega (5 minuti)", tel_riconfigura: "Rifai la configurazione",
  tel_p1: "Crea un Foglio Google vuoto (chiamalo come vuoi, es. “Gestore – serie, film e anime”).",
  tel_apri_fogli: "Apri Fogli Google",
  tel_p2: "Nel foglio: menu <b>Estensioni → Apps Script</b>. Cancella il codice che c'è e incolla questo:",
  tel_copia_codice: "📋 Copia lo script",
  tel_p3: "Accanto a “File” premi <b>+ → HTML</b>, chiamalo esattamente <b>Pagina</b>, cancella il contenuto e incolla:",
  tel_copia_pagina: "📋 Copia la pagina",
  tel_p4: "Premi 💾 Salva, poi <b>Esegui il deployment → Nuovo deployment</b> → ingranaggio → <b>App web</b>. “Esegui come”: <b>Me</b>; “Chi ha accesso”: <b>Chiunque</b>. Premi Esegui il deployment e autorizza con il tuo account Google (alla schermata “Google non ha verificato l'app” scegli Avanzate → Vai al progetto).",
  tel_p5: "Copia l'<b>URL dell'app web</b> (finisce con /exec), incollalo qui e premi Salva:",
  tel_salva: "Salva e sincronizza",
  tel_p6: "Apri sul telefono il link che compare qui sopra (mandalo a te stesso, es. per email) e scegli <b>Aggiungi a schermata Home</b>.",
  tel_collegato: "Collegato", tel_ultima: "ultima sincronizzazione", tel_mai: "mai",
  tel_sincronizza_ora: "↻ Sincronizza ora", tel_copia_link: "📋 Copia il link per il telefono",
  tel_link_info: "Link della tua pagina privata (contiene il codice segreto: non condividerlo):",
  tel_copiato: "Copiato negli appunti", tel_in_corso: "Sincronizzo…",
});
Object.assign(TESTI.en, {
  tel_titolo: "Phone (series, movies and anime anywhere)",
  tel_intro: "Connect a Google Sheet: you'll get a private page on your phone with your series, movies and anime, and the Manager syncs by itself every 5 minutes and after every change. Free, one-time, about 5 minutes.",
  tel_come: "How to connect (5 minutes)", tel_riconfigura: "Set it up again",
  tel_p1: "Create an empty Google Sheet (any name, e.g. “Manager – series, movies, anime”).",
  tel_apri_fogli: "Open Google Sheets",
  tel_p2: "In the sheet: menu <b>Extensions → Apps Script</b>. Delete the existing code and paste this:",
  tel_copia_codice: "📋 Copy the script",
  tel_p3: "Next to “Files” press <b>+ → HTML</b>, name it exactly <b>Pagina</b>, delete its content and paste:",
  tel_copia_pagina: "📋 Copy the page",
  tel_p4: "Press 💾 Save, then <b>Deploy → New deployment</b> → gear → <b>Web app</b>. “Execute as”: <b>Me</b>; “Who has access”: <b>Anyone</b>. Press Deploy and authorize with your Google account (on “Google hasn't verified this app” choose Advanced → Go to project).",
  tel_p5: "Copy the <b>Web app URL</b> (ends with /exec), paste it here and press Save:",
  tel_salva: "Save and sync",
  tel_p6: "Open the link shown above on your phone (send it to yourself, e.g. by email) and choose <b>Add to Home screen</b>.",
  tel_collegato: "Connected", tel_ultima: "last sync", tel_mai: "never",
  tel_sincronizza_ora: "↻ Sync now", tel_copia_link: "📋 Copy the phone link",
  tel_link_info: "Link to your private page (contains the secret code: don't share it):",
  tel_copiato: "Copied to clipboard", tel_in_corso: "Syncing…",
});

// ---------------------------------------------------------------- voto in sequenza
Object.assign(TESTI.it, {
  vota_coda: "Vota i giochi senza voto ({n})", vota_votati: "{n} votati in questa sessione",
  vota_salta: "Salta", vota_indietro: "Indietro", vota_tasti: "Tastiera: 1 bello · 2 sufficiente · 3 brutto · → salta · ← indietro · Esc chiudi",
  vota_fatto: "Fatto! {n} giochi votati",
});
Object.assign(TESTI.en, {
  vota_coda: "Rate unrated games ({n})", vota_votati: "{n} rated this session",
  vota_salta: "Skip", vota_indietro: "Back", vota_tasti: "Keyboard: 1 good · 2 okay · 3 bad · → skip · ← back · Esc close",
  vota_fatto: "Done! {n} games rated",
});

// ---------------------------------------------------------------- importazione AnimeUnity
Object.assign(TESTI.it, {
  au_importa: "Importa da AnimeUnity", au_vai: "Importa / aggiorna",
  au_info: "Incolla il link del tuo profilo pubblico. Importa stati, episodi visti, voti e preferiti; se lo rifai in futuro, per ogni anime vince la modifica più recente (sul sito o qui).",
  au_in_corso: "Leggo il profilo e importo…",
  au_fatto: "{tot} anime letti: {nuovi} nuovi, {agg} aggiornati, {inv} già aggiornati qui.",
});
Object.assign(TESTI.en, {
  au_importa: "Import from AnimeUnity", au_vai: "Import / update",
  au_info: "Paste the link to your public profile. Imports statuses, watched episodes, ratings and favorites; if you run it again later, for each anime the most recent change wins (on the site or here).",
  au_in_corso: "Reading the profile and importing…",
  au_fatto: "{tot} anime read: {nuovi} new, {agg} updated, {inv} already up to date here.",
});

// ---------------------------------------------------------------- stagione di MyAnimeList
Object.assign(TESTI.it, {
  stg_pulsante: "Stagione", stg_torna: "La mia lista", stg_aggiorna: "Aggiorna da MyAnimeList",
  stg_winter: "Inverno", stg_spring: "Primavera", stg_summer: "Estate", stg_fall: "Autunno",
  stg_o_voto: "Ordina: voto MAL", stg_o_membri: "Ordina: popolarità", stg_o_data: "Ordina: data di uscita",
  stg_nascondi_lista: "Nascondi quelli già in lista", stg_nascondi_scartati: "Nascondi scartati ({n})",
  stg_sez_TVNew: "TV nuove", stg_sez_TVContinuing: "TV in corso", stg_sez_ONA: "ONA", stg_sez_OVA: "OVA", stg_sez_Movie: "Film", stg_sez_Special: "Speciali",
  stg_carico: "Carico la stagione da MyAnimeList…", stg_errore: "MyAnimeList non raggiungibile:",
  stg_guardo: "Lo guardo (In corso)", stg_pianifico: "Lo pianifico (Da vedere)", stg_scarta: "Non mi interessa", stg_ripristina: "Ripristina",
});
Object.assign(TESTI.en, {
  stg_pulsante: "Season", stg_torna: "My list", stg_aggiorna: "Refresh from MyAnimeList",
  stg_winter: "Winter", stg_spring: "Spring", stg_summer: "Summer", stg_fall: "Fall",
  stg_o_voto: "Sort: MAL score", stg_o_membri: "Sort: popularity", stg_o_data: "Sort: start date",
  stg_nascondi_lista: "Hide titles already in my list", stg_nascondi_scartati: "Hide skipped ({n})",
  stg_sez_TVNew: "TV (New)", stg_sez_TVContinuing: "TV (Continuing)", stg_sez_ONA: "ONA", stg_sez_OVA: "OVA", stg_sez_Movie: "Movies", stg_sez_Special: "Specials",
  stg_carico: "Loading the season from MyAnimeList…", stg_errore: "MyAnimeList unreachable:",
  stg_guardo: "Watch it (Watching)", stg_pianifico: "Plan it (Plan to watch)", stg_scarta: "Not interested", stg_ripristina: "Restore",
});

// ---------------------------------------------------------------- archivio stagioni
Object.assign(TESTI.it, {
  stg_archivio: "Archivio", stg_tutti_anni: "Tutti gli anni",
  stg_archivio_progresso: "Scarico l'archivio da MyAnimeList: {n} stagioni su {tot} (prima dal 2020, poi a ritroso verso il passato, una ogni 15 secondi mentre il Gestore è aperto).",
});
Object.assign(TESTI.en, {
  stg_archivio: "Archive", stg_tutti_anni: "All years",
  stg_archivio_progresso: "Downloading the archive from MyAnimeList: {n} of {tot} seasons (first since 2020, then backwards into the past, one every 15 seconds while the app is open).",
});

// ---------------------------------------------------------------- stagioni future
Object.assign(TESTI.it, {
  stg_non_pubblicata: "Questa stagione non è ancora stata pubblicata su MyAnimeList: gli anime compariranno man mano che vengono annunciati (controllo ogni giorno).",
  stg_futura_info: "Stagione futura: i voti non ci sono ancora, l'ordine è per popolarità (quanti utenti MAL la aspettano). Usa 📌 per pianificare.",
});
Object.assign(TESTI.en, {
  stg_non_pubblicata: "This season isn't on MyAnimeList yet: anime will appear as they are announced (checked daily).",
  stg_futura_info: "Upcoming season: no scores yet, sorted by popularity (how many MAL users are waiting for it). Use 📌 to plan.",
});
