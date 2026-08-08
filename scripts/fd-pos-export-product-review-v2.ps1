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

$productFolder = "G:/My Drive/Business/Digital Products/Backyard Livestock Planner 1/Attempt 3"
$previousReviewPath = Join-Path $productFolder "promise-review.xlsx"
$outputPath = $env:FD_POS_REVIEW_V2_PATH
if (-not $outputPath) { $outputPath = Join-Path $productFolder "product-review-v2.xlsx" }

$headers = @{ "x-fd-pos-secret" = $serviceSecret }
$state = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/digital-products/backyard-livestock-planner/state" -Headers $headers
$ebookPromises = @($state.promises | Where-Object { $_.sourceIntent -eq "product-content" } | Sort-Object promiseId)
$proposals = @($state.promises | Where-Object { $_.sourceIntent -eq "proposal" } | Sort-Object promiseId)
if (-not $ebookPromises.Count -or -not $proposals.Count) { throw "Expected both ebook promises and value-enhancer proposals." }

function Format-Range {
  param($Range)
  if (-not $Range) { return "Not estimated" }
  return "$($Range.min)-$($Range.max)"
}

function Get-ProposalRecommendation {
  param([string] $Feasibility)
  switch ($Feasibility) {
    "FEASIBLE_STATIC" { return "FEASIBLE" }
    "FEASIBLE_WITH_RESEARCH" { return "FEASIBLE_WITH_RESEARCH" }
    "FEASIBLE_PRERECORDED" { return "FEASIBLE_AS_PRERECORDED" }
    "REWRITE_AS_STATIC" { return "REWRITE_AS_STATIC" }
    "REQUIRES_VERIFIED_APP_FEATURES" { return "VERIFY_OR_REWRITE" }
    "NOT_FEASIBLE_FOR_CURRENT_PRODUCT" { return "MOVE_TO_UPSELL_OR_REJECT" }
    default { return "REVIEW" }
  }
}

