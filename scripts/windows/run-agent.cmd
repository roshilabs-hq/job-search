@echo off
rem Runs the job agent from the kit folder and appends output to logs\agent.log
cd /d "%~dp0..\.."
if not exist logs mkdir logs
node --no-deprecation job-agent.mjs >> logs\agent.log 2>&1
