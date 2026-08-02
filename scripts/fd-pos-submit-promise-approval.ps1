$ErrorActionPreference = "Stop"

$rootPath = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $rootPath ".env"
if (Test-Path -LiteralPath $envPath) {
  foreach ($line in Get-Content -LiteralPath $envPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) { continue }
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
  if ($firebaseRc.projects.default) { $projectId = $firebaseRc.projects.default }
}

$apiBaseUrl = $env:FD_POS_API_BASE_URL
if (-not $apiBaseUrl) { $apiBaseUrl = "http://127.0.0.1:5001/$projectId/us-central1/api" }
$apiBaseUrl = $apiBaseUrl.TrimEnd("/")
$serviceSecret = $env:FD_POS_SERVICE_SECRET
if (-not $serviceSecret) { throw "FD_POS_SERVICE_SECRET is required." }
$reviewer = $env:FD_POS_REVIEWER
if (-not $reviewer) { throw "FD_POS_REVIEWER is required and must identify the human reviewer." }

$reviewPath = $env:FD_POS_REVIEW_PATH
if (-not $reviewPath) {
  $reviewPath = "G:/My Drive/Business/Digital Products/Backyard Livestock Planner 1/Attempt 3/promise-review.csv"
}
if (-not (Test-Path -LiteralPath $reviewPath)) { throw "Review CSV not found: $reviewPath" }

$rows = @(Import-Csv -LiteralPath $reviewPath)
if (-not $rows.Count) { throw "Review CSV contains no decisions." }
$approvalIds = @($rows.approvalId | Where-Object { $_ } | Select-Object -Unique)
if ($approvalIds.Count -ne 1) { throw "Every row must reference the same approvalId." }
$allowedStatuses = @("APPROVED", "REJECTED", "REWRITE_REQUIRED")
$allowedClassifications = @("keep", "needs_asset", "needs_evidence", "move_to_upsell", "remove", "rewrite", "ignore")

foreach ($row in $rows) {
  if (-not $row.promiseId) { throw "Every row must have a promiseId." }
  if ($allowedStatuses -notcontains $row.approvalStatus) { throw "Promise $($row.promiseId) has invalid or pending approvalStatus: $($row.approvalStatus)" }
  if ($allowedClassifications -notcontains $row.classification) { throw "Promise $($row.promiseId) has invalid classification: $($row.classification)" }
}

$headers = @{ "x-fd-pos-secret" = $serviceSecret }
$state = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/digital-products/backyard-livestock-planner/state" -Headers $headers
$approval = @($state.approvals | Where-Object { $_.approvalId -eq $approvalIds[0] })[0]
if (-not $approval -or $approval.status -ne "PENDING") { throw "The referenced approval is not pending." }
$expectedPromiseIds = @($approval.items.promiseId | Sort-Object)
$submittedPromiseIds = @($rows.promiseId | Sort-Object)
if (($expectedPromiseIds -join "|") -ne ($submittedPromiseIds -join "|")) { throw "CSV promise IDs do not exactly match the pending approval." }

$overallStatus = if (@($rows | Where-Object { $_.approvalStatus -eq "REWRITE_REQUIRED" }).Count) { "CHANGES_REQUESTED" } else { "APPROVED" }
$decisions = @($rows | ForEach-Object {
  @{
    promiseId = $_.promiseId
    approvalStatus = $_.approvalStatus
    classification = $_.classification
    notes = if ($_.reviewerNotes) { $_.reviewerNotes } else { $_.notes }
  }
})
$payload = @{
  status = $overallStatus
  reviewer = $reviewer
  reviewerNotes = $env:FD_POS_REVIEWER_NOTES
  decisions = $decisions
} | ConvertTo-Json -Depth 6
$payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
$approvalId = $approvalIds[0]
$response = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/digital-products/backyard-livestock-planner/approvals/$approvalId/decide" -ContentType "application/json; charset=utf-8" -Headers $headers -Body $payloadBytes
$response | ConvertTo-Json -Depth 6
