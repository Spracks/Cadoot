<#
.SYNOPSIS
  Lets other devices on the local network reach the Cadoot server.

.DESCRIPTION
  Windows blocks inbound connections to Node by default. The prompt shown on
  first run only covers "Private" networks, so the moment Windows classifies
  your Wi-Fi as "Public" -- which it does for most new networks, and for many
  managed laptops after a policy refresh -- students can no longer connect.
  The failure is silent and misleading: http://localhost:3000 keeps working,
  because loopback traffic never touches the firewall.

  This adds one inbound rule, scoped to Node and to Cadoot's port, that applies
  on every network profile. Run it once per machine.

  Requires administrator rights; it re-launches itself elevated (one UAC
  prompt) if you started it as a normal user. Safe to re-run -- an existing
  rule with the same name is replaced, not duplicated.

.PARAMETER Port
  Port to open. Must match the PORT the server listens on. Default 3000.

.PARAMETER NodePath
  node.exe to scope the rule to. Resolved from PATH when omitted.

.PARAMETER Remove
  Delete the rule instead of creating it.

.PARAMETER DryRun
  Print what would happen and exit. Never elevates, never changes anything.

.EXAMPLE
  npm run setup:firewall

.EXAMPLE
  npm run setup:firewall -- -Port 8080

.EXAMPLE
  npm run setup:firewall -- -Remove
#>
param(
    [int]$Port = 3000,
    [string]$NodePath,
    [switch]$Remove,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$RuleName = "Cadoot Node TCP $Port"

function Test-Elevated {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Resolve node.exe before elevating, so the elevated pass is guaranteed to see
# the same interpreter this install actually uses.
if (-not $NodePath) {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) {
        $NodePath = $cmd.Source
    }
    elseif (Test-Path 'C:\Program Files\nodejs\node.exe') {
        $NodePath = 'C:\Program Files\nodejs\node.exe'
    }
    else {
        Write-Host 'ERROR: could not find node.exe on PATH.' -ForegroundColor Red
        Write-Host '       Pass it explicitly: -NodePath "C:\path\to\node.exe"'
        exit 1
    }
}

if (-not (Test-Path $NodePath)) {
    Write-Host "ERROR: no node.exe at $NodePath" -ForegroundColor Red
    exit 1
}

Write-Host ''
if ($Remove) {
    Write-Host "Cadoot firewall setup -- REMOVING rule" -ForegroundColor Cyan
}
else {
    Write-Host "Cadoot firewall setup" -ForegroundColor Cyan
}
Write-Host "  Rule name : $RuleName"
Write-Host "  Direction : Inbound / Allow"
Write-Host "  Protocol  : TCP port $Port"
Write-Host "  Program   : $NodePath"
Write-Host "  Profiles  : Any (Domain, Private and Public)"
Write-Host ''

if ($DryRun) {
    Write-Host 'Dry run -- nothing was changed.' -ForegroundColor Yellow
    $existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
    if ($Remove) {
        if ($existing) { Write-Host "A rule named '$RuleName' exists and would be removed." }
        else { Write-Host "No rule named '$RuleName' exists; nothing to remove." }
    }
    elseif ($existing) {
        Write-Host "A rule named '$RuleName' already exists and would be replaced."
    }
    else {
        Write-Host "No rule named '$RuleName' exists yet; it would be created."
    }
    Write-Host "Elevated: $(Test-Elevated)"
    exit 0
}

# Firewall changes need admin, so hand off to an elevated copy of ourselves.
# NOTE: Start-Process joins -ArgumentList with spaces and does NOT re-quote, so
# the script path must be quoted here or a path containing spaces breaks apart
# and PowerShell hangs on an unterminated argument.
if (-not (Test-Elevated)) {
    Write-Host 'Requesting administrator rights (approve the UAC prompt)...' -ForegroundColor Yellow
    $argList = @(
        '-NoProfile'
        '-ExecutionPolicy', 'Bypass'
        '-File', ('"' + $PSCommandPath + '"')
        '-Port', $Port
        '-NodePath', ('"' + $NodePath + '"')
    )
    if ($Remove) { $argList += '-Remove' }

    try {
        $proc = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru `
            -ArgumentList $argList
    }
    catch {
        Write-Host 'ERROR: elevation was declined or failed.' -ForegroundColor Red
        Write-Host '       Without it the rule cannot be created; students will not be'
        Write-Host '       able to reach this machine.'
        exit 1
    }
    exit $proc.ExitCode
}

try {
    $existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
    if ($existing) {
        Remove-NetFirewallRule -DisplayName $RuleName
        if ($Remove) {
            Write-Host "Removed '$RuleName'." -ForegroundColor Green
            exit 0
        }
        Write-Host 'Replaced the existing rule.'
    }
    elseif ($Remove) {
        Write-Host "No rule named '$RuleName' to remove." -ForegroundColor Yellow
        exit 0
    }

    New-NetFirewallRule `
        -DisplayName $RuleName `
        -Description "Allow inbound LAN connections to the Cadoot quiz server on TCP $Port." `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $Port `
        -Program $NodePath `
        -Profile Any `
        -Enabled True | Out-Null

    $rule = Get-NetFirewallRule -DisplayName $RuleName
    Write-Host ''
    Write-Host 'Done. Students on the same network can now reach this machine.' -ForegroundColor Green
    Write-Host "  Verified: Enabled=$($rule.Enabled) Action=$($rule.Action) Profile=$($rule.Profile)"
    Write-Host ''
    Write-Host 'Still to check: if students are on the Wi-Fi but STILL cannot connect,'
    Write-Host 'the network itself is probably blocking device-to-device traffic'
    Write-Host '(client / AP isolation). No firewall rule can fix that -- see the'
    Write-Host 'Networking section of README.md.'
    exit 0
}
catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
