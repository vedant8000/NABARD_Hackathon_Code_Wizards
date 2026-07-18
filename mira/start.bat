@echo off
REM MIRA — one-command demo launcher (serves API + built frontend on :8000)
cd /d "%~dp0backend"
set PYTHONIOENCODING=utf-8
echo Starting MIRA at http://localhost:8000  (Ctrl+C to stop)
start "" http://localhost:8000
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