$priorEbookDecisions = @{}
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$priorWorkbook = $null
$workbook = $null
try {
  if (Test-Path -LiteralPath $previousReviewPath) {
    $priorWorkbook = $excel.Workbooks.Open($previousReviewPath, 0, $true)
    $priorSheet = $priorWorkbook.Worksheets.Item("Promise Review")
    $used = $priorSheet.UsedRange
    $priorHeaders = @{}
    for ($column = 1; $column -le $used.Columns.Count; $column++) { $priorHeaders[[string]$priorSheet.Cells.Item(1, $column).Text] = $column }
    for ($row = 2; $row -le $used.Rows.Count; $row++) {
      $promiseId = [string]$priorSheet.Cells.Item($row, $priorHeaders["promiseId"]).Text
      $sourceAssetId = [string]$priorSheet.Cells.Item($row, $priorHeaders["sourceAssetId"]).Text
      if ($promiseId -and $sourceAssetId -like "*_primary") {
        $priorEbookDecisions[$promiseId] = @{
          approvalStatus = [string]$priorSheet.Cells.Item($row, $priorHeaders["approvalStatus"]).Text
          classification = [string]$priorSheet.Cells.Item($row, $priorHeaders["classification"]).Text
          reviewerNotes = [string]$priorSheet.Cells.Item($row, $priorHeaders["reviewerNotes"]).Text
        }
      }
    }
    $priorWorkbook.Close($false)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($priorSheet)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($priorWorkbook)
    $priorWorkbook = $null
  }

  $workbook = $excel.Workbooks.Add()
  while ($workbook.Worksheets.Count -lt 4) { [void]$workbook.Worksheets.Add() }
  while ($workbook.Worksheets.Count -gt 4) { $workbook.Worksheets.Item($workbook.Worksheets.Count).Delete() }
  $instructions = $workbook.Worksheets.Item(1)
  $policySheet = $workbook.Worksheets.Item(2)
  $ebookSheet = $workbook.Worksheets.Item(3)
  $proposalSheet = $workbook.Worksheets.Item(4)
  $instructions.Name = "Instructions"
  $policySheet.Name = "Supervisor Policy"
  $ebookSheet.Name = "Ebook Promise Review"
  $proposalSheet.Name = "Value Enhancer Feasibility"

  $instructionLines = @(
    "FD-POS Product Review v2",
    "Ebook Promise Review contains customer-facing promises from the paid ebook.",
    'Value Enhancer Feasibility contains recommendations only. None are included in the $17 product by default.',
    "For value-enhancer proposals choose FEASIBLE, REWRITE_AS_STATIC, MOVE_TO_UPSELL, or REJECT.",
    "Cash estimates assume AI-assisted creation with existing software. Outsource estimates are broad planning ranges, not quotes.",
    "Labor estimates exclude later customer support and maintenance unless stated in recurringCostEstimate.",
    "Do not edit hidden IDs."
  )
  for ($index = 0; $index -lt $instructionLines.Count; $index++) { $instructions.Cells.Item($index + 1, 1).Value2 = $instructionLines[$index] }
  $instructions.Cells.Item(1, 1).Font.Bold = $true
  $instructions.Columns.Item(1).ColumnWidth = 120
  $instructions.Columns.Item(1).WrapText = $true

  $policySheet.Cells.NumberFormat = "@"
  $policySheet.Cells.Item(1, 1).Value2 = "setting"
  $policySheet.Cells.Item(1, 2).Value2 = "currentValue"
  $policySheet.Cells.Item(1, 3).Value2 = "meaning"
  $policyDescriptions = [ordered]@{
    maxAutoCashCostUsd = "Maximum estimated one-time cash cost for an automatic FEASIBLE decision."
    maxAutoLaborHours = "Maximum estimated labor hours for an automatic FEASIBLE decision."
    maxAutoRecurringCostUsdMonthly = "Maximum estimated monthly recurring cost for an automatic FEASIBLE decision."
    allowStaticPrintables = "Allow supervisor feasibility decisions for static PDFs, worksheets, checklists, and templates."
    allowSpreadsheets = "Allow supervisor feasibility decisions for spreadsheet assets."
    allowPrerecordedTraining = "Allow prerecorded self-serve training modules; does not permit live training."
    allowResearchHeavyAssets = "Allow research-heavy guides without separate human review."
    allowAppDependentAssets = "Allow assets that depend on verified app features and ongoing screenshot maintenance."
    allowLiveServices = "Allow live calls, coaching, mastermind sessions, or scheduled delivery."
    allowOngoingSupport = "Allow communities, personalized review, direct support, or moderation obligations."
    autoRejectDisallowedServices = "Automatically reject live or ongoing services when the corresponding settings are false."
    autoIncludeFeasibleProposals = "Automatically include feasible proposals in the paid product. Kept false for human promotion approval."
  }
  $policyRow = 2
  foreach ($setting in $policyDescriptions.Keys) {
    $policySheet.Cells.Item($policyRow, 1).Value2 = [string]$setting
    $policySheet.Cells.Item($policyRow, 2).Value2 = [string]$state.product.supervisorPolicy.$setting
    $policySheet.Cells.Item($policyRow, 3).Value2 = [string]$policyDescriptions[$setting]
    $policyRow++
  }
  $policySheet.Rows.Item(1).Font.Bold = $true
  $policySheet.Rows.Item(1).Interior.ColorIndex = 15
  $policySheet.Columns.Item(1).ColumnWidth = 38
  $policySheet.Columns.Item(2).ColumnWidth = 18
  $policySheet.Columns.Item(3).ColumnWidth = 100
  $policySheet.UsedRange.WrapText = $true

  $ebookHeaders = @("approvalStatus", "classification", "promiseText", "reviewerNotes", "category", "riskLevel", "requiredAssetType", "promiseId", "sourceLocation")
  $ebookSheet.Cells.NumberFormat = "@"
  for ($column = 0; $column -lt $ebookHeaders.Count; $column++) { $ebookSheet.Cells.Item(1, $column + 1).Value2 = $ebookHeaders[$column] }
  $row = 2
  foreach ($promise in $ebookPromises) {
    $prior = $priorEbookDecisions[$promise.promiseId]
    $values = @(
      $(if ($prior) { $prior.approvalStatus } else { "PENDING" }),
      $(if ($prior) { $prior.classification } else { $promise.classification }),
      $promise.text,
      $(if ($prior) { $prior.reviewerNotes } else { "" }),
      $promise.category,
      $promise.riskLevel,
      $promise.requiredAssetType,
      $promise.promiseId,
      $promise.sourceLocation
    )
    for ($column = 0; $column -lt $values.Count; $column++) { $ebookSheet.Cells.Item($row, $column + 1).Value2 = [string]$values[$column] }
    $row++
  }

  $proposalHeaders = @("feasibilityDecision", "decisionSource", "systemRecommendation", "supervisorReason", "proposalText", "feasibility", "includedIn17Product", "suggestedAssetType", "estimatedCashCostUsd", "estimatedLaborHours", "estimatedOutsourceCostUsd", "recurringCostEstimate", "limitsAndDependencies", "reviewerNotes", "proposalId", "sourceLocation")
  $proposalSheet.Cells.NumberFormat = "@"
  for ($column = 0; $column -lt $proposalHeaders.Count; $column++) { $proposalSheet.Cells.Item(1, $column + 1).Value2 = $proposalHeaders[$column] }
  $row = 2
  foreach ($proposal in $proposals) {
    $values = @(
      $(if ($proposal.supervisorAutomated) { $proposal.supervisorDecision } else { "PENDING" }),
      $(if ($proposal.supervisorAutomated) { "SUPERVISOR_POLICY" } else { "HUMAN_REQUIRED" }),
      $(if ($proposal.supervisorDecision) { $proposal.supervisorDecision } else { Get-ProposalRecommendation -Feasibility $proposal.feasibility }),
      $proposal.supervisorReason,
      $proposal.text,
      $proposal.feasibility,
      "NO",
      $proposal.requiredAssetType,
      (Format-Range -Range $proposal.estimatedCashCostUsd),
      (Format-Range -Range $proposal.estimatedLaborHours),
      (Format-Range -Range $proposal.estimatedOutsourceCostUsd),
      $proposal.recurringCostEstimate,
      $proposal.limits,
      "",
      $proposal.promiseId,
      $proposal.sourceLocation
    )
    for ($column = 0; $column -lt $values.Count; $column++) { $proposalSheet.Cells.Item($row, $column + 1).Value2 = [string]$values[$column] }
    $row++
  }

  foreach ($sheet in @($ebookSheet, $proposalSheet)) {
    $sheet.Rows.Item(1).Font.Bold = $true
    $sheet.Rows.Item(1).Interior.ColorIndex = 15
    $sheet.UsedRange.WrapText = $true
    $sheet.UsedRange.VerticalAlignment = -4160
    [void]$sheet.UsedRange.AutoFilter()
    $sheet.Columns.AutoFit() | Out-Null
    for ($column = 1; $column -le $sheet.UsedRange.Columns.Count; $column++) {
      if ($sheet.Columns.Item($column).ColumnWidth -gt 45) { $sheet.Columns.Item($column).ColumnWidth = 45 }
    }
  }

  $xlsxFormat = 51
  $workbook.SaveAs($outputPath, $xlsxFormat)
  $workbook.Close($true)
} finally {
  if ($priorWorkbook) { $priorWorkbook.Close($false) }
  if ($workbook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
  $excel.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

[pscustomobject]@{
  ok = $true
  outputPath = $outputPath
  ebookPromises = $ebookPromises.Count
  valueEnhancerProposals = $proposals.Count
  valueEnhancerItemsIncludedByDefault = 0
} | ConvertTo-Json -Depth 4
