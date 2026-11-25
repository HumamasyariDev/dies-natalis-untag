@echo off
REM Runs the pose-detection server from the host, so it's reachable from real
REM browsers -- including over the LAN at http://<your-lan-ip>:3939 (the camera
REM won't work over plain LAN http, only localhost or https -- see README).
cd /d "%~dp0"
echo Starting MediaPipe Pose Detection server...
echo Local:  http://localhost:3939
echo LAN:    http://<your-lan-ip>:3939  (camera requires localhost or https)
echo.
call npm start
pause
