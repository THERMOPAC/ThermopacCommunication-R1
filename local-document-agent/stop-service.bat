@echo off
echo Stopping ThermopacLocalDocumentAgent...
net stop ThermopacLocalDocumentAgent
if %ERRORLEVEL% equ 0 (
  echo Service stopped successfully.
) else (
  echo Service may already be stopped or not installed as a service.
)
pause
