@echo off
rem Vitrine do OperacionalOS (modo demonstracao). Faz o mesmo que "npm run vitrine".
rem Se o Windows bloquear este arquivo por ter vindo da internet, abra um terminal nesta pasta
rem e digite:  npm run vitrine
cd /d "%~dp0"
title Vitrine OperacionalOS
where node >nul 2>nul
if errorlevel 1 (
  echo Falta o Node.js neste PC. Instale a versao LTS em https://nodejs.org e abra este arquivo de novo.
  pause
  exit /b 1
)
node scripts\vitrine.mjs
if errorlevel 1 pause
