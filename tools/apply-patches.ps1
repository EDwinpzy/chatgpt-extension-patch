# Builds the patched copy of the Edge "ChatGPT" / Codex browser extension.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\apply-patches.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\apply-patches.ps1 -Status
#
# The project folder itself IS the loadable extension: manifest.json, the
# extension's own files and the generated translate/ folder all sit next to
# src\, tools\, tests\ and mockups\. Point Edge at this folder directly.
#
# Three patches are applied to a fresh mirror of the store-installed extension:
#
#   1. Banner hide  - a local script wired into codex-sidepanel/index.html that
#                     hides the "You're out of Codex messages" upsell banner.
#   2. Translation  - translate/ files plus manifest wiring: a service-worker
#                     loader, an all-sites content script, an options page, and
#                     the clipboard permission.
#   3. Bookmarks    - bookmarks/ files plus the ported libs, loaded by the same
#                     service-worker loader and shown as a settings pane. The
#                     host manifest already asks for the bookmarks permission,
#                     so no permission changes are needed.
#   4. Network      - the manifest CSP only allowed the host's own endpoints, so
#                     every cloud translation request was refused. Its
#                     connect-src list gains the translation providers.
#
# src\, tools\, tests\, mockups\ and translation-plan.md are protected: they are
# excluded from the mirror and verified to exist before it runs.
#
# NOTE: keep this script ASCII-only. Windows PowerShell 5.1 reads .ps1 files
# using the ANSI code page, and non-ASCII bytes can corrupt parsing.

param(
    [switch]$Status,
    [string]$Source
)

$ErrorActionPreference = 'Stop'

$extensionId   = 'odlomjlbamekndcpllcnffbgeohgkmjh'
$projectRoot   = Split-Path -Parent $PSScriptRoot
$srcRoot       = Join-Path $projectRoot 'src'
$hiderSource   = Join-Path $srcRoot 'banner-hide.js'
$zhSource      = Join-Path $srcRoot 'panel-zh.js'
$summonSource  = Join-Path $srcRoot 'panel-summary.js'
$layoutSource  = Join-Path $srcRoot 'model-picker-layout.css'
$translateSrc  = Join-Path $srcRoot 'translate'
$bookmarksSrc  = Join-Path $srcRoot 'bookmarks'
$extensionRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data\Default\Extensions'
$marker        = '<!-- codex-banner-hide -->'
$scriptTags    = @('<script src="./banner-hide.js"></script>', '<script src="./panel-zh.js"></script>', '<script src="./panel-summary.js"></script>')
$scriptTag     = $scriptTags[0]
$layoutTag     = '<link rel="stylesheet" href="./model-picker-layout.css">'

# Appended to the manifest connect-src list. The three named hosts cover the
# built-in cloud presets; "https:" leaves custom OpenAI-compatible endpoints
# usable, and 127.0.0.1 / localhost are already listed by the host extension.
$cspAnchor     = 'https://api.openai.org;'
$cspExtra      = ' https://api.deepseek.com https://api.commandcode.ai https://opencode.ai https:'
$cspMarker     = 'https://api.deepseek.com'

# Never mirrored, never deleted.
$protectedDirs  = @('src', 'tools', 'tests', 'mockups', 'extension', 'translate', 'bookmarks')
$protectedFiles = @('translation-plan.md')

function Get-LatestSourceDir {
    $idDir = Join-Path $extensionRoot $extensionId
    if (-not (Test-Path -LiteralPath $idDir)) {
        throw ('The Edge ChatGPT extension is not installed at ' + $idDir)
    }
    $best = $null
    $bestVersion = $null
    foreach ($candidate in @(Get-ChildItem -LiteralPath $idDir -Directory)) {
        $manifestPath = Join-Path $candidate.FullName 'manifest.json'
        if (-not (Test-Path -LiteralPath $manifestPath)) { continue }
        try {
            $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        } catch {
            continue
        }
        $version = [string]$manifest.version
        if (-not $version) { continue }
        if ($null -eq $bestVersion -or [version]$version -gt [version]$bestVersion) {
            $best = $candidate.FullName
            $bestVersion = $version
        }
    }
    if (-not $best) {
        throw ('No readable manifest.json found under ' + $idDir)
    }
    return $best
}

