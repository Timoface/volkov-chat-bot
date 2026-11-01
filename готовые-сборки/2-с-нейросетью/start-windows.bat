@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Нужен Node.js 22.18 или новее: https://nodejs.org & pause & exit /b 1)
if not exist ".env.local" copy ".env.example" ".env.local" >nul
echo Навигатор запускается: http://localhost:8080
echo Чтобы остановить, закройте это окно.
start "" http://localhost:8080
node server\serve.mjs
pause
