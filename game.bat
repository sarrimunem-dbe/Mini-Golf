@echo off
REM Change directory to the folder where this batch file is located
cd /d %~dp0

REM Move into the backend folder
cd "C:\Users\email\Downloads\Mini Golf\backend"

REM Start the server using Node
node server.js

REM Keep the window open after the server stops
pause
