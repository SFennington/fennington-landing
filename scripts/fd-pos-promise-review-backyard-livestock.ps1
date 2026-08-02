$ErrorActionPreference = "Stop"

$rootPath = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $rootPath ".env"
if (Test-Path -LiteralPath $envPath) {
  foreach ($line in Get-Content -LiteralPath $envPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
      continue
    }
    $separator = $trimmed.IndexOf("=")
    $key = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim().Trim("'", '"')
    if ($key -and -not [Environment]::GetEnvironmentVariable($key, "Process")) {
      [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
  }
}

$projectId = "fennington-financial"
$firebaseRcPath = Join-Path $rootPath ".firebaserc"
if (Test-Path -LiteralPath $firebaseRcPath) {
  $firebaseRc = Get-Content -LiteralPath $firebaseRcPath -Raw | ConvertFrom-Json
  if ($firebaseRc.projects.default) {
    $projectId = $firebaseRc.projects.default
  }
}

$apiBaseUrl = ($env:FD_POS_API_BASE_URL)
if (-not $apiBaseUrl) {
  $apiBaseUrl = "http://127.0.0.1:5001/$projectId/us-central1/api"
}
$apiBaseUrl = $apiBaseUrl.TrimEnd("/")

$serviceSecret = $env:FD_POS_SERVICE_SECRET
if (-not $serviceSecret) {
  throw "FD_POS_SERVICE_SECRET is required."
}

$assets = @(
  @{
    assetId = "backyard-livestock-planner-001_primary"
    pathOrUrl = "G:/My Drive/Business/Digital Products/Backyard Livestock Planner 1/Attempt 3/ebook-asset.docx"
  },
  @{
    assetId = "backyard-livestock-planner-001_value_enhancer"
    pathOrUrl = "G:/My Drive/Business/Digital Products/Backyard Livestock Planner 1/Attempt 3/value-enhancer.docx"
  }
)

function Convert-DocxToText {
  param(
    [Parameter(Mandatory = $true)] [string] $Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "DOCX file not found: $Path"
  }

  $tempRoot = Join-Path $env:TEMP ("fd-pos-docx-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  $zipPath = Join-Path $tempRoot "asset.zip"
  Copy-Item -LiteralPath $Path -Destination $zipPath
  Expand-Archive -LiteralPath $zipPath -DestinationPath $tempRoot -Force

  $documentXmlPath = Join-Path $tempRoot "word/document.xml"
  if (-not (Test-Path -LiteralPath $documentXmlPath)) {
    throw "DOCX document XML was not found: $Path"
  }

  [xml] $documentXml = [System.IO.File]::ReadAllText($documentXmlPath, [System.Text.Encoding]::UTF8)
  $namespaceManager = New-Object System.Xml.XmlNamespaceManager($documentXml.NameTable)
  $namespaceManager.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")
  $paragraphs = $documentXml.SelectNodes("//w:body/w:p", $namespaceManager)
  $lines = New-Object System.Collections.Generic.List[string]

  foreach ($paragraph in $paragraphs) {
    $textNodes = $paragraph.SelectNodes(".//w:t", $namespaceManager)
    $text = (($textNodes | ForEach-Object { $_.'#text' }) -join "").Trim()
    if ($text) {
      $lines.Add([System.Net.WebUtility]::HtmlDecode($text))
    }
  }

  Remove-Item -LiteralPath $tempRoot -Recurse -Force
  return ($lines -join "`n")
}

$sourceTexts = @()
foreach ($asset in $assets) {
  $sourceTexts += @{
    assetId = $asset.assetId
    pathOrUrl = $asset.pathOrUrl
    text = Convert-DocxToText -Path $asset.pathOrUrl
  }
}

$body = @{ sourceTexts = $sourceTexts } | ConvertTo-Json -Depth 6
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$response = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/digital-products/backyard-livestock-planner/promise-review" -ContentType "application/json; charset=utf-8" -Headers @{ "x-fd-pos-secret" = $serviceSecret } -Body $bodyBytes
$response | ConvertTo-Json -Depth 8