function Show-Status {
    $manifestPath = Join-Path $projectRoot 'manifest.json'
    Write-Output '--- current state ---'
    Write-Output ('project / extension folder : ' + $projectRoot)
    Write-Output ('hider source               : ' + $hiderSource + '  [exists: ' + (Test-Path -LiteralPath $hiderSource) + ']')
        Write-Output ('translate source           : ' + $translateSrc + '  [exists: ' + (Test-Path -LiteralPath $translateSrc) + ']')
        Write-Output ('bookmarks source           : ' + $bookmarksSrc + '  [exists: ' + (Test-Path -LiteralPath $bookmarksSrc) + ']')
    if (Test-Path -LiteralPath $manifestPath) {
        $raw = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
        $manifest = $raw | ConvertFrom-Json
        Write-Output ('version                    : ' + $manifest.version)
        Write-Output ('service worker             : ' + $manifest.background.service_worker)
        Write-Output ('options page               : ' + $manifest.options_ui.page)
        $policy = [string]$manifest.content_security_policy.extension_pages
        Write-Output ('cloud hosts allowed        : ' + $policy.Contains($cspMarker))
        Write-Output ('translate folder present   : ' + (Test-Path -LiteralPath (Join-Path $projectRoot 'translate')))
        $panelHtml = Join-Path $projectRoot 'codex-sidepanel\index.html'
        $wired = 0
        if (Test-Path -LiteralPath $panelHtml) {
            $panelRaw = Get-Content -LiteralPath $panelHtml -Raw -Encoding UTF8
            foreach ($tag in $scriptTags) { if ($panelRaw.Contains($tag)) { $wired++ } }
        }
        Write-Output ('panel scripts wired        : ' + $wired + ' / ' + $scriptTags.Count)
    } else {
        Write-Output 'manifest.json not present; not built yet'
    }
    Write-Output '--- installed store versions ---'
    $idDir = Join-Path $extensionRoot $extensionId
    if (Test-Path -LiteralPath $idDir) {
        Get-ChildItem -LiteralPath $idDir -Directory | ForEach-Object { Write-Output ('  ' + $_.Name) }
    } else {
        Write-Output '  extension not installed'
    }
}

function Assert-ProtectedPaths {
    foreach ($name in $protectedDirs) {
        $path = Join-Path $projectRoot $name
        # Generated folders: created by the patches below, not required to exist.
        if ($name -eq 'extension' -or $name -eq 'translate' -or $name -eq 'bookmarks') { continue }
        if (-not (Test-Path -LiteralPath $path)) {
            throw ('protected path is missing, refusing to mirror: ' + $path)
        }
    }
    foreach ($name in $protectedFiles) {
        $path = Join-Path $projectRoot $name
        if (-not (Test-Path -LiteralPath $path)) {
            throw ('protected file is missing, refusing to mirror: ' + $path)
        }
    }
}

function Sync-Extension([string]$From) {
    Assert-ProtectedPaths

    # Earlier builds wrote the loadable copy into a nested extension\ folder.
    # The project folder is the extension now, so that leftover is removed.
    $legacy = Join-Path $projectRoot 'extension'
    if (Test-Path -LiteralPath $legacy) {
        $resolvedLegacy = (Resolve-Path -LiteralPath $legacy).Path
        if ((Split-Path -Leaf $resolvedLegacy) -eq 'extension' -and
            $resolvedLegacy.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $resolvedLegacy -Recurse -Force
            Write-Output '  removed the previous nested extension\ folder'
        }
    }

    $excludedDirs = @()
    foreach ($name in $protectedDirs) {
        $excludedDirs += (Join-Path $projectRoot $name)
    }
    $excludedFiles = @()
    foreach ($name in $protectedFiles) {
        $excludedFiles += (Join-Path $projectRoot $name)
    }

    $arguments = @($From, $projectRoot, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XD') +
        $excludedDirs + @('/XF') + $excludedFiles
    $output = & robocopy @arguments 2>&1
    if ($LASTEXITCODE -ge 8) {
        $output | Write-Output
        throw ('robocopy failed with exit code ' + $LASTEXITCODE)
    }
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $utf8NoBom)
}

function Apply-PanelPatch {
    $panelDir = Join-Path $projectRoot 'codex-sidepanel'
    if (-not (Test-Path -LiteralPath $panelDir)) {
        throw ('codex-sidepanel not found under ' + $projectRoot)
    }

    $metadataDir = Join-Path $projectRoot '_metadata'
    if (Test-Path -LiteralPath $metadataDir) {
        Remove-Item -LiteralPath $metadataDir -Recurse -Force
    }

    Copy-Item -LiteralPath $hiderSource -Destination (Join-Path $panelDir 'banner-hide.js') -Force
    Copy-Item -LiteralPath $zhSource -Destination (Join-Path $panelDir 'panel-zh.js') -Force
    Copy-Item -LiteralPath $summonSource -Destination (Join-Path $panelDir 'panel-summary.js') -Force
    Copy-Item -LiteralPath $layoutSource -Destination (Join-Path $panelDir 'model-picker-layout.css') -Force

    $htmlPath = Join-Path $panelDir 'index.html'
    $html = Get-Content -LiteralPath $htmlPath -Raw -Encoding UTF8
    $missingScripts = @()
    foreach ($tag in $scriptTags) {
        if (-not $html.Contains($tag)) { $missingScripts += $tag }
    }
    $missingLayout = -not $html.Contains($layoutTag)
    if ($missingScripts.Count -eq 0 -and -not $missingLayout) { return 'panel: already wired' }
    $index = $html.IndexOf('<script type="module"', [StringComparison]::Ordinal)
    if ($index -lt 0) {
        throw ('could not find the module script tag in ' + $htmlPath)
    }
    $insert = $marker + [Environment]::NewLine
    if ($missingLayout) { $insert += '    ' + $layoutTag + [Environment]::NewLine }
    foreach ($tag in $missingScripts) {
        $insert += '    ' + $tag + [Environment]::NewLine
    }
    $html = $html.Substring(0, $index) + $insert + '    ' + $html.Substring($index)
    Write-Utf8NoBom -Path $htmlPath -Text $html
    return 'panel: wired index.html'
}

