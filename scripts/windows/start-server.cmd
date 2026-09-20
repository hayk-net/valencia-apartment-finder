@echo off
rem Valencia Apartment Finder — production server wrapper for Task Scheduler.
rem Task Scheduler can't set a working directory, so this script does.
cd /d "%~dp0..\.."
if not exist data\logs mkdir data\logs
set API_PORT=4321
node dist\server\index.js >> data\logs\server.log 2>&1
