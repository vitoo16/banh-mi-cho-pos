@echo off
setlocal
set "BMC_SUITE=%~1"
if "%BMC_SUITE%"=="" set "BMC_SUITE=quick"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-ci.ps1" -Suite "%BMC_SUITE%"
exit /b %ERRORLEVEL%