function Apply-TranslatePatch {
    $target = Join-Path $projectRoot 'translate'
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
    Copy-Item -LiteralPath $translateSrc -Destination $target -Recurse -Force

    $manifestPath = Join-Path $projectRoot 'manifest.json'
    $raw = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
    $original = $raw

    # 1. Route the service worker through our loader.
    $raw = $raw.Replace('"service_worker": "background.js"', '"service_worker": "translate/background-loader.js"')

    # 2. Register the all-sites content script, keeping chatgpt.com out.
    if (-not $raw.Contains('translate/content.js')) {
        $contentEntry = @(
            '{',
            '      "matches": [ "http://*/*", "https://*/*" ],',
            '      "exclude_matches": [ "https://chatgpt.com/*" ],',
            '      "js": [ "translate/content.js", "translate/subtitle.js", "translate/summary.js" ],',
            '      "run_at": "document_idle",',
            '      "all_frames": false',
            '   }, {'
        ) -join [Environment]::NewLine
        $raw = $raw.Replace('"content_scripts": [ {', '"content_scripts": [ ' + $contentEntry)
    }

    # 3. Options page and the clipboard permission.
    if (-not $raw.Contains('"options_ui"')) {
        $optionsBlock = @(
            '"options_ui": {',
            '      "page": "translate/options.html",',
            '      "open_in_tab": true',
            '   },',
            '   "permissions": ['
        ) -join [Environment]::NewLine
        $raw = $raw.Replace('"permissions": [', $optionsBlock)
    }
    if (-not $raw.Contains('"clipboardWrite"')) {
        $raw = $raw.Replace('"permissions": [ "alarms"', '"permissions": [ "clipboardWrite", "alarms"')
    }

    if ($raw -eq $original) {
        throw 'manifest.json was not modified; the expected anchors were not found'
    }

    # Validate before writing: a broken manifest bricks the whole extension.
    $parsed = $raw | ConvertFrom-Json
    if ($parsed.background.service_worker -ne 'translate/background-loader.js') {
        throw 'manifest patch did not reach the service worker entry'
    }
    Write-Utf8NoBom -Path $manifestPath -Text $raw
    return 'translate: files and manifest'
}

function Apply-BookmarksPatch {
    $target = Join-Path $projectRoot 'bookmarks'
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
    Copy-Item -LiteralPath $bookmarksSrc -Destination $target -Recurse -Force
    return 'bookmarks: files'
}

function Apply-NetworkPatch {
    $manifestPath = Join-Path $projectRoot 'manifest.json'
    $raw = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
    if ($raw.Contains($cspMarker)) { return 'network: already allowed' }
    if (-not $raw.Contains($cspAnchor)) {
        throw 'connect-src anchor not found in manifest.json; refusing to guess'
    }
    $raw = $raw.Replace($cspAnchor, ('https://api.openai.org' + $cspExtra + ';'))
    $parsed = $raw | ConvertFrom-Json
    $policy = [string]$parsed.content_security_policy.extension_pages
    if (-not $policy.Contains($cspMarker)) {
        throw 'connect-src patch did not land in the extension policy'
    }
    Write-Utf8NoBom -Path $manifestPath -Text $raw
    return 'network: connect-src widened'
}

if ($Status) {
    Show-Status
    return
}

foreach ($required in @(
    $hiderSource,
    $zhSource,
    $summonSource,
    $layoutSource,
    (Join-Path $translateSrc 'engine.js'),
    (Join-Path $translateSrc 'content.js'),
    (Join-Path $translateSrc 'subtitle.js'),
    (Join-Path $translateSrc 'summary.js'),
    (Join-Path $translateSrc 'settings.js'),
    (Join-Path $translateSrc 'options.html'),
    (Join-Path $bookmarksSrc 'worker.js'),
    (Join-Path $bookmarksSrc 'panel.js'),
    (Join-Path $bookmarksSrc 'panel.css'),
    (Join-Path $bookmarksSrc 'lib\classifier.js'),
    (Join-Path $bookmarksSrc 'lib\deduplicator.js'),
    (Join-Path $bookmarksSrc 'lib\bookmark-utils.js')
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw ('Missing ' + $required)
    }
}

if (-not $Source) {
    $Source = Get-LatestSourceDir
}

Write-Output ('source  : ' + $Source)
Write-Output ('target  : ' + $projectRoot)
Sync-Extension -From $Source
Write-Output ('  ' + (Apply-PanelPatch))
Write-Output ('  ' + (Apply-TranslatePatch))
Write-Output ('  ' + (Apply-BookmarksPatch))
Write-Output ('  ' + (Apply-NetworkPatch))

$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Output ('version : ' + $manifest.version)
Write-Output ''
Write-Output 'Done. In Edge:'
Write-Output '  edge://extensions -> Developer mode -> remove the old unpacked entry ->'
Write-Output '  "Load unpacked" -> pick this folder:'
Write-Output ('    ' + $projectRoot)
