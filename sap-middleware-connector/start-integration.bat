@echo off
echo ==========================================
echo   SAP B1 Service Layer Integration
echo ==========================================
echo.
echo System: SAP Business One 10.0 FP 2208
echo Database: Microsoft SQL Server
echo Service Layer: Confirmed Available
echo Host: DESKTOP-NH04TP
echo.

echo Step 1: Verifying Service Layer availability...
echo.
node service-layer-verification.js

echo.
echo Step 2: Starting Service Layer middleware...
echo.
if exist .env (
    echo Configuration found, starting middleware...
    node service-layer-server.js
) else (
    echo.
    echo ⚠️ Configuration missing!
    echo Please copy .env-service-layer to .env and configure:
    echo - SAP_SERVICE_LAYER_URL
    echo - SAP_USERNAME  
    echo - SAP_PASSWORD
    echo - SAP_COMPANY_DB
    echo.
    echo Then run this script again.
    pause
)