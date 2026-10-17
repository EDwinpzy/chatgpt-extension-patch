# Builds the patched copy of the Edge "ChatGPT" / Codex browser extension.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\apply-patches.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\apply-patches.ps1 -Status
#
# The project folder itself IS the loadable extension: manifest.json, the
# extension's own files and the generated translate/ folder all sit next to
# src\, tools\, tests\ and mockups\. Point Edge at this folder directly.
#
# Six patches are applied to a fresh mirror of the store-installed extension:
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
#   5. Frame        - the work side panel loads https://chatgpt.com/ in an
#                     iframe. chatgpt.com sends X-Frame-Options: SAMEORIGIN and
#                     a CSP frame-ancestors list that only names the two store
#                     extension ids, so a patched build shows the browser's
#                     "refused to connect" page inside the panel. A static
#                     declarativeNetRequest rule set strips those two response
#                     headers for sub_frame loads of chatgpt.com and
#                     auth.openai.com. Nothing else is touched: extension_pages
#                     CSP, permissions and every other patch stay as they are.
#   6. Panel site   - the same iframe means the panel features wired into
#                     index.html (banner hide, Chinese localisation, summary)
#                     never run on the embedded page. Those three scripts are
#                     registered as an all-frames content script for
#                     chatgpt.com, so the embedded site keeps them too.
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
$translateSrc  = Join-Path $srcRoot 'translate'
$bookmarksSrc  = Join-Path $srcRoot 'bookmarks'
$frameRuleSrc  = Join-Path $srcRoot 'frame\chatgpt-frame.json'
$extensionRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data\Default\Extensions'
$marker        = '<!-- codex-banner-hide -->'
$scriptTags    = @('<script src="./banner-hide.js"></script>', '<script src="./panel-zh.js"></script>', '<script src="./panel-summary.js"></script>')
$scriptTag     = $scriptTags[0]

# Appended to the manifest connect-src list. Scheme sources cover every host the
# user may point a model at, including local servers on a LAN address or any
# custom OpenAI-compatible endpoint; the named hosts keep the built-in presets
# readable in the policy.
$cspAnchor     = 'https://api.openai.org;'
$cspExtra      = ' https://api.deepseek.com https://api.commandcode.ai https://opencode.ai http: https: ws: wss:'
$cspMarker     = 'https://api.deepseek.com'

