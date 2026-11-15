@echo off
rem ---------------------------------------------------------------
rem  One-command deploy for the Expense Tracker
rem  Pushes the files in this folder to GitHub, which rebuilds the
rem  live site at https://mohammed-thoufeek.github.io/expense-tracker/
rem  (Pages rebuild takes about a minute after the push.)
rem ---------------------------------------------------------------
cd /d "%~dp0"

echo Syncing local files...
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Deploy: %date% %time%"
) else (
  echo Nothing new to deploy - files already match the last commit.
)

echo Pushing to GitHub...
git push origin main
if errorlevel 1 (
  echo.
  echo PUSH FAILED - check your internet connection and try again.
  pause
  exit /b 1
)

echo.
echo ============================================
echo  Deployed! Live site refreshes in ~1 minute:
echo  https://mohammed-thoufeek.github.io/expense-tracker/
echo ============================================
echo  Tip: hard-refresh on iPhone (or re-open the
echo  home-screen app) to pick up the new files.
pause
