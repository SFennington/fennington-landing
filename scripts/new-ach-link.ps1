<#
.SYNOPSIS
  Creates a live Stripe subscription Payment Link that accepts bank payments (ACH) only.

.DESCRIPTION
  The Stripe Dashboard can't set payment methods per link, so this goes through the API.

  Uses the restricted key STRIPE_LINK_KEY (Products, Prices, Payment Links) from Secret
  Manager in fennington-financial. Always creates a new product, price and link, and never
  edits existing ones, because this Stripe account also bills Livestock Tracker.

.EXAMPLE
  ./scripts/new-ach-link.ps1 -Name "T3 Inspections - Web Hosting" -Amount 200 -Interval year

.EXAMPLE
  # First charge 5 days after signup, then monthly.
  ./scripts/new-ach-link.ps1 -Name "Acme - Growth Plan" -Amount 850 -Interval month -TrialDays 5
#>
param(
  [Parameter(Mandatory)][string]$Name,
  [Parameter(Mandatory)][decimal]$Amount,
  [Parameter(Mandatory)][ValidateSet('month', 'year')][string]$Interval,
  [ValidateRange(0, 730)][int]$TrialDays = 0
)

# Read before turning on Stop: firebase writes to stderr, which Stop would treat as fatal.
$key = firebase functions:secrets:access STRIPE_LINK_KEY --project fennington-financial 2>$null | Select-Object -Last 1

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not $key -or $key.Trim() -notmatch '^rk_live_') {
  throw 'STRIPE_LINK_KEY is missing or is not a restricted live key.'
}
if ($Amount -le 0) {
  throw 'Amount must be more than zero.'
}

$cents = [int][math]::Round($Amount * 100)
$headers = @{ Authorization = "Bearer $($key.Trim())" }
$api = 'https://api.stripe.com/v1'

$price = Invoke-RestMethod -Method Post -Uri "$api/prices" -Headers $headers -Body @{
  'product_data[name]'  = $Name
  'unit_amount'         = [string]$cents
  'currency'            = 'usd'
  'recurring[interval]' = $Interval
}

$linkBody = @{
  'line_items[0][price]'      = $price.id
  'line_items[0][quantity]'   = '1'
  'payment_method_types[0]'   = 'us_bank_account'
  'payment_method_collection' = 'always'
}
if ($TrialDays -gt 0) {
  $linkBody['subscription_data[trial_period_days]'] = [string]$TrialDays
}
$link = Invoke-RestMethod -Method Post -Uri "$api/payment_links" -Headers $headers -Body $linkBody

# Read the link back so what gets reported is what Stripe actually stored.
$saved = Invoke-RestMethod -Uri "$api/payment_links/$($link.id)" -Headers $headers
$item = (Invoke-RestMethod -Uri "$api/payment_links/$($link.id)/line_items" -Headers $headers).data[0]

$methods = @($saved.payment_method_types) -join ','
if ($methods -ne 'us_bank_account') { throw "Link $($link.id) accepts '$methods', not ACH only." }
if ($item.price.unit_amount -ne $cents) { throw "Link $($link.id) has the wrong amount: $($item.price.unit_amount) cents." }
if ($item.price.recurring.interval -ne $Interval) { throw "Link $($link.id) bills every $($item.price.recurring.interval), not $Interval." }

Write-Output "Product:  $Name"
Write-Output ("Price:    `${0:N2} every {1} ({2})" -f ($item.price.unit_amount / 100), $item.price.recurring.interval, $price.id)
Write-Output "Methods:  $methods"
Write-Output "Trial:    $TrialDays days"
Write-Output "Active:   $($saved.active)"
Write-Output "Link id:  $($saved.id)"
Write-Output "URL:      $($saved.url)"
