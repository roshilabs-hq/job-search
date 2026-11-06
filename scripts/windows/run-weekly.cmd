@echo off
rem Sends the weekly digest of top open matches; output goes to logs\agent.log
cd /d "%~dp0..\.."
if not exist logs mkdir logs
node --no-deprecation weekly-digest.mjs >> logs\agent.log 2>&1
