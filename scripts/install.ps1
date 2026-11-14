param(
  [string]$RuntimeRoot,
  [switch]$SkipPluginInstall
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not $RuntimeRoot) { $RuntimeRoot = [IO.Path]::GetFullPath((Join-Path $ProjectRoot '..\..\work\aegis-runtime')) }
$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$StateDir = Join-Path $RuntimeRoot 'state'
$WorkspaceDir = Join-Path $RuntimeRoot 'workspace'
New-Item -ItemType Directory -Force -Path $StateDir,$WorkspaceDir | Out-Null
Copy-Item -Path (Join-Path $ProjectRoot 'agent\*') -Destination $WorkspaceDir -Recurse -Force
if (-not (Test-Path -LiteralPath (Join-Path $StateDir 'identity.json'))) {
  & node (Join-Path $PSScriptRoot 'owner.mjs') init --state $StateDir
  if ($LASTEXITCODE -ne 0) { throw 'Aegis initialization failed.' }
}
$ConfigPath = (openclaw config file).Trim()
if ($ConfigPath.StartsWith('~')) { $ConfigPath = $ConfigPath.Replace('~',$env:USERPROFILE) }
$ExistingConfig = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ($ExistingConfig.agents.entries.aegis -and $ExistingConfig.agents.entries.aegis.workspace -ne $WorkspaceDir) {
  throw 'Another Aegis instance already exists. Refusing to replace its identity.'
}
$Model = $ExistingConfig.agents.defaults.model.primary
if (-not $Model) { throw 'Configure an OpenClaw model first.' }
$ToolNames = @('read','web_search','web_fetch','sessions_spawn','sessions_yield','subagents','session_status','aegis_portfolio','aegis_market','aegis_analysis','aegis_memory','aegis_skill_lab')
$SkillNames = @('aegis-research','aegis-quant','aegis-prediction-markets','aegis-macro-banking','aegis-learning','aegis-learned')
$Patch = @{
  agents = @{ entries = @{ aegis = @{
    name = 'Aegis'; workspace = $WorkspaceDir; agentDir = (Join-Path $RuntimeRoot 'openclaw-agent'); model = $Model
    models = @{ $Model = @{ agentRuntime = @{ id = 'openclaw' } } }
    tools = @{ profile = 'full'; allow = $ToolNames; codeMode = $false; fs = @{ workspaceOnly = $true }; loopDetection = @{ enabled = $true } }
    subagents = @{ allowAgents = @('aegis'); delegationMode = 'suggest'; requireAgentId = $true }
    skills = $SkillNames
  } } }
  plugins = @{ entries = @{ 'aegis-control' = @{ enabled = $true; hooks = @{ allowConversationAccess = $true }; config = @{ stateDir = $StateDir; workspace = $WorkspaceDir } } } }
}
$PatchPath = Join-Path $RuntimeRoot 'openclaw.patch.json'
$Patch | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $PatchPath -Encoding utf8
if (-not $SkipPluginInstall) {
  # --force acknowledges this reviewed local source; it does not bypass install-policy blocks.
  & openclaw plugins install --link --force --accept-capabilities $ProjectRoot
  if ($LASTEXITCODE -ne 0) { throw 'OpenClaw plugin installation failed; runtime has not been reset.' }
}
& openclaw config patch --file $PatchPath
if ($LASTEXITCODE -ne 0) { throw 'OpenClaw configuration validation failed.' }
& openclaw config validate
if ($LASTEXITCODE -ne 0) { throw 'Configuration invalid.' }
Write-Output "Aegis configured. Runtime: $RuntimeRoot"
Write-Output 'Reload/restart the Gateway to load the plugin, then perform a smoke test before scheduling research.'
