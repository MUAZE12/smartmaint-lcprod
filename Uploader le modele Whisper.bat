@echo off
setlocal enabledelayedexpansion
title Upload du modele Whisper vers Supabase Storage
cd /d "%~dp0"

set "SUPA=https://odnszwngptfqozrxexri.supabase.co"
set "BUCKET=models"

if not exist "publish-secret.txt" (
  echo.
  echo  *** Fichier "publish-secret.txt" manquant. ***
  echo.
  pause & exit /b 1
)
set /p SVCKEY=<publish-secret.txt

echo.
echo  =========================================================
echo    Upload du modele Whisper-small vers le bucket "%BUCKET%"
echo    (~240 Mo, ne se fait qu'une seule fois)
echo  =========================================================
echo.

REM Create the bucket if needed (idempotent). Public access required.
echo  [1/9] Creation/verification du bucket public "%BUCKET%"...
curl -s -X POST "%SUPA%/storage/v1/bucket" ^
  -H "Authorization: Bearer !SVCKEY!" ^
  -H "apikey: !SVCKEY!" ^
  -H "Content-Type: application/json" ^
  --data "{\"id\":\"%BUCKET%\",\"name\":\"%BUCKET%\",\"public\":true,\"file_size_limit\":262144000}" >nul

set "BASE=Xenova/whisper-small"
set "ROOT=public\models\Xenova\whisper-small"

call :upload "%ROOT%\config.json" "%BASE%/config.json" application/json 2/9
call :upload "%ROOT%\generation_config.json" "%BASE%/generation_config.json" application/json 3/9
call :upload "%ROOT%\preprocessor_config.json" "%BASE%/preprocessor_config.json" application/json 4/9
call :upload "%ROOT%\special_tokens_map.json" "%BASE%/special_tokens_map.json" application/json 5/9
call :upload "%ROOT%\tokenizer.json" "%BASE%/tokenizer.json" application/json 6/9
call :upload "%ROOT%\tokenizer_config.json" "%BASE%/tokenizer_config.json" application/json 7/9
call :upload "%ROOT%\onnx\encoder_model_quantized.onnx" "%BASE%/onnx/encoder_model_quantized.onnx" application/octet-stream 8/9
call :upload "%ROOT%\onnx\decoder_model_merged_quantized.onnx" "%BASE%/onnx/decoder_model_merged_quantized.onnx" application/octet-stream 9/9

echo.
echo  =========================================================
echo    Upload termine.
echo    Verifiez : %SUPA%/storage/v1/object/public/%BUCKET%/%BASE%/config.json
echo  =========================================================
pause
exit /b 0

:upload
set "LOCAL=%~1"
set "REMOTE=%~2"
set "CT=%~3"
set "STEP=%~4"
if not exist "%LOCAL%" (
  echo  [%STEP%] *** Fichier introuvable : %LOCAL% ***
  exit /b 1
)
for %%A in ("%LOCAL%") do set "SZ=%%~zA"
set /a "SZMB=!SZ! / 1048576"
echo  [%STEP%] Upload !REMOTE! (^!SZMB! Mo)...
curl -f -s -S -X POST "%SUPA%/storage/v1/object/%BUCKET%/%REMOTE%" ^
  -H "Authorization: Bearer !SVCKEY!" ^
  -H "apikey: !SVCKEY!" ^
  -H "x-upsert: true" ^
  -H "Content-Type: %CT%" ^
  --data-binary "@%LOCAL%" >nul
if errorlevel 1 (
  echo       *** ECHEC. ***
  exit /b 1
)
exit /b 0
