@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"

set "UI_DIR=%ROOT_DIR%\UI_APP"
set "DOCKER_DIR=%ROOT_DIR%\Docker"
set "STAGE_DIR=%DOCKER_DIR%\ui_nas_context"
set "DIST_DIR=%DOCKER_DIR%\dist"
set "DOCKERFILE_SRC=%DOCKER_DIR%\Dockerfile.ui"

if not exist "%UI_DIR%\package.json" (
  echo [ERREUR] package.json introuvable dans "%UI_DIR%".
  exit /b 1
)

if not exist "%DOCKERFILE_SRC%" (
  echo [ERREUR] Dockerfile introuvable: "%DOCKERFILE_SRC%".
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] npm est introuvable dans le PATH.
  exit /b 1
)

echo [1/6] Installation des dependances UI...
pushd "%UI_DIR%" || exit /b 1
call npm ci
if errorlevel 1 (
  echo [ERREUR] npm ci a echoue.
  popd
  exit /b 1
)

echo [2/6] Build Next.js (routes + API)...
call npm run build
if errorlevel 1 (
  echo [ERREUR] npm run build a echoue.
  popd
  exit /b 1
)
popd

if exist "%STAGE_DIR%" rmdir /s /q "%STAGE_DIR%"
mkdir "%STAGE_DIR%" || exit /b 1

echo [3/6] Preparation du contexte Docker...
xcopy /E /I /Y "%UI_DIR%\.next\*" "%STAGE_DIR%\.next\" >nul
if errorlevel 1 (
  echo [ERREUR] Copie de .next impossible.
  exit /b 1
)

if exist "%UI_DIR%\public" (
  xcopy /E /I /Y "%UI_DIR%\public\*" "%STAGE_DIR%\public\" >nul
)

if exist "%ROOT_DIR%\Public_Data\classes_plantations_polynesie.json" (
  if not exist "%STAGE_DIR%\public\data" mkdir "%STAGE_DIR%\public\data"
  copy /Y "%ROOT_DIR%\Public_Data\classes_plantations_polynesie.json" "%STAGE_DIR%\public\data\classes_plantations_polynesie.json" >nul
)

copy /Y "%UI_DIR%\package.json" "%STAGE_DIR%\package.json" >nul
if errorlevel 1 (
  echo [ERREUR] Copie de package.json impossible.
  exit /b 1
)

copy /Y "%UI_DIR%\package-lock.json" "%STAGE_DIR%\package-lock.json" >nul
if errorlevel 1 (
  echo [ERREUR] Copie de package-lock.json impossible.
  exit /b 1
)

copy /Y "%UI_DIR%\next.config.mjs" "%STAGE_DIR%\next.config.mjs" >nul
if errorlevel 1 (
  echo [ERREUR] Copie de next.config.mjs impossible.
  exit /b 1
)

copy /Y "%DOCKERFILE_SRC%" "%STAGE_DIR%\Dockerfile" >nul
if errorlevel 1 (
  echo [ERREUR] Copie du Dockerfile impossible.
  exit /b 1
)

if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TS=%%I"
set "TAR_FILE=%DIST_DIR%\ui_nas_%TS%.tar"
set "IMAGE_TAG=arrpsat-ui:latest"
set "IMAGE_TAR=%DIST_DIR%\arrpsat-ui-image_%TS%.tar"

echo [4/6] Creation de l'archive TAR...
tar -cf "%TAR_FILE%" -C "%STAGE_DIR%" .
if errorlevel 1 (
  echo [ERREUR] Echec de la creation du TAR.
  exit /b 1
)

where docker >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] docker est introuvable dans le PATH.
  echo Archive contexte NAS generee: "%TAR_FILE%"
  echo Cette archive NE S'IMPORTE PAS dans Docker Desktop.
  echo Installez/demarrez Docker Desktop puis lancez Docker\export_ui_image.bat
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] Docker Desktop n'est pas demarre.
  echo Archive contexte NAS generee: "%TAR_FILE%"
  echo NE PAS importer ui_nas_*.tar dans Docker Desktop.
  echo Demarrez Docker Desktop puis lancez Docker\export_ui_image.bat
  exit /b 1
)

echo [5/6] Build image Docker...
docker build -t "%IMAGE_TAG%" "%STAGE_DIR%"
if errorlevel 1 (
  echo [ERREUR] Echec du docker build.
  exit /b 1
)

echo [6/6] Export image Docker en TAR importable...
docker save -o "%IMAGE_TAR%" "%IMAGE_TAG%"
if errorlevel 1 (
  echo [ERREUR] Echec du docker save.
  exit /b 1
)

echo Termine.
echo.
echo ============================================================
echo IMPORTANT - DEUX FICHIERS DIFFERENTS
echo ============================================================
echo.
echo [A] Archive CONTEXTE (NAS) - NE PAS IMPORTER dans Docker Desktop:
echo     "%TAR_FILE%"
echo     Usage: transferer sur NAS, extraire, puis "docker build" sur le NAS.
echo.
echo [B] Archive IMAGE (Docker Desktop) - CELLE-CI A IMPORTER:
echo     "%IMAGE_TAR%"
echo     Usage: Docker Desktop ^> Images ^> Import ^> choisir ce fichier .tar
echo     Puis lancer un conteneur depuis l'image "arrpsat-ui:latest".
echo.
echo Si vous avez seulement ui_nas_*.tar:
echo   - Demarrer Docker Desktop
echo   - Relancer ce script jusqu'au bout, OU
echo   - Lancer Docker\export_ui_image.bat
echo.
echo Lancer conteneur (apres import ou build local):
echo   docker run -d --name arrpsat-ui -p 3000:3000 arrpsat-ui:latest

exit /b 0
