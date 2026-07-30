param([string]$Root = ".", [int]$Port = 5500)

# Server statico locale dependency-free per l'app in src/.
# Robusto: ogni richiesta e' gestita in try/catch, cosi' un errore di scrittura
# (favicon mancante, connessione chiusa dal browser, richiesta HEAD/Range) NON
# fa crashare il server. In precedenza un'eccezione non gestita spegneva il
# listener e "localhost non rispondeva piu'".

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
    $listener.Start()
} catch {
    Write-Host "Impossibile avviare il server sulla porta ${Port}: $($_.Exception.Message)"
    exit 1
}
Write-Host "Risiko Online in ascolto su http://localhost:$Port/  (chiudi questa finestra per fermarlo)"

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".avif" = "image/avif"
    ".ico"  = "image/x-icon"
    ".txt"  = "text/plain; charset=utf-8"
}
$rootFull = (Resolve-Path $Root).Path

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
    } catch {
        break
    }

    $req = $context.Request
    $res = $context.Response
    try {
        $path = [System.Uri]::UnescapeDataString($req.Url.LocalPath)
        if ($path -eq "/") { $path = "/index.html" }
        # La query string (es. ?v=16) e' gia' esclusa da LocalPath.
        $filePath = Join-Path $rootFull ($path.TrimStart("/"))

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $ct = $mime[$ext]
            if (-not $ct) { $ct = "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $res.StatusCode = 200
            $res.ContentType = $ct
            $res.ContentLength64 = $bytes.Length
            if ($req.HttpMethod -ne "HEAD") {
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } else {
            $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
            $res.StatusCode = 404
            $res.ContentType = "text/plain; charset=utf-8"
            $res.ContentLength64 = $body.Length
            $res.OutputStream.Write($body, 0, $body.Length)
        }
    } catch {
        # Connessione chiusa dal client o errore di scrittura: ignora e continua a servire.
        Write-Host ("richiesta ignorata: " + $_.Exception.Message)
    } finally {
        try { $res.OutputStream.Close() } catch {}
        try { $res.Close() } catch {}
    }
}
