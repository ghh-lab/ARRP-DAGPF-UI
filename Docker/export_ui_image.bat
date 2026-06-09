@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
set "DOCKER_DIR=%ROOT_DIR%\Docker"
set "STAGE_DIR=%DOCKER_DIR%\ui_nas_context"
set "DIST_DIR=%DOCKER_DIR%\dist"
set "IMAGE_TAG=arrpsat-ui:latest"

where docker >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] docker est introuvable. Installez Docker Desktop et relancez.
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] Docker Desktop n'est pas demarre.
  echo Demarrez Docker Desktop puis relancez ce script.
  exit /b 1
)

if not exist "%STAGE_DIR%\Dockerfile" (
  echo [ERREUR] Contexte introuvable: "%STAGE_DIR%"
  echo Lancez d'abord Docker\build_ui_nas_tar.bat jusqu'a l'etape 3/6 minimum.
  exit /b 1
)

if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TS=%%I"
set "IMAGE_TAR=%DIST_DIR%\arrpsat-ui-image_%TS%.tar"

echo [1/2] Build image Docker...
docker build -t "%IMAGE_TAG%" "%STAGE_DIR%"
if errorlevel 1 (
  echo [ERREUR] docker build a echoue.
  exit /b 1
)

echo [2/2] Export image importable...
docker save -o "%IMAGE_TAR%" "%IMAGE_TAG%"
if errorlevel 1 (
  echo [ERREUR] docker save a echoue.
  exit /b 1
)

echo.
echo Termine.
echo Fichier a IMPORTER dans Docker Desktop:
echo   "%IMAGE_TAR%"
echo.
echo NE PAS importer ui_nas_*.tar (contexte NAS uniquement).
exit /b 0
