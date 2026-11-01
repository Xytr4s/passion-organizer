@echo off
rem Crea dist\PassionOrganizer.exe (un unico file, senza bisogno di Python per chi lo usa).
rem Richiede: pip install -r requirements.txt pyinstaller
cd /d "%~dp0"
python -m PyInstaller --noconfirm --onefile --windowed --name PassionOrganizer --icon "%~dp0icona.ico" ^
  --add-data "%~dp0static;static" --add-data "%~dp0telefono;telefono" ^
  --distpath "%~dp0dist" --workpath "%TEMP%\passionorganizer_build" --specpath "%TEMP%\passionorganizer_build" ^
  app.py
echo.
echo Fatto: dist\PassionOrganizer.exe
pause
