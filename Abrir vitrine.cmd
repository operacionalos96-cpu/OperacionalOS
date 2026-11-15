@echo off
rem Vitrine do OperacionalOS: o app completo em modo demonstracao.
rem Dados de exemplo guardados so neste PC. Nada toca o banco real e nao precisa de login.
rem Precisa do Windows com Node.js 20 ou mais novo (https://nodejs.org).
rem Dois cliques neste arquivo: instala o que falta (so na primeira vez), liga o site na porta 3040,
rem monta todas as telas de uma vez e abre o app para PC.
setlocal
cd /d "%~dp0"
title Vitrine OperacionalOS

where node >nul 2>nul
if errorlevel 1 (
  echo Falta o Node.js neste PC. Instale a versao LTS em https://nodejs.org e abra este arquivo de novo.
  pause
  exit /b 1
)

if not exist "node_modules\next\package.json" (
  echo [1/4] Instalando o site. So na primeira vez, leva um ou dois minutos...
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto :falhou
)
if not exist "desktop\node_modules\electron\package.json" (
  echo [2/4] Instalando o app para PC. So na primeira vez...
  pushd desktop
  call npm ci --no-audit --no-fund
  if errorlevel 1 ( popd & goto :falhou )
  popd
)
if not exist "desktop\node_modules\electron\dist\electron.exe" (
  echo Baixando o Electron...
  pushd desktop
  call node node_modules\electron\install.js
  if errorlevel 1 ( popd & goto :falhou )
  popd
)

set NEXT_PUBLIC_SANDBOX=1
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:3040/login) | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo [3/4] Ligando o site de demonstracao na porta 3040...
  start "Vitrine OperacionalOS - site" /min cmd /c "npm run dev -- -p 3040"
  powershell -NoProfile -Command "for ($i=0; $i -lt 120; $i++) { try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:3040/login) | Out-Null; exit 0 } catch { Start-Sleep -Seconds 1 } }; exit 1"
  if errorlevel 1 (
    echo O site nao respondeu em dois minutos. Veja a janela "Vitrine OperacionalOS - site".
    pause
    exit /b 1
  )
)

echo [4/4] Preparando as telas, cerca de meio minuto...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\vitrine-preparar-telas.ps1"

echo Abrindo o app. Para encerrar, feche o app e a janela "Vitrine OperacionalOS - site".
cd desktop
set OPOS_URL=http://localhost:3040
call npm run start
endlocal
exit /b 0

:falhou
echo A instalacao falhou. Veja as mensagens acima.
pause
exit /b 1
