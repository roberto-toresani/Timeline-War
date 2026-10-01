param([string]$Root = ".", [int]$Port = 0)

# LA PORTA, in ordine di precedenza: -Port se passato a mano (avvia.bat, riga di
# comando), altrimenti la variabile d'ambiente PORT, altrimenti 5500.
# PORT serve al pannello d'anteprima, che assegna lui una porta libera: senza
# questo ripiego due sessioni diverse litigano sulla stessa porta e la seconda
# non parte. Chi vuole una porta precisa continua a passarla con -Port.
if (-not $Port) {
    if ($env:PORT -and [int]::TryParse($env:PORT, [ref]$null)) { $Port = [int]$env:PORT }
    else { $Port = 5500 }
}

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

# CARTELLA SALVATAGGI (rotte /_saves): le partite salvate turno per turno vivono
# in RISIKO ONLINE\salvataggi\, accanto a src\ e FUORI da cio' che si pubblica.
# Il nome del file lo propone l'editor, ma qui si accetta solo [A-Za-z0-9._-]
# con estensione .json e senza "..": nessuna richiesta puo' uscire dalla cartella.
$savesDir = Join-Path (Split-Path $rootFull -Parent) "salvataggi"
if (-not (Test-Path $savesDir)) { New-Item -ItemType Directory -Path $savesDir | Out-Null }
function Test-SaveName([string]$n) {
    return ($n -match '^[A-Za-z0-9][A-Za-z0-9._-]*\.json$') -and ($n -notmatch '\.\.')
}
function Send-Json($res, [string]$text, [int]$code = 200) {
    $body = [System.Text.Encoding]::UTF8.GetBytes($text)
    $res.StatusCode = $code
    $res.ContentType = "application/json; charset=utf-8"
    $res.ContentLength64 = $body.Length
    $res.OutputStream.Write($body, 0, $body.Length)
}

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

        # MAPPA INIZIALE (POST /_start-map): l'editor manda il JSON della posizione
        # di partenza e lo scriviamo noi in src/data/start_map.json, cosi' il
        # salvataggio e' un click solo e il file nasce gia' dov'e' versionato,
        # invece che nei Download. Scrive
        # sempre e solo quel file: il percorso non arriva mai dalla richiesta.
        if ($req.HttpMethod -eq "POST" -and $path -eq "/_start-map") {
            $reader = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
            $bodyText = $reader.ReadToEnd()
            $reader.Close()
            $target = Join-Path $rootFull "data\start_map.json"
            $utf8 = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText($target, $bodyText, $utf8)
            Write-Host "mappa iniziale salvata: $target ($($bodyText.Length) caratteri)"
            $body = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
            $res.StatusCode = 200
            $res.ContentType = "application/json; charset=utf-8"
            $res.ContentLength64 = $body.Length
            $res.OutputStream.Write($body, 0, $body.Length)
        } elseif ($path -eq "/_saves" -and $req.HttpMethod -eq "GET") {
            # Elenco dei salvataggi, dal piu' recente.
            $items = @(Get-ChildItem -Path $savesDir -Filter *.json -File |
                Sort-Object LastWriteTime -Descending |
                ForEach-Object { [ordered]@{ file = $_.Name; size = $_.Length; mtime = $_.LastWriteTime.ToString("yyyy-MM-dd HH:mm") } })
            if ($items.Count -eq 0) { Send-Json $res "[]" }
            else { Send-Json $res (ConvertTo-Json -InputObject $items -Compress) }
        } elseif ($path -eq "/_saves" -and $req.HttpMethod -eq "POST") {
            # Scrive un salvataggio. Un file per turno (turno-014_1130.json):
            # se c'e' gia', lo SOVRASCRIVE (regola dell'utente).
            $name = $req.QueryString["file"]
            if (-not (Test-SaveName $name)) { Send-Json $res '{"ok":false,"error":"nome non valido"}' 400 }
            else {
                $target = Join-Path $savesDir $name
                $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
                $bodyText = $reader.ReadToEnd()
                $reader.Close()
                $utf8 = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllText($target, $bodyText, $utf8)
                Write-Host "salvataggio scritto: $target ($($bodyText.Length) caratteri)"
                Send-Json $res '{"ok":true}'
            }
        } elseif ($path.StartsWith("/_saves/") -and $req.HttpMethod -eq "GET") {
            # Legge un salvataggio per nome.
            $name = $path.Substring(8)
            $target = Join-Path $savesDir $name
            if ((Test-SaveName $name) -and (Test-Path $target -PathType Leaf)) {
                $bytes = [System.IO.File]::ReadAllBytes($target)
                $res.StatusCode = 200
                $res.ContentType = "application/json; charset=utf-8"
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else { Send-Json $res '{"ok":false,"error":"non trovato"}' 404 }
        } elseif (Test-Path $filePath -PathType Leaf) {
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
