@echo off
echo ==========================================
echo   SAP B1 Service Layer Availability Test
echo ==========================================
echo.
echo System: SAP Business One 10.0 FP 2208
echo Database: Microsoft SQL Server
echo Host: DESKTOP-NH04TP
echo Installation: 0020732581
echo.
echo Testing Service Layer availability...
echo.

node test-service-layer.js

echo.
echo ==========================================
echo   Test Complete
echo ==========================================
echo.
echo If Service Layer is not available, contact your
echo SAP administrator to enable it in SAP B1 Server Tools.
echo.
pause