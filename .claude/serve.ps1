# Local preview server for the prototype (testing only).
$root = Split-Path -Parent $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8765/')
$listener.Start()
Write-Output "Serving $root on http://localhost:8765/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = Join-Path $root 'call-sheets.html'
  $html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">' + [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) + '</body></html>'
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($html)
  $ctx.Response.ContentType = 'text/html; charset=utf-8'
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}
