@echo off
setlocal enabledelayedexpansion
title Publier sur Android - SmartMaint L.C PROD
cd /d "%~dp0"

set "URL=https://smartmaint-lcprod.vercel.app"
set "BACKUP=..\smartmaint-deploy-backup"

echo.
echo  ============================================
echo    Publication PWA / Android via Vercel
echo  ============================================
echo.
echo  Cette publication met a jour la version web
echo  utilisee par tous les telephones et tablettes.
echo  Le PC Windows utilise un canal different
echo  (Publier la mise a jour.bat).
echo.

if exist "%BACKUP%" rmdir /s /q "%BACKUP%"
mkdir "%BACKUP%"

echo  [1/4] Mise de cote des fichiers trop lourds pour Vercel...
if exist "public\models" (
    move "public\models" "%BACKUP%\models" >nul
    echo        - public\models       ( ^>240 Mo, deja sur Supabase Storage^)
)
if exist "installer" (
    move "installer" "%BACKUP%\installer" >nul
    echo        - installer\          (Setup.exe Windows^)
)
if exist "runtime" (
    move "runtime" "%BACKUP%\runtime" >nul
    echo        - runtime\            (node.exe portable Windows^)
)
if exist ".next" (
    move ".next" "%BACKUP%\.next" >nul
    echo        - .next\              (cache build local, reconstruit cote Vercel^)
)
echo.

echo  [2/4] Deploiement sur Vercel (compter ^~2 min)...
echo.
call npx vercel deploy --prod
set "DEPLOY_RC=%ERRORLEVEL%"
echo.

echo  [3/4] Restauration des fichiers locaux...
if exist "%BACKUP%\models"    move "%BACKUP%\models"    "public\models"    >nul
if exist "%BACKUP%\installer" move "%BACKUP%\installer" "installer"        >nul
if exist "%BACKUP%\runtime"   move "%BACKUP%\runtime"   "runtime"          >nul
if exist "%BACKUP%\.next"     move "%BACKUP%\.next"     ".next"            >nul
rmdir /s /q "%BACKUP%" 2>nul
echo.

if not "%DEPLOY_RC%"=="0" (
    echo  [4/4] *** ECHEC du deploiement (code %DEPLOY_RC%^) ***
    echo.
    echo  Verifiez :
    echo    - Vous etes connecte a Vercel  (npx vercel login^)
    echo    - Les variables d'environnement existent  (npx vercel env ls^)
    echo    - Pas d'autre fichier ^> 100 Mo dans le projet
    echo.
    pause
    exit /b %DEPLOY_RC%
)

echo  [4/4] Termine.
echo.
echo  ============================================
echo    Publication PWA reussie !
echo    URL : %URL%
echo  ============================================
echo.
echo  Tous les telephones / tablettes installes
echo  recoivent la mise a jour au prochain ouvre
echo  de l'app (rechargement automatique WebView).
echo.
echo  Pour distribuer le lien aux operateurs :
echo    - Partager %URL% par WhatsApp / SMS
echo    - Ou imprimer un QR code pointant vers cette URL
echo.
pause
