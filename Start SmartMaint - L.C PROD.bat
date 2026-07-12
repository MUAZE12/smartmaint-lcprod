@echo off
title SmartMaint - L.C PROD
cd /d "%~dp0"

echo.
echo  ============================================
echo   SmartMaint - L.C PROD  -  GMAO Agroalimentaire
echo  ============================================
echo.
echo  Preparation de l'application (compilation)...
echo  Patientez 1 a 2 minutes (plus rapide les fois suivantes).
echo.

call npm run build
if errorlevel 1 (
  echo.
  echo  *** ERREUR de compilation - voir les messages ci-dessus. ***
  pause
  exit /b 1
)

echo.
echo  Demarrage du serveur... le navigateur va s'ouvrir.
echo  Gardez cette fenetre ouverte pendant l'utilisation.
echo  Pour arreter : fermez cette fenetre.
echo.

REM Open the browser once the production server is ready
start /min cmd /c "timeout /t 7 /nobreak >nul && start http://localhost:3000"

REM Production server — every page is pre-compiled and instant
call npm run start