# Never mirrored, never deleted. rules\ and .workbuddy-ai\ are generated or
# local-only; without them here the mirror pass would wipe the rule set and the
# workspace notes.
$protectedDirs  = @('src', 'tools', 'tests', 'mockups', 'extension', 'translate', 'bookmarks', 'rules', '.workbuddy-ai')
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
        $dnr = $manifest.declarative_net_request.rule_resources
        Write-Output ('iframe rule set            : ' + [bool]$dnr)
        Write-Output ('iframe rules present       : ' + (Test-Path -LiteralPath (Join-Path $projectRoot 'rules\chatgpt-frame.json')))
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
        if ($name -eq 'extension' -or $name -eq 'translate' -or $name -eq 'bookmarks' -or $name -eq 'rules' -or $name -eq '.workbuddy-ai') { continue }
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

    $htmlPath = Join-Path $panelDir 'index.html'
    $html = Get-Content -LiteralPath $htmlPath -Raw -Encoding UTF8
    $missing = @()
    foreach ($tag in $scriptTags) {
        if (-not $html.Contains($tag)) { $missing += $tag }
    }
    if ($missing.Count -eq 0) { return 'panel: already wired' }
    $index = $html.IndexOf('<script type="module"', [StringComparison]::Ordinal)
    if ($index -lt 0) {
        throw ('could not find the module script tag in ' + $htmlPath)
    }
    $insert = $marker + [Environment]::NewLine
    foreach ($tag in $scriptTags) {
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

function Apply-FramePatch {
    $rulesDir = Join-Path $projectRoot 'rules'
    if (-not (Test-Path -LiteralPath $rulesDir)) {
        New-Item -ItemType Directory -Path $rulesDir | Out-Null
    }
    Copy-Item -LiteralPath $frameRuleSrc -Destination (Join-Path $rulesDir 'chatgpt-frame.json') -Force

    $manifestPath = Join-Path $projectRoot 'manifest.json'
    $raw = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
    if ($raw.Contains('"declarative_net_request"')) { return 'frame: already wired' }
    $anchor = '"host_permissions"'
    if (-not $raw.Contains($anchor)) {
        throw 'host_permissions anchor not found in manifest.json; refusing to guess'
    }
    $block = @(
        '   "declarative_net_request": {',
        '      "rule_resources": [ {',
        '         "enabled": true,',
        '         "id": "chatgpt-frame",',
        '         "path": "rules/chatgpt-frame.json"',
        '      } ]',
        '   },',
        '   "host_permissions"'
    ) -join [Environment]::NewLine
    $raw = $raw.Replace($anchor, $block)
    $parsed = $raw | ConvertFrom-Json
    if (-not $parsed.declarative_net_request.rule_resources) {
        throw 'frame patch did not land in the manifest'
    }
    Write-Utf8NoBom -Path $manifestPath -Text $raw
    return 'frame: iframe headers stripped'
}

function Apply-PanelSitePatch {
    # The work side panel embeds the live chatgpt.com page in an iframe, so the
    # localisation / summary / banner-hide scripts wired into index.html never
    # run there. Register the same three files as an all-frames content script
    # for chatgpt.com so the embedded page keeps every panel feature.
    $manifestPath = Join-Path $projectRoot 'manifest.json'
    $raw = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
    if ($raw.Contains('"codex-sidepanel/panel-zh.js"')) { return 'panel-site: already wired' }

    $pattern = '\},\s*\{\s*"all_frames":\s*true,\s*"js":\s*\[\s*"content-scripts/codex-work-media-permission\.js"'
    if (-not [regex]::IsMatch($raw, $pattern)) {
        throw 'media-permission content script anchor not found in manifest.json; refusing to guess'
    }
    $nl = "`r`n"
    if (-not $raw.Contains($nl)) { $nl = "`n" }
    $entry = @(
        '}, {',
        '      "all_frames": true,',
        '      "js": [ "codex-sidepanel/banner-hide.js", "codex-sidepanel/panel-zh.js", "codex-sidepanel/panel-summary.js" ],',
        '      "matches": [ "https://chatgpt.com/*" ],',
        '      "run_at": "document_idle"',
        '   }, {',
        '      "all_frames": true,',
        '      "js": [ "content-scripts/codex-work-media-permission.js"'
    ) -join $nl
    $raw = [regex]::Replace($raw, $pattern, $entry)
    $parsed = $raw | ConvertFrom-Json
    $hit = @($parsed.content_scripts | Where-Object { $_.js -contains 'codex-sidepanel/panel-zh.js' })
    if ($hit.Count -ne 1) {
        throw 'panel-site patch did not land in the manifest'
    }
    Write-Utf8NoBom -Path $manifestPath -Text $raw
    return 'panel-site: panel features on chatgpt.com'
}

if ($Status) {
    Show-Status
    return
}

foreach ($required in @(
    $hiderSource,
    $zhSource,
    $summonSource,
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
    (Join-Path $bookmarksSrc 'lib\bookmark-utils.js'),
    $frameRuleSrc
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
Write-Output ('  ' + (Apply-FramePatch))
Write-Output ('  ' + (Apply-PanelSitePatch))

$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Output ('version : ' + $manifest.version)
Write-Output ''
Write-Output 'Done. In Edge:'
Write-Output '  edge://extensions -> Developer mode -> remove the old unpacked entry ->'
Write-Output '  "Load unpacked" -> pick this folder:'
Write-Output ('    ' + $projectRoot)
