@echo off
setlocal
title Installation du nouveau launcher SmartMaint

set "SRC=%~dp0SmartMaint - L.C PROD.exe.new"
set "DST_DIR=%LOCALAPPDATA%\Programs\SmartMaint - L.C PROD"
set "DST=%DST_DIR%\SmartMaint - L.C PROD.exe"

echo.
echo  ============================================
echo    Mise a niveau du launcher SmartMaint
echo    (gere automatiquement node.exe)
echo  ============================================
echo.

if not exist "%SRC%" (
  echo  *** Fichier source introuvable : %SRC% ***
  echo  Recompilez avec csc.exe avant de relancer ce script.
  pause & exit /b 1
)

if not exist "%DST%" (
  echo  *** SmartMaint n'est pas installe sur ce poste : %DST% ***
  echo  Lancez d'abord SmartMaint-LCPROD-Setup.exe.
  pause & exit /b 1
)

echo  [1/4] Fermeture des instances de SmartMaint et node...
taskkill /F /IM "SmartMaint - L.C PROD.exe" >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
rem -- Wait for file locks to drop before the copy.
ping 127.0.0.1 -n 2 >nul

echo  [2/4] Sauvegarde de l'ancien launcher...
copy /Y "%DST%" "%DST%.bak" >nul

echo  [3/4] Installation du nouveau launcher...
copy /Y "%SRC%" "%DST%" >nul
if errorlevel 1 (
  echo  *** Echec de la copie. Verifiez les droits et fermez l'app si elle est ouverte. ***
  pause & exit /b 1
)

echo  [4/4] Lancement de SmartMaint...
start "" "%DST%"

echo.
echo  ============================================
echo    Termine. Le nouveau launcher est actif.
echo    Quand vous fermez l'app, node.exe sera
echo    automatiquement arrete.
echo  ============================================
echo.
timeout /t 4 >nul
