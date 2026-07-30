@echo off
rem === Avvia Risiko Online in locale ===
rem Doppio clic su questo file: apre il browser e avvia il server.
rem Chiudi questa finestra nera per fermare il server.
cd /d "%~dp0"
start "" http://localhost:5500
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\serve.ps1" -Root src -Port 5500
