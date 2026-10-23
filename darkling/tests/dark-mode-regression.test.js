const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const contentScriptPath = path.join(__dirname, "..", "js", "content.js");
const contentScript = fs.readFileSync(contentScriptPath, "utf8");
const backgroundScript = fs.readFileSync(path.join(__dirname, "..", "js", "background.js"), "utf8");

test("bundles still compile", () => {
    assert.doesNotThrow(() => new vm.Script(contentScript, { filename: "content.js" }));
    assert.doesNotThrow(() => new vm.Script(backgroundScript, { filename: "background.js" }));
});

test("top-level pages are not treated as iframes", () => {
    assert.match(
        contentScript,
        /const h = window\.top !== window;\s*\(0, l\.createOrUpdateDynamicTheme\)/,
        "A top-level page must pass isIFrame=false so html/body receive a dark background."
    );
    assert.doesNotMatch(
        contentScript,
        /const h = window\.top === window;\s*\(0, l\.createOrUpdateDynamicTheme\)/,
        "The reversed check recreates white page surfaces with light text."
    );
});

test("non-iframe documents retain an explicit root background fallback", () => {
    assert.match(
        contentScript,
        /function P\(D, h, z\)[\s\S]*?if \(!h\) j\.push\("html \{"\), j\.push\(`    background-color:[\s\S]*?!important;`\)/,
        "The dynamic theme must paint the root canvas when the website does not declare a usable background."
    );
});

test("rule iteration descends into @layer, @container, @scope and nested rules", () => {
    assert.match(contentScript, /if \(D\.selectorText\) \{\s*h\(D\);[\s\S]*?if \(D\.cssRules && D\.cssRules\.length > 0\) A\(D\.cssRules, h, z\);/,
        "Nested child rules of a style rule must be visited.");
    assert.match(contentScript, /D instanceof CSSNestedDeclarations\) \{[\s\S]*?selectorText: "&"/,
        "Declarations that follow nested rules must be attributed to the parent selector.");
    assert.match(contentScript, /D instanceof CSSContainerRule\) \{\s*\/\/[^\n]*\n\s*A\(D\.cssRules, h, z\);/,
        "@container blocks must be descended without CSS.supports().");
    assert.match(contentScript, /else if \(D\.cssRules\) \{\s*\/\/ @layer, @scope, @starting-style[\s\S]*?A\(D\.cssRules, h, z\);/,
        "@layer blocks (Tailwind v4 and most modern design systems) must not be skipped.");
});

test("rule cache keys include the whole ancestor chain", () => {
    assert.match(contentScript, /for \(let h = D\.parentRule; h; h = h\.parentRule\) j \+= `;\$\{h\.media \? h\.media\.mediaText : h\.conditionText \|\| h\.selectorText \|\| h\.name \|\| h\.start \|\| ""\}`;\s*J\.delete\(j\);/);
});

test("override sheet recreates grouping rules instead of flattening them", () => {
    assert.match(contentScript, /return F\(`@container \$\{z\.conditionText\} \{\}`\)/);
    assert.match(contentScript, /return F\(`@supports \$\{z\.conditionText\} \{\}`\)/);
    assert.match(contentScript, /return F\(`@scope\$\{z\.start \? ` \(\$\{z\.start\}\)` : ""\}\$\{z\.end \? ` to \(\$\{z\.end\}\)` : ""\} \{\}`\)/);
    assert.match(contentScript, /return F\("@starting-style \{\}"\)/);
    assert.match(contentScript, /if \(z instanceof CSSStyleRule\) return F\(`\$\{z\.selectorText\} \{\}`\)/,
        "Nested rules need their parent so relative selectors stay valid.");
    assert.match(contentScript, /z instanceof CSSLayerBlockRule && z\.name\) return F\(`@layer \$\{z\.name\} \{\}`\)/,
        "Overrides must join the original layer by name: !important declarations reverse the layer order, so an unlayered override would lose.");
    assert.match(contentScript, /\/\/ Anonymous @layer blocks cannot be re-joined and are flattened into the parent\.\s*return h;/);
});

test("user-agent sheet sits in the first cascade layer", () => {
    assert.ok(contentScript.includes("h.textContent = `@layer ${K.MISC_PREFIX}-ua {\\n${(0, l.getModifiedUserAgentStyle)(v, G, v.styleSystemControls)}\\n}`"),
        "Without a layer the engine's default a/body colours would beat layered site rules such as Tailwind's `a { color: inherit }`.");
});

test("colour parser resolves modern colour functions through the browser", () => {
    const has = (snippet, message) => assert.ok(contentScript.includes(snippet), message || `missing: ${snippet}`);
    has('const modernColorFunction = /^(?:oklch|oklab|lab|lch|hwb|color|color-mix|light-dark|rgba?|hsla?)\\(/');
    has('relativeColor = /^[a-z-]+\\(\\s*from\\s/');
    has("canvasContext.getImageData(0, 0, 1, 1).data",
        "Pixels must be read back: the fillStyle getter keeps non-sRGB colours in their own colour space.");
    has('if (modernColorFunction.test(h) && !h.includes("var(")) return resolveColorWithBrowser(h);');
    has('if (relativeColor.test(h)) return h.includes("var(") ? null : resolveColorWithBrowser(h);');
});

test("gradient text is lightened instead of darkened", () => {
    assert.match(contentScript, /stopModifier = clipsToText \? A\.modifyForegroundColor : A\.modifyGradientColor/);
    assert.match(contentScript, /D\.style\.backgroundClip === "text" \|\| D\.style\.webkitBackgroundClip === "text"/);
    assert.match(contentScript, /getComputedStyle\(D\.element\)\.webkitBackgroundClip === "text"/);
    assert.match(contentScript, /style: D\.style,\s*element: D\s*\}, A\.variablesStore/,
        "Inline-style overrides must hand the element over so computed background-clip can be checked.");
    assert.doesNotMatch(contentScript, /\(0, A\.modifyGradientColor\)\(h, /, "All gradient stops must go through the clip-aware modifier.");
});

test("top-level pages verify darkness and fall back to the filter mode", () => {
    assert.match(contentScript, /const h = window\.top !== window;\s*\(0, l\.createOrUpdateDynamicTheme\)\(F\.DEFAULT_THEME, D, h\);[\s\S]*?if \(!h\) startDarknessGuard\(\);/);
    assert.match(contentScript, /if \(l >= 20 && j \/ l > \.5\) \{[\s\S]*?if \(fp !== lastFp\) h = 0; else h\+\+;\s*\} else h = 0;\s*lastFp = fp;\s*if \(h >= 2\) return escalateToFilterFallback\(\);/,
        "Two consecutive light readings are required, and engine progress (growing injected styles) resets the strikes.");
    assert.match(contentScript, /html \{ filter: invert\(1\) hue-rotate\(180deg\) !important; background-color: #fff !important; \}/);
    assert.match(contentScript, /img, video, canvas \{ filter: invert\(1\) hue-rotate\(180deg\) !important; \}/);
    assert.match(contentScript, /=== "cleanStyle"\) removeFilterFallback\(\), \(0, l\.removeDynamicTheme\)\(\);/,
        "Disabling the extension must also remove the filter fallback.");
    assert.match(contentScript, /guardCanvas\.getImageData\(0, 0, 1, 1\)\.data/, "The guard must read oklch()/color() computed backgrounds correctly.");
});

test("background acknowledges CS_FETCH so the sender promise settles", () => {
    assert.match(backgroundScript, /try \{ z\(\{ received: true \}\); \} catch \(ackError\) \{\}/);
});
