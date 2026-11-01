@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Нужен Node.js 22.18 или новее: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Устанавливаю зависимости, это займёт пару минут... & call npm ci)
if not exist ".env.local" copy ".env.example" ".env.local" >nul
start "" http://127.0.0.1:5175
call npm run dev
pause
