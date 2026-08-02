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

$reviewPath = $env:FD_POS_REVIEW_PATH
if (-not $reviewPath) {
  $reviewPath = "G:/My Drive/Business/Digital Products/Backyard Livestock Planner 1/Attempt 3/promise-review.csv"
}
$reviewParent = Split-Path -Parent $reviewPath
if (-not (Test-Path -LiteralPath $reviewParent)) { throw "Review output folder not found: $reviewParent" }

$headers = @{ "x-fd-pos-secret" = $serviceSecret }
$state = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/digital-products/backyard-livestock-planner/state" -Headers $headers
$approval = @($state.approvals | Where-Object { $_.approvalType -eq "promise-list" -and $_.status -eq "PENDING" } | Sort-Object createdAt -Descending)[0]
if (-not $approval) { throw "No pending promise-list approval was found." }

$promisesById = @{}
foreach ($promise in $state.promises) { $promisesById[$promise.promiseId] = $promise }

function Get-AssetTypeLabel {
  param([string] $AssetType)
  switch ($AssetType) {
    "spreadsheet" { return "spreadsheet or editable table" }
    "worksheet" { return "printable worksheet" }
    "checklist" { return "printable checklist" }
    "template" { return "reusable template" }
    "module" { return "instructional module" }
    "pdf" { return "printable PDF reference" }
    default { return "supporting resource" }
  }
}

function Get-ProposedAssetName {
  param([string] $Text, [string] $AssetType)
  if ($Text -match "(?i)homestead command center") { return "Homestead Command Center Template" }
  if ($Text -match "(?i)emergency protocol|vet contact") { return "Livestock Emergency Protocol and Vet Contact Sheet" }
  if ($Text -match "(?i)financial.*supply tracker|expense|inventory") { return "Financial, Expense, and Supply Tracker" }
  if ($Text -match "(?i)harvest-to-table meal planner") { return "Harvest-to-Table Meal Planner" }
  if ($Text -match "(?i)seed.*planting guide") { return "Seasonal Seed and Planting Guide" }
  if ($Text -match "(?i)livestock health emergency toolkit") { return "Livestock Health Emergency Toolkit" }
  if ($Text -match "(?i)calendar overlay") { return "Yearly Homestead Calendar Template" }
  if ($Text -match "(?i)farmers.*market.*sales tracker") { return "Farmers Market and Sales Tracker" }
  if ($Text -match "(?i)bonus vault") { return "Approved Bonus Resource Collection" }
  if ($Text -match "(?i)planner.*checklist|recurring task") { return "Recurring Chore Planner and Checklist" }
  $normalizedText = $Text -replace "[\u2013\u2014:]", " "
  $words = @($normalizedText -split "\s+" | Where-Object { $_ })
  $shortText = ($words | Select-Object -First 8) -join " "
  $typeLabel = (Get-AssetTypeLabel -AssetType $AssetType)
  return "$shortText - $typeLabel"
}

function Get-PromiseMeaning {
  param([string] $Classification, [string] $Category)
  if ($Classification -eq "needs_asset") { return "This wording may lead a buyer to expect a separate downloadable resource in addition to the ebook." }
  if ($Classification -eq "rewrite") { return "This statement may overpromise a feature, price, result, or implementation and should be rewritten before publication." }
  if ($Classification -eq "remove") { return "This statement should not appear in the included product unless the reviewer explicitly reverses the recommendation." }
  if ($Category -eq "app-tie-in") { return "This references an app or digital capability. Confirm the app is optional and the described capability is verified." }
  return "This is a customer-facing product statement that should be confirmed as accurate and appropriate to keep."
}

function Get-ProposedAssetDescription {
  param([string] $Text, [string] $Classification, [string] $AssetType)
  if ($Classification -ne "needs_asset") { return "No separate asset is proposed by default. Approving this row keeps the statement; change classification to needs_asset if a downloadable resource is required." }
  $typeLabel = Get-AssetTypeLabel -AssetType $AssetType
  return "Create a $typeLabel that directly fulfills this promise: $Text The resource must be practical, usable without the Livestock Tracker app, and include paper or spreadsheet instructions when relevant."
}

function Get-ReviewGuidance {
  param([string] $Classification)
  switch ($Classification) {
    "needs_asset" { return "APPROVED means this resource may be generated and included. REJECTED means do not create it and remove or revise the promise." }
    "rewrite" { return "Use REWRITE_REQUIRED and explain the acceptable wording in notes, unless the claim should be removed entirely." }
    "remove" { return "Use REJECTED to confirm removal, or change the classification and explain why it is safe to keep." }
    default { return "Use APPROVED to keep this statement, REJECTED to remove it, or REWRITE_REQUIRED when wording must change." }
  }
}

$rows = foreach ($item in $approval.items) {
  $promise = $promisesById[$item.promiseId]
  $proposedAssetName = if ($item.classification -eq "needs_asset") { Get-ProposedAssetName -Text $item.text -AssetType $item.requiredAssetType } else { "Not proposed" }
  [pscustomobject]@{
    approvalStatus = "PENDING"
    classification = $item.classification
    promiseText = $item.text
    promiseMeaning = Get-PromiseMeaning -Classification $item.classification -Category $item.category
    proposedAssetName = $proposedAssetName
    proposedAssetDescription = Get-ProposedAssetDescription -Text $item.text -Classification $item.classification -AssetType $item.requiredAssetType
    reviewGuidance = Get-ReviewGuidance -Classification $item.classification
    reviewerNotes = $promise.notes
    category = $item.category
    riskLevel = $item.riskLevel
    requiredAssetType = $item.requiredAssetType
    approvalId = $approval.approvalId
    promiseId = $item.promiseId
    sourceAssetId = $promise.sourceAssetId
    sourceLocation = $promise.sourceLocation
  }
}

$rows | Export-Csv -LiteralPath $reviewPath -NoTypeInformation -Encoding UTF8
[pscustomobject]@{
  ok = $true
  reviewPath = $reviewPath
  approvalId = $approval.approvalId
  rows = @($rows).Count
  instructions = "Set approvalStatus on every row to APPROVED, REJECTED, or REWRITE_REQUIRED. Adjust classification and notes as needed."
} | ConvertTo-Json -Depth 4
