# Cattura uno screenshot di una pagina con Chrome headless.
# Non dipende dal pannello di anteprima: renderizza offscreen a qualsiasi dimensione.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/shot.ps1 -Url http://localhost:5500/ -Width 1600 -Height 1000
#
param(
  [string]$Url = "http://localhost:5500/",
  [int]$Width = 1440,
  [int]$Height = 900,
  [string]$Out = "",
  [int]$WaitMs = 4000
)

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) { Write-Error "Chrome/Edge non trovato"; exit 1 }

if (-not $Out) {
  $dir = Join-Path $env:TEMP "risiko-shots"
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $Out = Join-Path $dir ("shot-{0}x{1}.png" -f $Width, $Height)
}

# profilo usa e getta: non tocca la sessione Chrome dell'utente
$profile = Join-Path $env:TEMP ("risiko-chrome-" + [guid]::NewGuid().ToString("N").Substring(0, 8))

$args = @(
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--user-data-dir=$profile",
  "--virtual-time-budget=$WaitMs",
  "--window-size=$Width,$Height",
  "--screenshot=$Out",
  $Url
)

& $chrome @args 2>$null | Out-Null

if (Test-Path $profile) { Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue }

if (Test-Path $Out) { Write-Output $Out } else { Write-Error "screenshot fallito"; exit 1 }
