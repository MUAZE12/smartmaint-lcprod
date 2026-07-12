@echo off
setlocal enabledelayedexpansion
title Publier une mise a jour - SmartMaint L.C PROD
cd /d "%~dp0"

set "SUPA=https://odnszwngptfqozrxexri.supabase.co"
set "BUCKET=releases"

if not exist "publish-secret.txt" (
  echo.
  echo  *** Fichier "publish-secret.txt" manquant. ***
  echo  Creez-le dans ce dossier et collez-y la cle "service_role"
  echo  de Supabase  ^(Dashboard ^> Settings ^> API ^> service_role^).
  echo.
  pause & exit /b 1
)
set /p SVCKEY=<publish-secret.txt

echo.
echo  ============================================
echo    Publication d'une mise a jour
echo  ============================================
echo.
echo  [1/4] Compilation de l'application...
call npm run build
if errorlevel 1 ( echo. & echo  *** ECHEC du build - corrigez le code. *** & echo. & pause & exit /b 1 )

echo  [2/4] Preparation du paquet...
set "STAGE=%TEMP%\smlc-publish"
if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE%"
rem -- "public" (logo + AI voice model) is NOT shipped in updates: it is
rem -- large and static, installed once by Setup.exe. Keeping it out keeps
rem -- the package under the Supabase Storage 50 MB limit.
robocopy ".next"  "%STAGE%\.next"  /E /XD "%CD%\.next\cache" /NFL /NDL /NJH /NJS /NP >nul
copy /y "package.json" "%STAGE%\" >nul
if exist "next.config.ts"     copy /y "next.config.ts"     "%STAGE%\" >nul
if exist "update-channel.txt" copy /y "update-channel.txt" "%STAGE%\" >nul
rem -- .env.local is copied WITHOUT SUPABASE_SERVICE_ROLE_KEY so the
rem -- release .zip can't be pried open to reveal DB-admin credentials.
rem -- Server routes fall back to the anon key + permissive RLS.
if exist ".env.local" (
    powershell -NoProfile -Command "Get-Content '.env.local' | Where-Object { $_ -notmatch '^\s*SUPABASE_SERVICE_ROLE_KEY\s*=' } | Set-Content -Encoding UTF8 '%STAGE%\.env.local'"
)
rem -- Ship the updated launcher alongside the build. The installed v2
rem -- launcher renames "<exe>.new" on next boot, so this self-updates
rem -- without ever asking the user to re-run Setup.exe.
if exist "SmartMaint - L.C PROD.exe.new" copy /y "SmartMaint - L.C PROD.exe.new" "%STAGE%\" >nul
set "ZIP=%TEMP%\smlc-app.zip"
if exist "%ZIP%" del /q "%ZIP%"
if exist "%STAGE%\SmartMaint - L.C PROD.exe.new" (
  tar -a -c -f "%ZIP%" -C "%STAGE%" .next package.json next.config.ts .env.local update-channel.txt "SmartMaint - L.C PROD.exe.new"
) else (
  tar -a -c -f "%ZIP%" -C "%STAGE%" .next package.json next.config.ts .env.local update-channel.txt
)
if errorlevel 1 ( echo. & echo  *** ECHEC de la creation du paquet. *** & echo. & pause & exit /b 1 )

for /f %%v in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "VER=%%v"
<nul set /p "=!VER!">"%TEMP%\smlc-version.txt"
<nul set /p "=!VER!">"version.txt"

echo  [3/4] Envoi du paquet vers Supabase Storage...
curl -f -s -S -X POST "%SUPA%/storage/v1/object/%BUCKET%/app.zip" -H "Authorization: Bearer !SVCKEY!" -H "apikey: !SVCKEY!" -H "x-upsert: true" -H "Content-Type: application/zip" --data-binary "@%ZIP%" >nul
if errorlevel 1 ( echo. & echo  *** ECHEC de l'envoi - verifiez la cle et le bucket public "releases". *** & echo. & pause & exit /b 1 )

echo  [4/4] Publication de la version...
curl -f -s -S -X POST "%SUPA%/storage/v1/object/%BUCKET%/version.txt" -H "Authorization: Bearer !SVCKEY!" -H "apikey: !SVCKEY!" -H "x-upsert: true" -H "Content-Type: text/plain" --data-binary "@%TEMP%\smlc-version.txt" >nul
if errorlevel 1 ( echo. & echo  *** ECHEC de la publication de la version. *** & echo. & pause & exit /b 1 )

rmdir /s /q "%STAGE%"
del /q "%ZIP%" "%TEMP%\smlc-version.txt" 2>nul

echo.
echo  ============================================
echo    Mise a jour publiee : !VER!
echo  ============================================
echo  Les applications installees se mettront a jour
echo  a leur prochain lancement.
echo.
pause
