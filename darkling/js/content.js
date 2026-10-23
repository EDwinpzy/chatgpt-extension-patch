(function() {
    function D(h, z, j) {
        function F(Z, A) {
            if (!z[Z]) {
                if (!h[Z]) {
                    var q = "function" == typeof require && require;
                    if (!A && q) return q(Z, !0);
                    if (l) return l(Z, !0);
                    var Q = new Error("Cannot find module '" + Z + "'");
                    throw Q.code = "MODULE_NOT_FOUND", Q;
                }
                var I = z[Z] = {
                    exports: {}
                };
                h[Z][0].call(I.exports, (function(D) {
                    var z = h[Z][1][D];
                    return F(z || D);
                }), I, I.exports, D, h, z, j);
            }
            return z[Z].exports;
        }
        for (var l = "function" == typeof require && require, Z = 0; Z < j.length; Z++) F(j[Z]);
        return F;
    }
    return D;
})()({
    1: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), D("1p");
    }, {
        "1p": 3
    } ],
    2: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.IMG_FILTER_ID = z.MSG_CLEANUP = z.ROOT_VARS_PREFIX = z.META_PROPERTY = z.STYLESHEET_COMMON_CLASSNAME = z.PROXY_SELECTOR = z.EVENT_PREFIX = z.STYLESHEET_CORS_SELECTOR = z.STYLESHEET_SYNC_SELECTOR = z.STYLESHEET_ROOT_VARS_SELECTOR = z.STYLESHEET_INLINE_SELECTOR = z.STYLESHEET_OVERRIDE_SELECTOR = z.STYLESHEET_VARIABLES_SELECTOR = z.STYLESHEET_INVERT_SELECTOR = z.STYLESHEET_TEXT_SELECTOR = z.STYLESHEET_USER_AGENT_SELECTOR = z.STYLESHEET_FALLBACK_SELECTOR = z.MISC_PREFIX = void 0;
        const j = D("TD");
        z.MISC_PREFIX = j.PREFIX, z.STYLESHEET_FALLBACK_SELECTOR = `.${j.PREFIX}-fb`, z.STYLESHEET_USER_AGENT_SELECTOR = `.${j.PREFIX}-ua`,
        z.STYLESHEET_TEXT_SELECTOR = `.${j.PREFIX}-tx`, z.STYLESHEET_INVERT_SELECTOR = `.${j.PREFIX}-iv`,
        z.STYLESHEET_VARIABLES_SELECTOR = `.${j.PREFIX}-vb`, z.STYLESHEET_OVERRIDE_SELECTOR = `.${j.PREFIX}-or`,
        z.STYLESHEET_INLINE_SELECTOR = `.${j.PREFIX}-il`, z.STYLESHEET_ROOT_VARS_SELECTOR = `.${j.PREFIX}-rv`,
        z.STYLESHEET_SYNC_SELECTOR = `.${j.PREFIX}-sn`, z.STYLESHEET_CORS_SELECTOR = `.${j.PREFIX}-cr`,
        z.EVENT_PREFIX = `__${j.PREFIX}__`, z.PROXY_SELECTOR = `.${j.PREFIX}-pr`, z.STYLESHEET_COMMON_CLASSNAME = `${j.PREFIX}m2`,
        z.META_PROPERTY = j.PREFIX, z.ROOT_VARS_PREFIX = j.PREFIX, z.MSG_CLEANUP = z.EVENT_PREFIX + "cleanUp",
        z.IMG_FILTER_ID = `${j.PREFIX}-image-filter`;
    }, {
        TD: 30
    } ],
    3: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        });
        const j = D("Dk"), F = D("k8"), l = D("rV"), Z = D("4o");
        const FILTER_FALLBACK_ID = "darkling-filter-fallback", FILTER_FALLBACK_ATTR = "data-darkling-filter";
        let guardTimer = null, guardCanvas = null, guardRouteWatcher = null;
        function removeFilterFallback() {
            if (guardTimer) clearTimeout(guardTimer), guardTimer = null;
            if (guardRouteWatcher) clearInterval(guardRouteWatcher), guardRouteWatcher = null;
            (0, Z.removeNode)(document.getElementById(FILTER_FALLBACK_ID));
            document.documentElement.removeAttribute(FILTER_FALLBACK_ATTR);
        }
        // Reads a computed colour. Legacy rgb()/rgba() strings are parsed directly; anything else
        // (oklch(), color(srgb ...), lab()...) is rasterised through a 1x1 canvas to get sRGB values.
        function readComputedColor(D) {
            const h = /^rgba?\(([^)]+)\)$/.exec(D || "");
            if (h) {
                const z = h[1].split(/[\s,\/]+/).map(parseFloat);
                return {
                    r: z[0],
                    g: z[1],
                    b: z[2],
                    a: z.length > 3 ? z[3] : 1
                };
            }
            if (!D || D === "transparent") return null;
            try {
                if (guardCanvas === null) {
                    const D = document.createElement("canvas");
                    D.width = D.height = 1, guardCanvas = D.getContext && D.getContext("2d", {
                        willReadFrequently: true
                    }) || false;
                }
                if (!guardCanvas) return null;
                guardCanvas.clearRect(0, 0, 1, 1), guardCanvas.fillStyle = "rgba(0,0,0,0)", guardCanvas.fillStyle = D,
                guardCanvas.fillRect(0, 0, 1, 1);
                const z = guardCanvas.getImageData(0, 0, 1, 1).data;
                return {
                    r: z[0],
                    g: z[1],
                    b: z[2],
                    a: z[3] / 255
                };
            } catch (D) {
                return null;
            }
        }
        // Samples the viewport on a grid and counts how many points still paint a light
        // background after the dynamic theme has had time to settle.
        function measureViewportLightness() {
            const luminance = ({r: D, g: h, b: z}) => {
                const j = D => (D /= 255, D <= .03928 ? D / 12.92 : Math.pow((D + .055) / 1.055, 2.4));
                return .2126 * j(D) + .7152 * j(h) + .0722 * j(z);
            }, parse = readComputedColor, skip = new Set([ "IMG", "VIDEO", "CANVAS", "SVG", "PICTURE", "IFRAME", "EMBED", "OBJECT" ]), rootBg = parse(getComputedStyle(document.documentElement).backgroundColor), grid = 10;
            let light = 0, dark = 0;
            for (let D = 0; D < grid; D++) for (let h = 0; h < grid; h++) {
                const z = document.elementFromPoint(Math.floor((D + .5) * innerWidth / grid), Math.floor((h + .5) * innerHeight / grid));
                // Bare canvas (the root element itself) says nothing about the site's own surfaces.
                if (!z || z === document.documentElement || skip.has(z.tagName) || z.closest("svg")) continue;
                let j = null, F = false;
                for (let D = z; D && !F; D = D.parentElement) {
                    const h = getComputedStyle(D), z = parse(h.backgroundColor);
                    if (z && z.a > .5) j = z, F = true; else if (h.backgroundImage && h.backgroundImage !== "none") F = true;
                }
                if (!j && !F) j = rootBg && rootBg.a > 0 ? rootBg : null;
                if (!j) continue;
                if (luminance(j) > .5) light++; else dark++;
            }
            return {
                light: light,
                dark: dark
            };
        }
        function escalateToFilterFallback() {
            console.log("[Darkling Content] Dynamic theme left the page light, switching to filter fallback");
            (0, l.removeDynamicTheme)();
            const D = document.createElement("style");
            D.id = FILTER_FALLBACK_ID, D.textContent = [ "html { filter: invert(1) hue-rotate(180deg) !important; background-color: #fff !important; }", "img, video, canvas { filter: invert(1) hue-rotate(180deg) !important; }" ].join("\n"),
            (document.head || document.documentElement).appendChild(D), document.documentElement.setAttribute(FILTER_FALLBACK_ATTR, "");
        }
        // Verifies that the dynamic theme actually darkened the page. Two consecutive light
        // readings mean the engine could not handle this site's CSS, so the filter takes over.
        function startDarknessGuard() {
            const arm = () => {
                let D = 0, h = 0, lastFp = -1;
                const engineFingerprint = () => {
                    let F = 0;
                    return document.querySelectorAll("style.dmm2").forEach((style => {
                        F += style.textContent.length;
                        try {
                            F += style.sheet.cssRules.length;
                        } catch (D) {}
                    })), F;
                };
                const z = () => {
                    guardTimer = null;
                    if (document.documentElement.hasAttribute(FILTER_FALLBACK_ATTR)) return;
                    if (document.visibilityState !== "visible" || !document.body) {
                        if (++D < 40) guardTimer = setTimeout(z, 1e3);
                        return;
                    }
                    const {light: j, dark: F} = measureViewportLightness(), l = j + F, fp = engineFingerprint();
                    if (l >= 20 && j / l > .5) {
                        // While the engine is still consuming stylesheets a light page is not final.
                        if (fp !== lastFp) h = 0; else h++;
                    } else h = 0;
                    lastFp = fp;
                    if (h >= 2) return escalateToFilterFallback();
                    if (++D < 8) guardTimer = setTimeout(z, h ? 3e3 : 2500);
                };
                if (guardTimer) clearTimeout(guardTimer);
                guardTimer = setTimeout(z, 2500);
            };
            arm();
            // Client-side navigations never reload the document, so re-check after each route change.
            let href = location.href;
            guardRouteWatcher = setInterval((() => {
                if (location.href === href || document.documentElement.hasAttribute(FILTER_FALLBACK_ATTR)) return;
                href = location.href, arm();
            }), 2e3);
        }
        async function A(D, h, z) {
            if ((D === null || D === void 0 ? void 0 : D.action) === "cleanStyle") removeFilterFallback(), (0, l.removeDynamicTheme)();
            return;
        }
        function q() {
            (0, Z.removeNode)(document.querySelector(j.STYLESHEET_FALLBACK_SELECTOR));
        }
        async function Q() {
            chrome.runtime.onMessage.addListener(A);
            // FIX: Enhanced retry mechanism for getStyle message
            // Service Worker may not be ready immediately after page load
            // Increased retries and intervals to handle slow Service Worker startup
            console.log('[Darkling Content] Starting getStyle request...');
            let retries = 5;
            let D = null;
            while (retries > 0) {
                console.log('[Darkling Content] Sending getStyle, retries left:', retries);
                try {
                    D = await chrome.runtime.sendMessage({
                        action: "getStyle"
                    });
                    console.log('[Darkling Content] Response received:', D);
                    if (D !== undefined && D !== null) break; // Got a valid response, exit retry loop
                } catch (e) {
                    // Message failed, will retry
                    console.log('[Darkling Content] getStyle message failed, retrying...', e);
                }
                retries--;
                if (retries > 0) {
                    // Progressive delay: 50ms, 100ms, 150ms, 200ms
                    await new Promise(resolve => setTimeout(resolve, 50 * (5 - retries)));
                }
            }
            if (D) {
                console.log('[Darkling Content] Applying dark theme');
                // The theme engine expects true only for iframes. Main documents need
                // the html/body background fallback to avoid leaving white page areas.
                const h = window.top !== window;
                (0, l.createOrUpdateDynamicTheme)(F.DEFAULT_THEME, D, h);
                // Frames are painted by their parent document; only top-level pages get the guard.
                if (!h) startDarknessGuard();
            } else {
                // FIX: Even if no response, try to apply basic dark mode as fallback
                console.log('[Darkling Content] No style response received, applying fallback');
                q();
            }
        }
        Q();
    }, {
        Dk: 2,
        k8: 21,
        rV: 8,
        "4o": 19
    } ],
    4: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.createAdoptedStyleSheetOverride = void 0;
        const j = D("t5"), F = new WeakMap, l = new WeakSet;
        function Z(D) {
            let h = false;
            function z(h, z) {
                const j = [ ...D.adoptedStyleSheets ], F = j.indexOf(h), l = j.indexOf(z);
                if (F === l - 1) return;
                if (l >= 0) j.splice(l, 1);
                j.splice(F + 1, 0, z), D.adoptedStyleSheets = j;
            }
            function Z() {
                h = true;
                const z = [ ...D.adoptedStyleSheets ];
                D.adoptedStyleSheets.forEach((D => {
                    if (l.has(D)) {
                        const h = z.indexOf(D);
                        if (h >= 0) z.splice(h, 1);
                        F.delete(D), l.delete(D);
                    }
                })), D.adoptedStyleSheets = z;
            }
            function A(Z, A) {
                // Iterate over a copy: overrides get spliced into the live list while rendering, which
                // would otherwise shift later originals out of the fixed-length forEach range.
                [ ...D.adoptedStyleSheets ].forEach((D => {
                    if (l.has(D)) return;
                    const q = D.rules, Q = new CSSStyleSheet;
                    function I() {
                        for (let D = Q.cssRules.length - 1; D >= 0; D--) Q.deleteRule(D);
                        return z(D, Q), F.set(D, Q), l.add(Q), Q;
                    }
                    const E = (0, j.createStyleSheetModifier)();
                    E.modifySheet({
                        prepareSheet: I,
                        sourceCSSRules: q,
                        theme: Z,
                        ignoreImageAnalysis: A,
                        force: false,
                        isAsyncCancelled: () => h
                    });
                }));
            }
            return {
                render: A,
                destroy: Z
            };
        }
        z.createAdoptedStyleSheetOverride = Z, z.isAdoptedStyleSheetOverride = D => l.has(D);
    }, {
        t5: 15
    } ],
    5: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.replaceCSSFontFace = z.removeCSSComments = z.replaceCSSRelativeURLsWithAbsolute = z.getCSSBaseBath = z.getCSSURLValue = z.cssImportRegex = z.cssURLRegex = z.iterateCSSDeclarations = z.iterateCSSRules = void 0;
        const j = D("Cc"), F = D("LI"), l = D("KT"), Z = D("fm");
        function A(D, h, z) {
            (0, j.forEach)(D, (D => {
                if (D.selectorText) {
                    h(D);
                    // CSS nesting: a style rule can carry child rules of its own.
                    if (D.cssRules && D.cssRules.length > 0) A(D.cssRules, h, z);
                } else if (typeof CSSNestedDeclarations !== "undefined" && D instanceof CSSNestedDeclarations) {
                    // Declarations placed after nested rules belong to the enclosing selector.
                    h({
                        selectorText: "&",
                        style: D.style,
                        cssText: D.cssText,
                        parentRule: D.parentRule
                    });
                } else if (D.href) try {
                    A(D.styleSheet.cssRules, h, z);
                } catch (D) {
                    (0, Z.logInfo)(`Found a non-loaded link.`), z && z();
                } else if (D.media) {
                    const j = Array.from(D.media), F = j.some((D => D.startsWith("screen") || D.startsWith("all") || D.startsWith("("))), l = j.some((D => D.startsWith("print") || D.startsWith("speech")));
                    if (F || !l) A(D.cssRules, h, z);
                } else if (typeof CSSContainerRule !== "undefined" && D instanceof CSSContainerRule) {
                    // Container conditions depend on layout, so they cannot be evaluated with CSS.supports().
                    A(D.cssRules, h, z);
                } else if (D.conditionText) {
                    if (CSS.supports(D.conditionText)) A(D.cssRules, h, z);
                } else if (typeof CSSKeyframesRule !== "undefined" && D instanceof CSSKeyframesRule || typeof CSSFontFaceRule !== "undefined" && D instanceof CSSFontFaceRule || typeof CSSPropertyRule !== "undefined" && D instanceof CSSPropertyRule || typeof CSSLayerStatementRule !== "undefined" && D instanceof CSSLayerStatementRule) ; else if (D.cssRules) {
                    // @layer, @scope, @starting-style and any grouping rule added to CSS later.
                    A(D.cssRules, h, z);
                } else (0, Z.logWarn)(`CSSRule type not supported`, D);
            }));
        }
        z.iterateCSSRules = A;
        const q = [ "background", "border", "border-color", "border-bottom", "border-left", "border-right", "border-top", "outline", "outline-color" ], Q = F.isSafari ? q.map((D => {
            const h = new RegExp(`${D}:\\s*(.*?)\\s*;`);
            return [ D, h ];
        })) : null;
        function I(D, h) {
            (0, j.forEach)(D, (z => {
                const j = D.getPropertyValue(z).trim();
                if (!j) return;
                h(z, j);
            }));
            const z = D.cssText;
            if (z.includes("var(")) if (F.isSafari) Q.forEach((([D, j]) => {
                const F = z.match(j);
                if (F && F[1]) {
                    const z = F[1].trim();
                    h(D, z);
                }
            })); else q.forEach((z => {
                const j = D.getPropertyValue(z);
                if (j && j.includes("var(")) h(z, j);
            }));
        }
        function E(D) {
            return D.trim().replace(/[\n\r\\]+/g, "").replace(/^url\((.*)\)$/, "$1").trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1").replace(/(?:\\(.))/g, "$1");
        }
        function X(D) {
            const h = (0, l.parseURL)(D);
            return `${h.origin}${h.pathname.replace(/\?.*$/, "").replace(/(\/)([^\/]+)$/i, "$1")}`;
        }
        function f(D, h) {
            return D.replace(z.cssURLRegex, (D => {
                const z = E(D);
                try {
                    return `url('${(0, l.getAbsoluteURL)(h, z)}')`;
                } catch (h) {
                    return (0, Z.logWarn)("Not able to replace relative URL with Absolute URL, skipping"),
                    D;
                }
            }));
        }
        z.iterateCSSDeclarations = I, z.cssURLRegex = /url\((('.*?')|(".*?")|([^\)]*?))\)/g,
        z.cssImportRegex = /@import\s*(url\()?(('.+?')|(".+?")|([^\)]*?))\)? ?(screen)?;?/gi,
        z.getCSSURLValue = E, z.getCSSBaseBath = X, z.replaceCSSRelativeURLsWithAbsolute = f;
        const s = /\/\*[\s\S]*?\*\//g;
        function L(D) {
            return D.replace(s, "");
        }
        z.removeCSSComments = L;
        const P = /@font-face\s*{[^}]*}/g;
        function x(D) {
            return D.replace(P, "");
        }
        z.replaceCSSFontFace = x;
    }, {
        Cc: 31,
        LI: 41,
        KT: 46,
        fm: 20
    } ],
    6: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.combineFixes = z.findRelevantFix = void 0;
        const j = D("fm"), F = D("KT");
        function l(D, h) {
            if (!Array.isArray(h) || h.length === 0 || h[0].url[0] !== "*") return (0, j.logWarn)("selectRelevantFix() failed to construct a single fix", D, h),
            null;
            let z = 0, l = null;
            for (let j = 1; j < h.length; j++) if ((0, F.isURLInList)(D, h[j].url)) {
                const D = h[j].url[0].length;
                if (l === null || z < D) z = D, l = j;
            }
            return l;
        }
        function Z(D) {
            if (D.length === 0 || D[0].url[0] !== "*") return (0, j.logWarn)("combineFixes() failed to construct a single fix", D),
            null;
            function h(D) {
                return D.filter(Boolean).flat();
            }
            return {
                url: [],
                invert: h(D.map((D => D.invert))),
                css: D.map((D => D.css)).filter(Boolean).join("\n"),
                ignoreInlineStyle: h(D.map((D => D.ignoreInlineStyle))),
                ignoreImageAnalysis: h(D.map((D => D.ignoreImageAnalysis))),
                disableStyleSheetsProxy: D.some((D => D.disableStyleSheetsProxy))
            };
        }
        z.findRelevantFix = l, z.combineFixes = Z;
    }, {
        KT: 46,
        fm: 20
    } ],
    7: [ function(D, h, z) {
        "use strict";
        var j = void 0 && (void 0).__importDefault || function(D) {
            return D && D.__esModule ? D : {
                default: D
            };
        };
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.cleanImageProcessingCache = z.getFilteredImageDataURL = z.getImageDetails = void 0;
        const F = D("FZ"), l = D("DX"), Z = D("n"), A = D("hP"), q = D("fm"), Q = j(D("NQ")), I = D("x1"), E = new Q.default;
        async function X(D) {
            return new Promise((async (h, z) => {
                let j;
                if (D.startsWith("data:")) j = D; else try {
                    j = await f(D);
                } catch (D) {
                    return void z(D);
                }
                try {
                    const z = await s(j);
                    E.addToQueue((() => {
                        h(Object.assign({
                            src: D,
                            dataURL: j,
                            width: z.naturalWidth,
                            height: z.naturalHeight
                        }, a(z)));
                    }));
                } catch (D) {
                    z(D);
                }
            }));
        }
        async function f(D) {
            const h = new URL(D);
            if (h.origin === location.origin) return await (0, A.loadAsDataURL)(D);
            return await (0, l.bgFetch)({
                url: D,
                responseType: "data-url"
            });
        }
        async function s(D) {
            return new Promise(((h, z) => {
                const j = new Image;
                j.onload = () => h(j), j.onerror = () => z(`Unable to load image ${D}`), j.src = D;
            }));
        }
        z.getImageDetails = X;
        const L = 32 * 32;
        let P, x;
        function n() {
            const D = L, h = L;
            P = document.createElement("canvas"), P.width = D, P.height = h, x = P.getContext("2d", {
                willReadFrequently: true
            }), x.imageSmoothingEnabled = false;
        }
        function w() {
            P = null, x = null;
        }
        const J = 5 * 1024 * 1024;
        function a(D) {
            if (!P) n();
            const {naturalWidth: h, naturalHeight: z} = D;
            if (z === 0 || h === 0) return (0, q.logWarn)(`logWarn(Image is empty ${D.currentSrc})`),
            {
                isDark: false,
                isLight: false,
                isTransparent: false,
                isLarge: false,
                isTooLarge: false
            };
            const j = h * z * 4;
            if (j > J) return (0, q.logInfo)("Skipped large image analyzing(Larger than 5mb in memory)"),
            {
                isDark: false,
                isLight: false,
                isTransparent: false,
                isLarge: false,
                isTooLarge: true
            };
            const F = h * z, l = Math.min(1, Math.sqrt(L / F)), A = Math.ceil(h * l), Q = Math.ceil(z * l);
            x.clearRect(0, 0, A, Q), x.drawImage(D, 0, 0, h, z, 0, 0, A, Q);
            const I = x.getImageData(0, 0, A, Q), E = I.data, X = .05, f = .4, s = .7;
            let w = 0, a = 0, d = 0, H, K, c, M, S, T, e, v;
            for (c = 0; c < Q; c++) for (K = 0; K < A; K++) if (H = 4 * (c * A + K), M = E[H + 0],
            S = E[H + 1], T = E[H + 2], e = E[H + 3], e / 255 < X) w++; else {
                if (v = (0, Z.getSRGBLightness)(M, S, T), v < f) a++;
                if (v > s) d++;
            }
            const m = A * Q, G = m - w, r = .7, t = .7, C = .1, y = 800 * 600;
            return {
                isDark: a / G >= r,
                isLight: d / G >= t,
                isTransparent: w / m >= C,
                isLarge: F >= y,
                isTooLarge: false
            };
        }
        function d({dataURL: D, width: h, height: z}, j) {
            const l = (0, F.getSVGFilterMatrixValue)(j), Z = [ `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${h}" height="${z}">`, "<defs>", `<filter id="${I.IMG_FILTER_ID}">`, `<feColorMatrix type="matrix" values="${l}" />`, "</filter>", "</defs>", `<image width="${h}" height="${z}" filter="url(#${I.IMG_FILTER_ID})" xlink:href="${D}" />`, "</svg>" ].join("");
            return `data:image/svg+xml;base64,${btoa(Z)}`;
        }
        function H() {
            E && E.stopQueue(), w();
        }
        z.getFilteredImageDataURL = d, z.cleanImageProcessingCache = H;
    }, {
        x1: 2,
        FZ: 24,
        NQ: 32,
        n: 34,
        hP: 39,
        fm: 20,
        DX: 13
    } ],
    8: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.cleanDynamicThemeCache = z.removeDynamicTheme = z.createOrUpdateDynamicThemeInternal = z.createOrUpdateDynamicTheme = void 0;
        const j = D("rf"), F = D("Ai"), l = D("Cp"), Z = D("Jd"), A = D("Pj"), q = D("Cc"), Q = D("Dp"), I = D("fm"), E = D("aP"), X = D("uN"), f = D("JW"), s = D("9C"), L = D("ja"), P = D("2P"), x = D("Zq"), n = D("LI"), w = D("n"), J = D("KT"), a = D("MV"), d = D("To"), H = D("5f"), K = D("x1"), c = D("Cr"), M = false, S = (0,
        P.generateUID)(), T = new Map, e = [];
        let v = null, m = null, G = null, r = [], t = [];
        function C(D, h = document.head || document) {
            let z = h.querySelector(D);
            if (!z) z = document.createElement("style"), z.classList.add(K.STYLESHEET_COMMON_CLASSNAME),
            z.classList.add(D.substring(1)), z.media = "screen", z.textContent = "";
            return z;
        }
        function y(D) {
            (0, I.logInfo)("MV3 proxy injector: regular path attempts to inject...");
            const h = document.createElement("script");
            h.src = chrome.runtime.getURL("darkling/js/proxy.js"), h.dataset.arg = JSON.stringify(D),
            document.head.prepend(h);
        }
        const k = new Map;
        function W(D, h) {
            k.has(h) && k.get(h).stop(), k.set(h, (0, Q.watchForNodePosition)(D, "head"));
        }
        function U() {
            (0, q.forEach)(k.values(), (D => D.stop())), k.clear();
        }
        function p() {
            const D = C(K.STYLESHEET_FALLBACK_SELECTOR, document);
            D.textContent = (0, l.getModifiedFallbackStyle)(v, {
                strict: true
            }), document.head.insertBefore(D, document.head.firstChild), W(D, "fallback");
            const h = C(K.STYLESHEET_USER_AGENT_SELECTOR);
            // This sheet stands in for the browser's user-agent styles, so it lives in the first cascade
            // layer: every site rule, layered or not, outranks its normal declarations, while its
            // !important root background stays the strongest important declaration on the page.
            h.textContent = `@layer ${K.MISC_PREFIX}-ua {\n${(0, l.getModifiedUserAgentStyle)(v, G, v.styleSystemControls)}\n}`, document.head.insertBefore(h, D.nextSibling),
            W(h, "user-agent");
            const z = C(K.STYLESHEET_TEXT_SELECTOR);
            if (v.useFont || v.textStroke > 0) z.textContent = (0, L.createTextStyle)(v); else z.textContent = "";
            document.head.insertBefore(z, D.nextSibling), W(z, "text");
            const F = C(K.STYLESHEET_INVERT_SELECTOR);
            if (m && Array.isArray(m.invert) && m.invert.length > 0) F.textContent = [ `${m.invert.join(", ")} {`, `    filter: ${(0,
            f.getCSSFilterValue)(Object.assign(Object.assign({}, v), {
                contrast: v.mode === 0 ? v.contrast : (0, X.clamp)(v.contrast - 10, 0, 100)
            }))} !important;`, "}" ].join("\n"); else F.textContent = "";
            document.head.insertBefore(F, z.nextSibling), W(F, "invert");
            const Z = C(K.STYLESHEET_INLINE_SELECTOR);
            Z.textContent = (0, j.getInlineOverrideStyle)(), document.head.insertBefore(Z, F.nextSibling),
            W(Z, "inline");
            const A = C(K.STYLESHEET_OVERRIDE_SELECTOR);
            A.textContent = m && m.css ? o(m.css) : "", document.head.appendChild(A), W(A, "override");
            const q = C(K.STYLESHEET_VARIABLES_SELECTOR), Q = (0, l.getSelectionColor)(v), {darkSchemeBackgroundColor: I, darkSchemeTextColor: E, lightSchemeBackgroundColor: P, lightSchemeTextColor: x, mode: n} = v;
            let J = n === 0 ? P : I, a = n === 0 ? x : E;
            J = (0, s.modifyBackgroundColor)((0, w.parseColorWithCache)(J), v), a = (0, s.modifyForegroundColor)((0,
            w.parseColorWithCache)(a), v), q.textContent = [ `:root {`, `   --${K.ROOT_VARS_PREFIX}-neutral-background: ${J};`, `   --${K.ROOT_VARS_PREFIX}-neutral-text: ${a};`, `   --${K.ROOT_VARS_PREFIX}-selection-background: ${Q.backgroundColorSelection};`, `   --${K.ROOT_VARS_PREFIX}-selection-text: ${Q.foregroundColorSelection};`, `}` ].join("\n"),
            document.head.insertBefore(q, Z.nextSibling), W(q, "variables");
            const d = C(K.STYLESHEET_ROOT_VARS_SELECTOR);
            document.head.insertBefore(d, q.nextSibling);
            const H = !(m && m.disableStyleSheetsProxy);
            y(H), document.dispatchEvent(new CustomEvent(c.EVENT_ARG, {
                detail: H
            }));
        }
        const u = new Set;
        function O(D) {
            const h = C(K.STYLESHEET_INLINE_SELECTOR, D);
            h.textContent = (0, j.getInlineOverrideStyle)(), D.insertBefore(h, D.firstChild);
            const z = C(K.STYLESHEET_OVERRIDE_SELECTOR, D);
            z.textContent = m && m.css ? o(m.css) : "", D.insertBefore(z, h.nextSibling);
            const F = C(K.STYLESHEET_INVERT_SELECTOR, D);
            if (m && Array.isArray(m.invert) && m.invert.length > 0) F.textContent = [ `${m.invert.join(", ")} {`, `    filter: ${(0,
            f.getCSSFilterValue)(Object.assign(Object.assign({}, v), {
                contrast: v.mode === 0 ? v.contrast : (0, X.clamp)(v.contrast - 10, 0, 100)
            }))} !important;`, "}" ].join("\n"); else F.textContent = "";
            D.insertBefore(F, z.nextSibling), u.add(D);
        }
        function o(D) {
            return D.replace(/\${(.+?)}/g, ((D, h) => {
                const z = (0, w.parseColorWithCache)(h);
                if (z) return (0, s.modifyColor)(z, v);
                return (0, I.logWarn)("Couldn't parse CSSTemplate's color."), h;
            }));
        }
        function b() {
            const D = document.querySelector(K.STYLESHEET_FALLBACK_SELECTOR);
            if (D) D.textContent = "";
        }
        function B() {
            N();
            const D = (0, Z.getManageableStyles)(document), h = D.filter((D => !T.has(D))).map((D => V(D)));
            h.map((D => D.details({
                secondRound: false
            }))).filter((D => D && D.rules.length > 0)).forEach((D => {
                a.variablesStore.addRulesForMatching(D.rules);
            })), a.variablesStore.matchVariablesAndDependants(), a.variablesStore.setOnRootVariableChange((() => {
                const D = C(K.STYLESHEET_ROOT_VARS_SELECTOR);
                a.variablesStore.putRootVars(D, v);
            }));
            const z = C(K.STYLESHEET_ROOT_VARS_SELECTOR);
            if (a.variablesStore.putRootVars(z, v), T.forEach((D => D.render(v, r))), R.size === 0) b();
            h.forEach((D => D.watch()));
            const F = (0, q.toArray)(document.querySelectorAll(j.INLINE_STYLE_SELECTOR));
            (0, Q.iterateShadowHosts)(document.documentElement, (D => {
                O(D.shadowRoot), xk(D.shadowRoot);
                const h = D.shadowRoot.querySelectorAll(j.INLINE_STYLE_SELECTOR);
                if (h.length > 0) (0, q.push)(F, h);
            })), F.forEach((D => (0, j.overrideInlineStyle)(D, v, t, r))), xk(document);
        }
        let Y = 0;
        const R = new Set;
        function V(D) {
            const h = ++Y;
            function z() {
                if (!(0, Q.isDOMReady)() || !(0, d.documentIsVisible)()) {
                    R.add(h), (0, I.logInfo)(`Current amount of styles loading: ${R.size}`);
                    const D = document.querySelector(K.STYLESHEET_FALLBACK_SELECTOR);
                    if (!D.textContent) D.textContent = (0, l.getModifiedFallbackStyle)(v, {
                        strict: false
                    });
                }
            }
            function j() {
                if (R.delete(h), (0, I.logInfo)(`Removed loadingStyle ${h}, now awaiting: ${R.size}`),
                (0, I.logInfo)(`To-do to be loaded`, R), R.size === 0 && (0, Q.isDOMReady)()) b();
            }
            function F() {
                const D = A.details({
                    secondRound: true
                });
                if (!D) return;
                a.variablesStore.addRulesForMatching(D.rules), a.variablesStore.matchVariablesAndDependants(),
                A.render(v, r);
            }
            (0, I.logInfo)(`New manager for element, with loadingStyleID ${h}`, D);
            const A = (0, Z.manageStyle)(D, {
                update: F,
                loadingStart: z,
                loadingEnd: j
            });
            return T.set(D, A), A;
        }
        function i(D) {
            const h = T.get(D);
            if (h) h.destroy(), T.delete(D);
        }
        const g = (0, E.throttle)((D => {
            T.forEach((D => D.render(v, r))), e.forEach((D => D.render(v, r))), D && D();
        })), N = function() {
            g.cancel();
        };
        function kN() {
            if (R.size === 0) return void b();
            (0, I.logWarn)(`DOM is ready, but still have styles being loaded.`, R);
        }
        function Ar() {
            B(), LD();
        }
        function qk() {
            if (p(), !(0, d.documentIsVisible)() && !v.immediateModify) (0, d.setDocumentVisibilityListener)(Ar); else Ar();
            (0, F.changeMetaThemeColorWhenAvailable)(v);
        }
        const adoptedRoots = new Map;
        let adoptedWatchTimer = null, adoptedSweptElementCount = -1;
        function adoptedSnapshot(root) {
            return root.adoptedStyleSheets.filter((sheet => !(0, x.isAdoptedStyleSheetOverride)(sheet))).map((sheet => {
                let count = -1;
                try {
                    count = sheet.cssRules.length;
                } catch (D) {}
                return [ sheet, count ];
            }));
        }
        function adoptedChanged(previous, current) {
            if (!previous || previous.length !== current.length) return true;
            for (let i = 0; i < previous.length; i++) if (previous[i][0] !== current[i][0] || previous[i][1] !== current[i][1]) return true;
            return false;
        }
        // Constructable style sheets can be attached to a root or edited without any DOM mutation
        // (web components typically adopt a shared sheet during hydration), so every root is
        // snapshotted and its override rebuilt whenever the sheet list or the rule counts change.
        function xk(D) {
            try {
                if (!Array.isArray(D.adoptedStyleSheets)) return;
                const tracked = adoptedRoots.get(D), current = adoptedSnapshot(D);
                if (tracked && !adoptedChanged(tracked.snapshot, current)) return;
                if (tracked && tracked.override) {
                    tracked.override.destroy();
                    const index = e.indexOf(tracked.override);
                    if (index >= 0) e.splice(index, 1);
                }
                let override = null;
                if (current.length > 0) override = (0, x.createAdoptedStyleSheetOverride)(D), e.push(override), override.render(v, r);
                adoptedRoots.set(D, {
                    override: override,
                    snapshot: current
                });
                // Roots are kept while detached (frameworks re-mount components during hydration and
                // the discovery callback will not fire for them a second time); the map is capped so
                // pages that churn through components cannot grow it without bound.
                if (adoptedRoots.size > 500) adoptedRoots.delete(adoptedRoots.keys().next().value);
                if (!adoptedWatchTimer) adoptedWatchTimer = setInterval((() => {
                    // Event-driven discovery misses hosts whose shadow root attached without any DOM
                    // mutation (custom elements upgraded after insertion), so the document is swept too.
                    // New shadow hosts require new elements, so the walk is skipped while the element
                    // count is unchanged; tracked roots still get their snapshots re-checked.
                    const elementCount = document.getElementsByTagName("*").length;
                    if (elementCount !== adoptedSweptElementCount) {
                        adoptedSweptElementCount = elementCount, (0, Q.iterateShadowHosts)(document.documentElement, (D => {
                            if (D.shadowRoot && !adoptedRoots.has(D.shadowRoot)) O(D.shadowRoot), xk(D.shadowRoot);
                        }));
                    }
                    adoptedRoots.forEach(((tracked, root) => {
                        if (root === document || root.isConnected) xk(root);
                    }));
                }), 3e3);
            } catch (D) {
                (0, I.logWarn)("Error occurred in handleAdoptedStyleSheets: ", D);
            }
        }
        function stopWatchingAdoptedStyleSheets() {
            if (adoptedWatchTimer) clearInterval(adoptedWatchTimer), adoptedWatchTimer = null;
            adoptedSweptElementCount = -1, adoptedRoots.clear();
        }
        function LD() {
            const D = Array.from(T.keys());
            (0, A.watchForStyleChanges)(D, (({created: D, updated: h, removed: z, moved: j}) => {
                const F = z, l = D.concat(h).concat(j).filter((D => !T.has(D))), Z = j.filter((D => T.has(D)));
                (0, I.logInfo)(`Styles to be removed:`, F), F.forEach((D => i(D)));
                const A = l.map((D => V(D)));
                A.map((D => D.details({
                    secondRound: false
                }))).filter((D => D && D.rules.length > 0)).forEach((D => {
                    a.variablesStore.addRulesForMatching(D.rules);
                })), a.variablesStore.matchVariablesAndDependants(), A.forEach((D => D.render(v, r))),
                A.forEach((D => D.watch())), Z.forEach((D => T.get(D).restore()));
            }), (D => {
                O(D), xk(D);
            })), (0, j.watchForInlineStyles)((D => {
                if ((0, j.overrideInlineStyle)(D, v, t, r), D === document.documentElement) {
                    const h = D.getAttribute("style") || "";
                    if (h.includes("--")) {
                        a.variablesStore.matchVariablesAndDependants();
                        const D = C(K.STYLESHEET_ROOT_VARS_SELECTOR.substring(1));
                        a.variablesStore.putRootVars(D, v);
                    }
                }
            }), (D => {
                O(D), xk(D);
                const h = D.querySelectorAll(j.INLINE_STYLE_SELECTOR);
                if (h.length > 0) (0, q.forEach)(h, (D => (0, j.overrideInlineStyle)(D, v, t, r)));
            })), (0, Q.addDOMReadyListener)(kN);
        }
        function hO() {
            T.forEach((D => D.pause())), U(), stopWatchingAdoptedStyleSheets(), (0, A.stopWatchingForStyleChanges)(), (0, j.stopWatchingForInlineStyles)(),
            (0, Q.removeDOMReadyListener)(kN), (0, Q.cleanReadyStateCompleteListeners)();
        }
        let VB;
        function zi() {
            const D = document.createElement("meta");
            D.name = K.META_PROPERTY, D.content = S, document.head.appendChild(D);
        }
        function dj() {
            const D = document.querySelector(`meta[name="${K.META_PROPERTY}"]`);
            if (D) {
                if (D.content !== S) return true;
                return false;
            }
            return zi(), false;
        }
        function Su(D, h) {
            if (!h) return null;
            if (h.length === 0 || h[0].url[0] !== "*") return (0, I.logWarn)("selectRelevantFix() failed to construct a single fix", D, h),
            null;
            const z = (0, H.findRelevantFix)(D, h);
            return z ? (0, H.combineFixes)([ h[0], h[z] ]) : h[0];
        }
        function Cv(D, h, z) {
            const j = Su(document.location.href, h);
            Oq(D, j, z);
        }
        function Oq(D, h, z) {
            if (v = D, m = h, m) r = Array.isArray(m.ignoreImageAnalysis) ? m.ignoreImageAnalysis : [],
            t = Array.isArray(m.ignoreInlineStyle) ? m.ignoreInlineStyle : []; else r = [],
            t = [];
            if (v.immediateModify) (0, Q.setIsDOMReady)((() => true));
            if (G = z, document.head) {
                if (dj()) return void KU();
                qk();
            } else {
                if (!n.isFirefox) {
                    const D = C(K.STYLESHEET_FALLBACK_SELECTOR);
                    document.documentElement.appendChild(D), D.textContent = (0, l.getModifiedFallbackStyle)(v, {
                        strict: true
                    });
                }
                const D = new MutationObserver((() => {
                    if (document.head) {
                        if (D.disconnect(), dj()) return void KU();
                        qk();
                    }
                }));
                D.observe(document, {
                    childList: true,
                    subtree: true
                });
            }
        }
        function rB() {
            document.dispatchEvent(new CustomEvent(K.MSG_CLEANUP)), (0, Q.removeNode)(document.head.querySelector(K.PROXY_SELECTOR));
        }
        function KU() {
            if (BW(), (0, Q.removeNode)(document.querySelector(K.STYLESHEET_FALLBACK_SELECTOR)),
            document.head) (0, F.restoreMetaThemeColor)(), (0, Q.removeNode)(document.head.querySelector(K.STYLESHEET_USER_AGENT_SELECTOR)),
            (0, Q.removeNode)(document.head.querySelector(K.STYLESHEET_TEXT_SELECTOR)), (0,
            Q.removeNode)(document.head.querySelector(K.STYLESHEET_INVERT_SELECTOR)), (0, Q.removeNode)(document.head.querySelector(K.STYLESHEET_INLINE_SELECTOR)),
            (0, Q.removeNode)(document.head.querySelector(K.STYLESHEET_OVERRIDE_SELECTOR)),
            (0, Q.removeNode)(document.head.querySelector(K.STYLESHEET_VARIABLES_SELECTOR)),
            (0, Q.removeNode)(document.head.querySelector(K.STYLESHEET_ROOT_VARS_SELECTOR)),
            (0, Q.removeNode)(document.head.querySelector(`meta[name="${K.META_PROPERTY}"]`)),
            rB();
            u.forEach((D => {
                (0, Q.removeNode)(D.querySelector(K.STYLESHEET_INLINE_SELECTOR)), (0, Q.removeNode)(D.querySelector(K.STYLESHEET_OVERRIDE_SELECTOR));
            })), u.clear(), (0, q.forEach)(T.keys(), (D => i(D))), R.clear(), (0, Z.cleanLoadingLinks)(),
            (0, q.forEach)(document.querySelectorAll("." + K.STYLESHEET_COMMON_CLASSNAME), Q.removeNode),
            e.forEach((D => {
                D.destroy();
            })), e.splice(0), VB && VB.disconnect();
        }
        function BW() {
            a.variablesStore.clear(), J.parsedURLCache.clear(), (0, d.removeDocumentVisibilityListener)(),
            N(), hO(), (0, l.cleanModificationCache)(), (0, w.clearColorCache)();
        }
        z.createOrUpdateDynamicTheme = Cv, z.createOrUpdateDynamicThemeInternal = Oq, z.removeDynamicTheme = KU,
        z.cleanDynamicThemeCache = BW;
    }, {
        x1: 2,
        JW: 22,
        "9C": 23,
        ja: 25,
        Cc: 31,
        n: 34,
        uN: 37,
        LI: 41,
        aP: 43,
        "2P": 45,
        KT: 46,
        To: 47,
        Dp: 19,
        fm: 20,
        Zq: 4,
        "5f": 6,
        rf: 9,
        Ai: 10,
        Cp: 11,
        Cr: 12,
        Jd: 14,
        MV: 17,
        Pj: 18
    } ],
    9: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.overrideInlineStyle = z.stopWatchingForInlineStyles = z.watchForInlineStyles = z.getInlineOverrideStyle = z.INLINE_STYLE_SELECTOR = void 0;
        const j = D("Cc"), F = D("Dp"), l = D("sp"), Z = D("Cp"), A = D("MV"), q = D("LI"), Q = D("Eo"), I = D("aP"), E = D("x1"), X = {
            "background-color": {
                customProp: `--${E.ROOT_VARS_PREFIX}-inline-bgcolor`,
                cssProp: "background-color",
                dataAttr: `data-${E.ROOT_VARS_PREFIX}-inline-bgcolor`
            },
            "background-image": {
                customProp: `--${E.ROOT_VARS_PREFIX}-inline-bgimage`,
                cssProp: "background-image",
                dataAttr: `data-${E.ROOT_VARS_PREFIX}-inline-bgimage`
            },
            "border-color": {
                customProp: `--${E.ROOT_VARS_PREFIX}-inline-border`,
                cssProp: "border-color",
                dataAttr: `data-${E.ROOT_VARS_PREFIX}-inline-border`
            },
            "border-bottom-color": {
                customProp: `--${E.ROOT_VARS_PREFIX}-inline-border-bottom`,
                cssProp: "border-bottom-color",
                dataAttr: `data-${E.ROOT_VARS_PREFIX}-inline-border-bottom`
            },
            "border-left-color": {
                customProp: `--${E.ROOT_VARS_PREFIX}-inline-border-left`,
                cssProp: "border-left-color",
                dataAttr: `data-${E.ROOT_VARS_PREFIX}-inline-border-left`
            },
            "border-right-color": {
                customProp: `--${E.ROOT_VARS_PREFIX}-inline-border-right`,
                cssProp: "border-right-color",
                dataAttr: `data-${E.ROOT_VARS_PREFIX}-inline-border-right`
            },
            "border-top-color": {
                customProp: `--${E.ROOT_VARS_PREFIX}-inline-border-top`,
                cssProp: "border-top-color",
                dataAttr: `data-${E.ROOT_VARS_PREFIX}-inline-border-top`
            },
            "box-shadow": {
                customProp: `--${E.ROOT_VARS_PREFIX}-inline-boxshadow`,
                cssProp: "box-shadow",
                dataAttr: `data-${E.ROOT_VARS_PREFIX}-inline-boxshadow`
            },
            color: {
                customProp: `--${E.ROOT_VARS_PREFIX}-inline-color`,
                cssProp: "color",
                dataAttr: `data-${E.ROOT_VARS_PREFIX}-inline-color`
            },
            fill: {
                customProp: `--${E.ROOT_VARS_PREFIX}-inline-fill`,
                cssProp: "fill",
                dataAttr: `data-${E.ROOT_VARS_PREFIX}-inline-fill`
            },
            stroke: {
                customProp: `--${E.ROOT_VARS_PREFIX}-inline-stroke`,
                cssProp: "stroke",
                dataAttr: `data-${E.ROOT_VARS_PREFIX}-inline-stroke`
            },
            "outline-color": {
                customProp: `--${E.ROOT_VARS_PREFIX}-inline-outline`,
                cssProp: "outline-color",
                dataAttr: `data-${E.ROOT_VARS_PREFIX}-inline-outline`
            },
            "stop-color": {
                customProp: `--${E.ROOT_VARS_PREFIX}-inline-stopcolor`,
                cssProp: "stop-color",
                dataAttr: `data-${E.ROOT_VARS_PREFIX}-inline-stopcolor`
            }
        }, f = Object.values(X), s = {};
        f.forEach((({cssProp: D, customProp: h}) => s[h] = D));
        const L = [ "style", "fill", "stop-color", "stroke", "bgcolor", "color" ];
        function P() {
            return f.map((({dataAttr: D, customProp: h, cssProp: z}) => [ `[${D}] {`, `  ${z}: var(${h}) !important;`, "}" ].join("\n"))).join("\n");
        }
        function x(D) {
            const h = [];
            if (D instanceof Element && D.matches(z.INLINE_STYLE_SELECTOR)) h.push(D);
            if (D instanceof Element || q.isShadowDomSupported && D instanceof ShadowRoot || D instanceof Document) (0,
            j.push)(h, D.querySelectorAll(z.INLINE_STYLE_SELECTOR));
            return h;
        }
        z.INLINE_STYLE_SELECTOR = L.map((D => `[${D}]`)).join(", "), z.getInlineOverrideStyle = P;
        const n = new Map, w = new Map;
        function J(D, h) {
            a(document, D, h), (0, F.iterateShadowHosts)(document.documentElement, (z => {
                a(z.shadowRoot, D, h);
            }));
        }
        function a(D, h, z) {
            if (n.has(D)) n.get(D).disconnect(), w.get(D).disconnect();
            const j = new WeakSet;
            function l(D) {
                x(D).forEach((D => {
                    if (j.has(D)) return;
                    j.add(D), h(D);
                })), (0, F.iterateShadowHosts)(D, (F => {
                    if (j.has(D)) return;
                    j.add(D), z(F.shadowRoot), a(F.shadowRoot, h, z);
                }));
            }
            const Z = (0, F.createOptimizedTreeObserver)(D, {
                onMinorMutations: ({additions: D}) => {
                    D.forEach((D => l(D)));
                },
                onHugeMutations: () => {
                    l(D);
                }
            });
            n.set(D, Z);
            let A = 0, q = null;
            const E = (0, Q.getDuration)({
                seconds: 10
            }), X = (0, Q.getDuration)({
                seconds: 2
            }), s = 50;
            let P = [], J = null;
            const d = (0, I.throttle)((D => {
                D.forEach((D => {
                    if (L.includes(D.attributeName)) h(D.target);
                }));
            })), H = new MutationObserver((D => {
                if (J) return void P.push(...D);
                A++;
                const h = Date.now();
                if (q == null) q = h; else if (A >= s) {
                    if (h - q < E) return J = setTimeout((() => {
                        q = null, A = 0, J = null;
                        const D = P;
                        P = [], d(D);
                    }), X), void P.push(...D);
                    q = h, A = 1;
                }
                d(D);
            }));
            H.observe(D, {
                attributes: true,
                attributeFilter: L.concat(f.map((({dataAttr: D}) => D))),
                subtree: true
            }), w.set(D, H);
        }
        function d() {
            n.forEach((D => D.disconnect())), w.forEach((D => D.disconnect())), n.clear(), w.clear();
        }
        z.watchForInlineStyles = J, z.stopWatchingForInlineStyles = d;
        const H = new WeakMap, K = [ "brightness", "contrast", "grayscale", "sepia", "mode" ];
        function c(D, h) {
            return L.map((h => `${h}="${D.getAttribute(h)}"`)).concat(K.map((D => `${D}="${h[D]}"`))).join(" ");
        }
        function M(D, h) {
            for (let z = 0, j = h.length; z < j; z++) {
                const j = h[z];
                if (D.matches(j)) return true;
            }
            return false;
        }
        function S(D, h, z, q) {
            const Q = c(D, h);
            if (Q === H.get(D)) return;
            const I = new Set(Object.keys(X));
            function E(z, j, F) {
                const l = z.startsWith("--"), {customProp: Q, dataAttr: E} = l ? {} : X[z], f = (0,
                Z.getModifiableCSSDeclaration)(j, F, {
                    style: D.style,
                    element: D
                }, A.variablesStore, q, null);
                if (!f) return;
                let s = f.value;
                if (typeof s === "function") s = s(h);
                if (l && typeof s === "object") {
                    const h = s;
                    h.declarations.forEach((({property: h, value: z}) => {
                        !(z instanceof Promise) && D.style.setProperty(h, z);
                    }));
                } else {
                    if (D.style.setProperty(Q, s), !D.hasAttribute(E)) D.setAttribute(E, "");
                    I.delete(z);
                }
            }
            if (z.length > 0) if (M(D, z)) return void I.forEach((h => {
                D.removeAttribute(X[h].dataAttr);
            }));
            if (D.hasAttribute("bgcolor")) {
                let h = D.getAttribute("bgcolor");
                if (h.match(/^[0-9a-f]{3}$/i) || h.match(/^[0-9a-f]{6}$/i)) h = `#${h}`;
                E("background-color", "background-color", h);
            }
            if (D.hasAttribute("color") && D.rel !== "mask-icon") {
                let h = D.getAttribute("color");
                if (h.match(/^[0-9a-f]{3}$/i) || h.match(/^[0-9a-f]{6}$/i)) h = `#${h}`;
                E("color", "color", h);
            }
            if (D instanceof SVGElement) {
                if (D.hasAttribute("fill")) {
                    const h = 32, z = D.getAttribute("fill");
                    if (z !== "none") if (!(D instanceof SVGTextElement)) {
                        const j = () => {
                            const {width: j, height: F} = D.getBoundingClientRect(), l = j > h || F > h;
                            E("fill", l ? "background-color" : "color", z);
                        };
                        if ((0, F.isReadyStateComplete)()) j(); else (0, F.addReadyStateCompleteListener)(j);
                    } else E("fill", "color", z);
                }
                if (D.hasAttribute("stop-color")) E("stop-color", "background-color", D.getAttribute("stop-color"));
            }
            if (D.hasAttribute("stroke")) {
                const h = D.getAttribute("stroke");
                E("stroke", D instanceof SVGLineElement || D instanceof SVGTextElement ? "border-color" : "color", h);
            }
            if (D.style && (0, l.iterateCSSDeclarations)(D.style, ((h, z) => {
                if (h === "background-image" && z.includes("url")) return;
                if (X.hasOwnProperty(h) || h.startsWith("--") && !s[h]) E(h, h, z); else {
                    const z = s[h];
                    if (z && !D.style.getPropertyValue(z) && !D.hasAttribute(z)) {
                        if (z === "background-color" && D.hasAttribute("bgcolor")) return;
                        D.style.setProperty(h, "");
                    }
                }
            })), D.style && D instanceof SVGTextElement && D.style.fill) E("fill", "color", D.style.getPropertyValue("fill"));
            (0, j.forEach)(I, (h => {
                D.removeAttribute(X[h].dataAttr);
            })), H.set(D, c(D, h));
        }
        z.overrideInlineStyle = S;
    }, {
        x1: 2,
        Cc: 31,
        LI: 41,
        aP: 43,
        Eo: 44,
        Dp: 19,
        sp: 5,
        Cp: 11,
        MV: 17
    } ],
    10: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.restoreMetaThemeColor = z.changeMetaThemeColorWhenAvailable = void 0;
        const j = D("n"), F = D("9C"), l = D("fm"), Z = "theme-color", A = `meta[name="${Z}"]`;
        let q = null, Q = null;
        function I(D, h) {
            q = q || D.content;
            const z = (0, j.parseColorWithCache)(q);
            if (!z) return void (0, l.logWarn)("Invalid meta color", z);
            D.content = (0, F.modifyBackgroundColor)(z, h);
        }
        function E(D) {
            const h = document.querySelector(A);
            if (h) I(h, D); else {
                if (Q) Q.disconnect();
                Q = new MutationObserver((h => {
                    D: for (let z = 0; z < h.length; z++) {
                        const {addedNodes: j} = h[z];
                        for (let h = 0; h < j.length; h++) {
                            const z = j[h];
                            if (z instanceof HTMLMetaElement && z.name === Z) {
                                Q.disconnect(), Q = null, I(z, D);
                                break D;
                            }
                        }
                    }
                })), Q.observe(document.head, {
                    childList: true
                });
            }
        }
        function X() {
            if (Q) Q.disconnect(), Q = null;
            const D = document.querySelector(A);
            if (D && q) D.content = q;
        }
        z.changeMetaThemeColorWhenAvailable = E, z.restoreMetaThemeColor = X;
    }, {
        "9C": 23,
        n: 34,
        fm: 20
    } ],
    11: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.cleanModificationCache = z.getShadowModifier = z.getShadowModifierWithInfo = z.getBgImageModifier = z.getModifiedFallbackStyle = z.getSelectionColor = z.getModifiedUserAgentStyle = z.getModifiableCSSDeclaration = void 0;
        const j = D("n"), F = D("uN"), l = D("zW"), Z = D("KT"), A = D("9C"), q = D("sp"), Q = D("os"), I = D("fm"), E = D("LI"), X = D("js");
        function f(D, h) {
            return Boolean(D && D.getPropertyPriority(h));
        }
        function s(D, h, z, j, F, l) {
            if (D.startsWith("--")) {
                const Z = e(j, D, h, z, F, l);
                if (Z) return {
                    property: D,
                    value: Z,
                    important: f(z.style, D),
                    sourceValue: h
                };
            } else if (h.includes("var(")) {
                const F = v(j, D, h);
                if (F) return {
                    property: D,
                    value: F,
                    important: f(z.style, D),
                    sourceValue: h
                };
            } else if (D === "color-scheme") return (0, I.logWarn)("CSS property color-scheme is not supported"),
            null; else if (D.includes("color") && D !== "-webkit-print-color-adjust" || D === "fill" || D === "stroke" || D === "stop-color") {
                const j = d(D, h, z);
                if (j) return {
                    property: D,
                    value: j,
                    important: f(z.style, D),
                    sourceValue: h
                };
            } else if (D === "background-image" || D === "list-style-image") {
                const j = M(h, z, F, l);
                if (j) return {
                    property: D,
                    value: j,
                    important: f(z.style, D),
                    sourceValue: h
                };
            } else if (D.includes("shadow")) {
                const j = T(h);
                if (j) return {
                    property: D,
                    value: j,
                    important: f(z.style, D),
                    sourceValue: h
                };
            }
            return null;
        }
        function L(...D) {
            return D.filter(Boolean).join(", ");
        }
        function P(D, h, z) {
            const j = [];
            if (!h) j.push("html {"), j.push(`    background-color: ${(0, A.modifyBackgroundColor)({
                r: 255,
                g: 255,
                b: 255
            }, D)} !important;`), j.push("}");
            j.push("html {"), j.push(`    color-scheme: ${D.mode === 1 ? "dark" : "dark light"} !important;`),
            j.push("}");
            const F = L(h ? "" : "html, body", z ? "input, textarea, select, button, dialog" : "");
            if (F) j.push(`${F} {`), j.push(`    background-color: ${(0, A.modifyBackgroundColor)({
                r: 255,
                g: 255,
                b: 255
            }, D)};`), j.push("}");
            if (j.push(`${L("html, body", z ? "input, textarea, select, button" : "")} {`),
            j.push(`    border-color: ${(0, A.modifyBorderColor)({
                r: 76,
                g: 76,
                b: 76
            }, D)};`), j.push(`    color: ${(0, A.modifyForegroundColor)({
                r: 0,
                g: 0,
                b: 0
            }, D)};`), j.push("}"), j.push("a {"), j.push(`    color: ${(0, A.modifyForegroundColor)({
                r: 0,
                g: 64,
                b: 255
            }, D)};`), j.push("}"), j.push("table {"), j.push(`    border-color: ${(0, A.modifyBorderColor)({
                r: 128,
                g: 128,
                b: 128
            }, D)};`), j.push("}"), j.push("::placeholder {"), j.push(`    color: ${(0, A.modifyForegroundColor)({
                r: 169,
                g: 169,
                b: 169
            }, D)};`), j.push("}"), j.push("input:-webkit-autofill,"), j.push("textarea:-webkit-autofill,"),
            j.push("select:-webkit-autofill {"), j.push(`    background-color: ${(0, A.modifyBackgroundColor)({
                r: 250,
                g: 255,
                b: 189
            }, D)} !important;`), j.push(`    color: ${(0, A.modifyForegroundColor)({
                r: 0,
                g: 0,
                b: 0
            }, D)} !important;`), j.push("}"), D.scrollbarColor) j.push(w(D));
            if (D.selectionColor) j.push(n(D));
            return j.join("\n");
        }
        function x(D) {
            let h, z;
            if (D.selectionColor === "auto") h = (0, A.modifyBackgroundColor)({
                r: 0,
                g: 96,
                b: 212
            }, Object.assign(Object.assign({}, D), {
                grayscale: 0
            })), z = (0, A.modifyForegroundColor)({
                r: 255,
                g: 255,
                b: 255
            }, Object.assign(Object.assign({}, D), {
                grayscale: 0
            })); else {
                const F = (0, j.parseColorWithCache)(D.selectionColor), l = (0, j.rgbToHSL)(F);
                if (h = D.selectionColor, l.l < .5) z = "#FFF"; else z = "#000";
            }
            return {
                backgroundColorSelection: h,
                foregroundColorSelection: z
            };
        }
        function n(D) {
            const h = [], z = x(D), j = z.backgroundColorSelection, F = z.foregroundColorSelection;
            return [ "::selection", "::-moz-selection" ].forEach((D => {
                h.push(`${D} {`), h.push(`    background-color: ${j} !important;`), h.push(`    color: ${F} !important;`),
                h.push("}");
            })), h.join("\n");
        }
        function w(D) {
            const h = [];
            let z, l, Z, q, Q, I;
            if (D.scrollbarColor === "auto") z = (0, A.modifyBackgroundColor)({
                r: 241,
                g: 241,
                b: 241
            }, D), l = (0, A.modifyForegroundColor)({
                r: 96,
                g: 96,
                b: 96
            }, D), Z = (0, A.modifyBackgroundColor)({
                r: 176,
                g: 176,
                b: 176
            }, D), q = (0, A.modifyBackgroundColor)({
                r: 144,
                g: 144,
                b: 144
            }, D), Q = (0, A.modifyBackgroundColor)({
                r: 96,
                g: 96,
                b: 96
            }, D), I = (0, A.modifyBackgroundColor)({
                r: 255,
                g: 255,
                b: 255
            }, D); else {
                const h = (0, j.parseColorWithCache)(D.scrollbarColor), A = (0, j.rgbToHSL)(h), I = A.l > .5, E = D => Object.assign(Object.assign({}, A), {
                    l: (0, F.clamp)(A.l + D, 0, 1)
                }), X = D => Object.assign(Object.assign({}, A), {
                    l: (0, F.clamp)(A.l - D, 0, 1)
                });
                z = (0, j.hslToString)(X(.4)), l = (0, j.hslToString)(I ? X(.4) : E(.4)), Z = (0,
                j.hslToString)(A), q = (0, j.hslToString)(E(.1)), Q = (0, j.hslToString)(E(.2));
            }
            if (h.push("::-webkit-scrollbar {"), h.push(`    background-color: ${z};`), h.push(`    color: ${l};`),
            h.push("}"), h.push("::-webkit-scrollbar-thumb {"), h.push(`    background-color: ${Z};`),
            h.push("}"), h.push("::-webkit-scrollbar-thumb:hover {"), h.push(`    background-color: ${q};`),
            h.push("}"), h.push("::-webkit-scrollbar-thumb:active {"), h.push(`    background-color: ${Q};`),
            h.push("}"), h.push("::-webkit-scrollbar-corner {"), h.push(`    background-color: ${I};`),
            h.push("}"), E.isFirefox) h.push("* {"), h.push(`    scrollbar-color: ${Z} ${z};`),
            h.push("}");
            return h.join("\n");
        }
        function J(D, {strict: h}) {
            const z = [], j = [ "microsoft.com", "docs.microsoft.com" ].includes(location.hostname);
            return z.push(`html, body, ${h ? `body :not(iframe)${j ? ':not(div[style^="position:absolute;top:0;left:-"]' : ""}` : "body > :not(iframe)"} {`),
            z.push(`    background-color: ${(0, A.modifyBackgroundColor)({
                r: 255,
                g: 255,
                b: 255
            }, D)} !important;`), z.push(`    border-color: ${(0, A.modifyBorderColor)({
                r: 64,
                g: 64,
                b: 64
            }, D)} !important;`), z.push(`    color: ${(0, A.modifyForegroundColor)({
                r: 0,
                g: 0,
                b: 0
            }, D)} !important;`), z.push("}"), z.join("\n");
        }
        z.getModifiableCSSDeclaration = s, z.getModifiedUserAgentStyle = P, z.getSelectionColor = x,
        z.getModifiedFallbackStyle = J;
        const a = new Set([ "inherit", "transparent", "initial", "currentcolor", "none", "unset" ]);
        function d(D, h, z) {
            if (a.has(h.toLowerCase())) return h;
            const F = (0, j.parseColorWithCache)(h);
            if (!F) return (0, I.logWarn)("Couldn't parse color", h), null;
            if (D.includes("background")) {
                if (z.style.webkitMaskImage && z.style.webkitMaskImage !== "none" || z.style.webkitMask && !z.style.webkitMask.startsWith("none") || z.style.mask && z.style.mask !== "none" || z.style.getPropertyValue("mask-image") && z.style.getPropertyValue("mask-image") !== "none") return D => (0,
                A.modifyForegroundColor)(F, D);
                return D => (0, A.modifyBackgroundColor)(F, D);
            }
            if (D.includes("border") || D.includes("outline")) return D => (0, A.modifyBorderColor)(F, D);
            return D => (0, A.modifyForegroundColor)(F, D);
        }
        const H = new Map, K = new Map;
        function c(D, h) {
            if (!D || h.length === 0) return false;
            if (h.some((D => D === "*"))) return true;
            const z = D.split(/,\s*/g);
            for (let D = 0; D < h.length; D++) {
                const j = h[D];
                if (z.some((D => D === j))) return true;
            }
            return false;
        }
        function M(D, h, z, E) {
            try {
                const f = (0, X.parseGradient)(D), s = (0, l.getMatches)(q.cssURLRegex, D);
                if (s.length === 0 && f.length === 0) return D;
                // Gradient text (background-clip: text) paints the glyphs, so its stops must be
                // treated as foreground colours: darkening them would hide the text on a dark page.
                const clipsToText = (D => {
                    if (!D) return false;
                    if (D.style && (D.style.backgroundClip === "text" || D.style.webkitBackgroundClip === "text")) return true;
                    if (D.element && D.style && D.style.backgroundImage) try {
                        return getComputedStyle(D.element).webkitBackgroundClip === "text";
                    } catch (D) {}
                    return false;
                })(h), stopModifier = clipsToText ? A.modifyForegroundColor : A.modifyGradientColor;
                const L = h => {
                    let z = 0;
                    return h.map((h => {
                        const j = D.indexOf(h, z);
                        return z = j + h.length, {
                            match: h,
                            index: j
                        };
                    }));
                }, P = f.map((D => Object.assign({
                    type: "gradient"
                }, D))).concat(L(s).map((D => Object.assign({
                    type: "url",
                    offset: 0
                }, D)))).sort(((D, h) => D.index > h.index ? 1 : -1)), x = D => {
                    const {typeGradient: h, match: z, hasComma: F} = D, Z = /([^\(\),]+(\([^\(\)]*(\([^\(\)]*\)*[^\(\)]*)?\))?([^\(\), ]|( (?!calc)))*),?/g, q = /^(from|color-stop|to)\(([^\(\)]*?,\s*)?(.*?)\)$/, Q = (0,
                    l.getMatches)(Z, z, 1).map((D => {
                        D = D.trim();
                        let h = (0, j.parseColorWithCache)(D);
                        if (h) return D => stopModifier(h, D);
                        const z = D.lastIndexOf(" ");
                        if (h = (0, j.parseColorWithCache)(D.substring(0, z)), h) return j => `${stopModifier(h, j)} ${D.substring(z + 1)}`;
                        const F = D.match(q);
                        if (F) if (h = (0, j.parseColorWithCache)(F[3]), h) return D => `${F[1]}(${F[2] ? `${F[2]}, ` : ""}${stopModifier(h, D)})`;
                        return () => D;
                    }));
                    return D => `${h}(${Q.map((h => h(D))).join(", ")})${F ? ", " : ""}`;
                }, n = D => {
                    var j;
                    if (c(h.selectorText, z)) return null;
                    let F = (0, q.getCSSURLValue)(D);
                    const l = F.length === 0, {parentStyleSheet: A} = h, X = A && A.href ? (0, q.getCSSBaseBath)(A.href) : ((j = A.ownerNode) === null || j === void 0 ? void 0 : j.baseURI) || location.origin;
                    F = (0, Z.getAbsoluteURL)(X, F);
                    const f = `url("${F}")`;
                    return async D => {
                        if (l) return "url('')";
                        let h;
                        if (H.has(F)) h = H.get(F); else try {
                            if (K.has(F)) {
                                const D = K.get(F);
                                if (h = await new Promise((h => D.push(h))), !h) return null;
                            } else K.set(F, []), h = await (0, Q.getImageDetails)(F), H.set(F, h), K.get(F).forEach((D => D(h))),
                            K.delete(F);
                            if (E()) return null;
                        } catch (D) {
                            if ((0, I.logWarn)(D), K.has(F)) K.get(F).forEach((D => D(null))), K.delete(F);
                            return f;
                        }
                        const z = w(h, D) || f;
                        return z;
                    };
                }, w = (D, h) => {
                    const {isDark: z, isLight: j, isTransparent: l, isLarge: Z, isTooLarge: A, width: q} = D;
                    let E;
                    if (A) (0, I.logInfo)(`Not modifying too large image ${D.src}`), E = `url("${D.src}")`; else if (z && l && h.mode === 1 && !Z && q > 2) {
                        (0, I.logInfo)(`Inverting dark image ${D.src}`);
                        const z = (0, Q.getFilteredImageDataURL)(D, Object.assign(Object.assign({}, h), {
                            sepia: (0, F.clamp)(h.sepia + 10, 0, 100)
                        }));
                        E = `url("${z}")`;
                    } else if (j && !l && h.mode === 1) if (Z) (0, I.logInfo)(`Not modifying light non-transparent large image ${D.src}`),
                    E = "none"; else {
                        (0, I.logInfo)(`Dimming light image ${D.src}`);
                        const z = (0, Q.getFilteredImageDataURL)(D, h);
                        E = `url("${z}")`;
                    } else if (h.mode === 0 && j && !Z) {
                        (0, I.logInfo)(`Applying filter to image ${D.src}`);
                        const z = (0, Q.getFilteredImageDataURL)(D, Object.assign(Object.assign({}, h), {
                            brightness: (0, F.clamp)(h.brightness - 10, 5, 200),
                            sepia: (0, F.clamp)(h.sepia + 10, 0, 100)
                        }));
                        E = `url("${z}")`;
                    } else (0, I.logInfo)(`Not modifying too large image ${D.src}`), E = null;
                    return E;
                }, J = [];
                let a = 0, d = false;
                return P.forEach((({type: h, match: z, index: j, typeGradient: F, hasComma: l, offset: Z}, A) => {
                    const q = j, Q = a, I = q + z.length + Z;
                    if (a = I, Q !== q) if (d) J.push((() => {
                        let h = D.substring(Q, q);
                        if (h[0] === ",") h = h.substring(1);
                        return h;
                    })); else J.push((() => D.substring(Q, q)));
                    if (d = l || false, h === "url") J.push(n(z)); else if (h === "gradient") J.push(x({
                        match: z,
                        index: j,
                        typeGradient: F,
                        hasComma: l || false,
                        offset: Z
                    }));
                    if (A === P.length - 1) J.push((() => D.substring(I)));
                })), D => {
                    const h = J.filter(Boolean).map((h => h(D)));
                    if (h.some((D => D instanceof Promise))) return Promise.all(h).then((D => D.filter(Boolean).join("")));
                    const z = h.join("");
                    if (z.endsWith(", initial")) return z.slice(0, -9);
                    return z;
                };
            } catch (h) {
                return (0, I.logWarn)(`Unable to parse gradient ${D}`, h), null;
            }
        }
        function S(D) {
            try {
                let h = 0;
                const z = (0, l.getMatches)(/(^|\s)(?!calc)([a-z]+\(.+?\)|#[0-9a-f]+|[a-z]+)(.*?(inset|outset)?($|,))/gi, D, 2);
                let F = 0;
                const Z = z.map(((l, Z) => {
                    const q = h, Q = D.indexOf(l, h), I = Q + l.length;
                    h = I;
                    const E = (0, j.parseColorWithCache)(l);
                    if (!E) return F++, () => D.substring(q, I);
                    return h => `${D.substring(q, Q)}${(0, A.modifyShadowColor)(E, h)}${Z === z.length - 1 ? D.substring(I) : ""}`;
                }));
                return D => {
                    const h = Z.map((h => h(D))).join("");
                    return {
                        matchesLength: z.length,
                        unparseableMatchesLength: F,
                        result: h
                    };
                };
            } catch (h) {
                return (0, I.logWarn)(`Unable to parse shadow ${D}`, h), null;
            }
        }
        function T(D) {
            const h = S(D);
            if (!h) return null;
            return D => h(D).result;
        }
        function e(D, h, z, j, F, l) {
            return D.getModifierForVariable({
                varName: h,
                sourceValue: z,
                rule: j,
                ignoredImgSelectors: F,
                isCancelled: l
            });
        }
        function v(D, h, z) {
            return D.getModifierForVarDependant(h, z);
        }
        function m() {
            (0, A.clearColorModificationCache)(), H.clear(), (0, Q.cleanImageProcessingCache)(),
            K.clear();
        }
        z.getBgImageModifier = M, z.getShadowModifierWithInfo = S, z.getShadowModifier = T,
        z.cleanModificationCache = m;
    }, {
        "9C": 23,
        n: 34,
        uN: 37,
        js: 40,
        LI: 41,
        zW: 42,
        KT: 46,
        fm: 20,
        sp: 5,
        os: 7
    } ],
    12: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.EVENT_ARG = void 0;
        const j = D("Qa"), F = D("fm"), l = D("x1");
        document.currentScript && document.currentScript.remove();
        const Z = `${l.MISC_PREFIX}ProxyInjected`, A = `${l.EVENT_PREFIX}stylesheetProxy__done`;
        z.EVENT_ARG = `${l.EVENT_PREFIX}stylesheetProxy__arg`;
        const q = !document.currentScript;
        function Q(D) {
            (0, j.injectProxy)(D), X(), document.dispatchEvent(new CustomEvent(A));
        }
        function I() {
            const D = document.currentScript.dataset.arg;
            if (D !== void 0) {
                document.documentElement.dataset[Z] = "true";
                const h = JSON.parse(D);
                (0, F.logInfo)(`MV3 proxy injector: regular path runs injectProxy(${h}).`), Q(h);
            }
        }
        function E(D) {
            if (document.removeEventListener(z.EVENT_ARG, E), document.documentElement.dataset[Z] !== void 0) return void (0,
            F.logInfo)(`MV3 proxy injector: ${q ? "registerd" : "dedicated"} path exits because everything is done.`);
            document.documentElement.dataset[Z] = "true", (0, F.logInfo)(`MV3 proxy injector: ${q ? "registerd" : "dedicated"} path runs injectProxy(${D.detail}).`),
            Q(D.detail);
        }
        function X() {
            document.removeEventListener(z.EVENT_ARG, E), document.removeEventListener(A, X);
        }
        function f() {
            (0, F.logInfo)(`MV3 proxy injector: ${q ? "registerd" : "dedicated"} path setup...`),
            document.addEventListener(z.EVENT_ARG, E), document.addEventListener(A, X);
        }
        function s() {
            if (document.documentElement.dataset[Z] !== void 0) return void (0, F.logInfo)("MV3 proxy injector: proxy exits because everything is done.");
            (0, F.logInfo)("MV3 proxy injector: proxy attempts to inject..."), document.currentScript && I(),
            f();
        }
        s();
    }, {
        x1: 2,
        fm: 20,
        Qa: 16
    } ],
    13: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.bgFetch = void 0;
        const j = D("k7");
        let F = 0;
        const l = new Map, Z = new Map;
        async function A(D) {
            return new Promise(((h, z) => {
                const A = ++F;
                l.set(A, h), Z.set(A, z), chrome.runtime.sendMessage({
                    type: j.MessageType.CS_FETCH,
                    data: D,
                    id: A
                });
            }));
        }
        z.bgFetch = A, chrome.runtime.onMessage.addListener((({type: D, data: h, error: z, id: F}) => {
            if (D === j.MessageType.BG_FETCH_RESPONSE) {
                const D = l.get(F), j = Z.get(F);
                if (l.delete(F), Z.delete(F), z) j && j(z); else D && D(h);
            }
        }));
    }, {
        k7: 38
    } ],
    14: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.manageStyle = z.cleanLoadingLinks = z.getManageableStyles = z.shouldManageStyle = z.STYLE_SELECTOR = void 0;
        const j = D("Cc"), F = D("zW"), l = D("KT"), Z = D("Dp"), A = D("fm"), q = D("sp"), Q = D("DX"), I = D("t5"), E = D("LI"), X = D("x1"), f = false;
        function s(D) {
            if (!D.href) return false;
            try {
                const h = new URL(D.href);
                return h.hostname === "fonts.googleapis.com";
            } catch (h) {
                return (0, A.logInfo)(`Couldn't construct ${D.href} as URL`), false;
            }
        }
        function L(D) {
            return (D instanceof HTMLStyleElement || D instanceof SVGStyleElement || D instanceof HTMLLinkElement && Boolean(D.rel) && D.rel.toLowerCase().includes("stylesheet") && Boolean(D.href) && !D.disabled && (E.isFirefox ? !D.href.startsWith("moz-extension://") : true) && !s(D)) && !D.classList.contains(X.STYLESHEET_COMMON_CLASSNAME) && D.media.toLowerCase() !== "print" && !D.classList.contains("stylus");
        }
        function P(D, h = [], F = true) {
            if (L(D)) h.push(D); else if (D instanceof Element || E.isShadowDomSupported && D instanceof ShadowRoot || D === document) if ((0,
            j.forEach)(D.querySelectorAll(z.STYLE_SELECTOR), (D => P(D, h, false))), F) (0,
            Z.iterateShadowHosts)(D, (D => P(D.shadowRoot, h, false)));
            return h;
        }
        z.STYLE_SELECTOR = 'style, link[rel*="stylesheet" i]:not([disabled])', z.shouldManageStyle = L,
        z.getManageableStyles = P;
        const x = new WeakSet, n = new WeakSet;
        let w = false;
        document.addEventListener(`${X.EVENT_PREFIX}inlineScriptsAllowed`, (() => {
            w = true;
        }));
        let J = 0;
        const a = new Map;
        function d() {
            a.clear();
        }
        function H(D, {update: h, loadingStart: z, loadingEnd: j}) {
            const F = [];
            let Q = D;
            while ((Q = Q.nextElementSibling) && Q.matches(`.${X.STYLESHEET_COMMON_CLASSNAME}`)) F.push(Q);
            let s = F.find((D => D.matches(X.STYLESHEET_CORS_SELECTOR) && !n.has(D))) || null, L = F.find((D => D.matches(X.STYLESHEET_SYNC_SELECTOR) && !x.has(D))) || null, P = null, d = null, H = false, c = true;
            const e = (0, I.createStyleSheetModifier)(), v = new MutationObserver((() => {
                h();
            })), m = {
                attributes: true,
                childList: true,
                subtree: true,
                characterData: true
            };
            function G() {
                return D instanceof HTMLStyleElement && D.textContent.trim().match(q.cssImportRegex);
            }
            function r(D, h) {
                let z = false;
                if (D) {
                    let j;
                    D: for (let F = 0, l = D.length; F < l; F++) if (j = D[F], j.href) if (h) {
                        if (!j.href.startsWith("https://fonts.googleapis.com/") && j.href.startsWith("http") && !j.href.startsWith(location.origin)) {
                            z = true;
                            break D;
                        }
                    } else {
                        z = true;
                        break D;
                    }
                }
                return z;
            }
            function t() {
                if (s) return (0, A.logInfo)("[getRulesSync] Using cors-copy."), s.sheet.cssRules;
                if (G()) return (0, A.logInfo)("[getRulesSync] CSSImport detected."), null;
                const h = Y();
                if (D instanceof HTMLLinkElement && !(0, l.isRelativeHrefOnAbsolutePath)(D.href) && r(h, false)) return (0,
                A.logInfo)("[getRulesSync] CSSImportRule detected on non-local href."), null;
                if (r(h, true)) return (0, A.logInfo)("[getRulesSync] Cross-Origin CSSImportRule detected."),
                null;
                return (0, A.logInfo)("[getRulesSync] Using cssRules."), !h && (0, A.logWarn)("[getRulesSync] cssRules is null, trying again."),
                h;
            }
            function C() {
                if (s) {
                    if (D.nextSibling !== s) D.parentNode.insertBefore(s, D.nextSibling);
                    if (s.nextSibling !== L) D.parentNode.insertBefore(L, s.nextSibling);
                } else if (D.nextSibling !== L) D.parentNode.insertBefore(L, D.nextSibling);
            }
            function y() {
                if (L = D instanceof SVGStyleElement ? document.createElementNS("http://www.w3.org/2000/svg", "style") : document.createElement("style"),
                L.classList.add(X.STYLESHEET_COMMON_CLASSNAME), L.classList.add(X.STYLESHEET_SYNC_SELECTOR.substring(1)),
                L.media = "screen", D.title) L.title = D.title;
                x.add(L);
            }
            let k = false, W = false;
            const U = ++J;
            async function p() {
                let h, z;
                if (D instanceof HTMLLinkElement) {
                    let [j, F] = b();
                    if (F) (0, A.logWarn)(F);
                    if (!j && !F && !E.isSafari || E.isSafari && !D.sheet || B(F)) {
                        try {
                            (0, A.logInfo)(`Linkelement ${U} is not loaded yet and thus will be await for`, D),
                            await K(D, U);
                        } catch (D) {
                            (0, A.logWarn)(D), W = true;
                        }
                        if (H) return null;
                        if ([j, F] = b(), F) (0, A.logWarn)(F);
                    }
                    if (j) if (!r(j, false)) return j;
                    if (h = await M(D.href), z = (0, q.getCSSBaseBath)(D.href), H) return null;
                } else if (G()) h = D.textContent.trim(), z = (0, q.getCSSBaseBath)(location.href); else return null;
                if (h) {
                    try {
                        const j = await S(h, z);
                        s = T(D, j);
                    } catch (D) {
                        (0, A.logWarn)(D);
                    }
                    if (s) return P = (0, Z.watchForNodePosition)(s, "prev-sibling"), s.sheet.cssRules;
                }
                return null;
            }
            function u(D) {
                const F = t();
                if (!F) {
                    if (D.secondRound) return (0, A.logWarn)("Detected dead-lock at details(), returning early to prevent it."),
                    null;
                    if (k || W) return null;
                    return k = true, z(), p().then((D => {
                        if (k = false, j(), D) h();
                    })).catch((D => {
                        (0, A.logWarn)(D), k = false, j();
                    })), null;
                }
                return {
                    rules: F
                };
            }
            let O = false;
            function o(D, z) {
                const j = t();
                if (!j) return;
                function F(D) {
                    if (!D) return;
                    for (let h = D.cssRules.length - 1; h >= 0; h--) D.deleteRule(h);
                }
                function l() {
                    if (!L) y();
                    if (d && d.stop(), C(), L.sheet == null) L.textContent = "";
                    const D = L.sheet;
                    if (F(D), d) d.run(); else d = (0, Z.watchForNodePosition)(L, "prev-sibling", (() => {
                        O = true, A();
                    }));
                    return L.sheet;
                }
                function A() {
                    const F = O;
                    if (O = false, e.modifySheet({
                        prepareSheet: l,
                        sourceCSSRules: j,
                        theme: D,
                        ignoreImageAnalysis: z,
                        force: F,
                        isAsyncCancelled: () => H
                    }), c = L.sheet.cssRules.length === 0, e.shouldRebuildStyle()) (0, Z.addReadyStateCompleteListener)((() => h()));
                }
                H = false, A();
            }
            function b() {
                try {
                    if (D.sheet == null) return [ null, null ];
                    return [ D.sheet.cssRules, null ];
                } catch (D) {
                    return [ null, D ];
                }
            }
            function B(D) {
                return D && D.message && D.message.includes("loading");
            }
            function Y() {
                const [D, h] = b();
                if (h) return (0, A.logWarn)(h), null;
                return D;
            }
            function R() {
                if (LD(), !f && !(w && D.sheet)) kN();
            }
            let V = null, i = null;
            function g() {
                const D = Y();
                return D ? D.length : null;
            }
            function N() {
                return g() !== V;
            }
            function kN() {
                V = g(), Ar();
                const z = () => {
                    if (N()) V = g(), h();
                    if (w && D.sheet) return void Ar();
                    i = requestAnimationFrame(z);
                };
                z();
            }
            function Ar() {
                cancelAnimationFrame(i);
            }
            let qk = false;
            function xk() {
                if (w = true, Ar(), qk) return;
                function D() {
                    if (qk = false, H) return;
                    h();
                }
                if (qk = true, typeof queueMicrotask === "function") queueMicrotask(D); else requestAnimationFrame(D);
            }
            function LD() {
                D.addEventListener(`${X.EVENT_PREFIX}updateSheet`, xk);
            }
            function hO() {
                D.removeEventListener(`${X.EVENT_PREFIX}updateSheet`, xk);
            }
            function VB() {
                hO(), Ar();
            }
            function zi() {
                v.disconnect(), H = true, P && P.stop(), d && d.stop(), VB();
            }
            function dj() {
                if (zi(), (0, Z.removeNode)(s), (0, Z.removeNode)(L), j(), a.has(U)) {
                    const D = a.get(U);
                    a.delete(U), D && D();
                }
            }
            function Su() {
                if (v.observe(D, m), D instanceof HTMLStyleElement) R();
            }
            const Cv = 10;
            let Oq = 0;
            function rB() {
                if (!L) return;
                if (Oq++, Oq > Cv) return void (0, A.logWarn)("Style sheet was moved multiple times", D);
                if ((0, A.logWarn)("Restore style", L, D), C(), P && P.skip(), d && d.skip(), !c) O = true,
                h();
            }
            return {
                details: u,
                render: o,
                pause: zi,
                destroy: dj,
                watch: Su,
                restore: rB
            };
        }
        async function K(D, h) {
            return new Promise(((z, j) => {
                const F = () => {
                    D.removeEventListener("load", l), D.removeEventListener("error", Z), a.delete(h);
                }, l = () => {
                    F(), (0, A.logInfo)(`Linkelement ${h} has been loaded`), z();
                }, Z = () => {
                    F(), j(`Linkelement ${h} couldn't be loaded. ${D.href}`);
                };
                if (a.set(h, (() => {
                    F(), j();
                })), D.addEventListener("load", l), D.addEventListener("error", Z), !D.href) Z();
            }));
        }
        function c(D) {
            return (0, q.getCSSURLValue)(D.substring(7).trim().replace(/;$/, "").replace(/screen$/, ""));
        }
        async function M(D) {
            if (D.startsWith("data:")) return await (await fetch(D)).text();
            return await (0, Q.bgFetch)({
                url: D,
                responseType: "text",
                mimeType: "text/css",
                origin: window.location.origin
            });
        }
        async function S(D, h, z = new Map) {
            D = (0, q.removeCSSComments)(D), D = (0, q.replaceCSSFontFace)(D), D = (0, q.replaceCSSRelativeURLsWithAbsolute)(D, h);
            const j = (0, F.getMatches)(q.cssImportRegex, D);
            for (const F of j) {
                const j = c(F), Z = (0, l.getAbsoluteURL)(h, j);
                let Q;
                if (z.has(Z)) Q = z.get(Z); else try {
                    Q = await M(Z), z.set(Z, Q), Q = await S(Q, (0, q.getCSSBaseBath)(Z), z);
                } catch (D) {
                    (0, A.logWarn)(D), Q = "";
                }
                D = D.split(F).join(Q);
            }
            return D = D.trim(), D;
        }
        function T(D, h) {
            if (!h) return null;
            const z = document.createElement("style");
            return z.classList.add(X.STYLESHEET_COMMON_CLASSNAME), z.classList.add(X.STYLESHEET_CORS_SELECTOR.substring(1)),
            z.media = "screen", z.textContent = h, D.parentNode.insertBefore(z, D.nextSibling),
            z.sheet.disabled = true, n.add(z), z;
        }
        z.cleanLoadingLinks = d, z.manageStyle = H;
    }, {
        x1: 2,
        Cc: 31,
        LI: 41,
        zW: 42,
        KT: 46,
        Dp: 19,
        fm: 20,
        sp: 5,
        DX: 13,
        t5: 15
    } ],
    15: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.createStyleSheetModifier = void 0;
        const j = D("aP"), F = D("sp"), l = D("Cp"), Z = D("MV"), A = [ "mode", "brightness", "contrast", "grayscale", "sepia", "darkSchemeBackgroundColor", "darkSchemeTextColor", "lightSchemeBackgroundColor", "lightSchemeTextColor" ];
        function q(D) {
            let h = "";
            return A.forEach((z => {
                h += `${z}:${D[z]};`;
            })), h;
        }
        const Q = (0, j.createAsyncTasksQueue)();
        function I() {
            let D = 0;
            const h = new Set, z = new Map, j = new Set;
            let A = null, I = false, E = false;
            function X() {
                return I && !E;
            }
            function f(X) {
                const f = X.sourceCSSRules, {theme: s, ignoreImageAnalysis: L, force: P, prepareSheet: x, isAsyncCancelled: n} = X;
                let w = z.size === 0;
                const J = new Set(z.keys()), a = q(s), d = a !== A;
                if (I) E = true;
                const H = [];
                if ((0, F.iterateCSSRules)(f, (D => {
                    let j = D.cssText, A = false;
                    // Identical rule text can live under different @media/@layer/@container/nesting
                    // parents, so the whole ancestor chain has to be part of the cache key.
                    for (let h = D.parentRule; h; h = h.parentRule) j += `;${h.media ? h.media.mediaText : h.conditionText || h.selectorText || h.name || h.start || ""}`;
                    J.delete(j);
                    if (!h.has(j)) h.add(j), A = true;
                    if (A) w = true; else return void H.push(z.get(j));
                    if (D.style.all === "revert") return;
                    const q = [];
                    D.style && (0, F.iterateCSSDeclarations)(D.style, ((h, z) => {
                        const j = (0, l.getModifiableCSSDeclaration)(h, z, D, Z.variablesStore, L, n);
                        if (j) q.push(j);
                    }));
                    let Q = null;
                    if (q.length > 0) {
                        const h = D.parentRule;
                        Q = {
                            selector: D.selectorText,
                            declarations: q,
                            parentRule: h
                        }, H.push(Q);
                    }
                    z.set(j, Q);
                }), (() => {
                    I = true;
                })), J.forEach((D => {
                    h.delete(D), z.delete(D);
                })), A = a, !P && !w && !d) return;
                function K(D, h, z) {
                    const {selector: j, declarations: F} = z, l = D => {
                        const {property: h, value: z, important: j, sourceValue: F} = D;
                        return `${h}: ${z == null ? F : z}${j ? " !important" : ""};`;
                    };
                    let Z = "";
                    F.forEach((D => {
                        Z += `${l(D)} `;
                    }));
                    const A = `${j} { ${Z} }`;
                    D.insertRule(A, h);
                }
                D++;
                const c = new Map, M = new Map;
                let S = 0, T = 0;
                const e = {
                    rule: null,
                    rules: [],
                    isGroup: true
                }, v = new WeakMap;
                function m(D) {
                    if (D == null) return e;
                    if (v.has(D)) return v.get(D);
                    const h = {
                        rule: D,
                        rules: [],
                        isGroup: true
                    };
                    v.set(D, h);
                    const z = m(D.parentRule);
                    return z.rules.push(h), h;
                }
                j.forEach((D => D())), j.clear(), H.filter((D => D)).forEach((({selector: h, declarations: z, parentRule: F}) => {
                    const l = m(F), Z = {
                        selector: h,
                        declarations: [],
                        isGroup: false
                    }, A = Z.declarations;
                    function q(h, z, j, F) {
                        const l = ++S, Z = {
                            property: h,
                            value: null,
                            important: j,
                            asyncKey: l,
                            sourceValue: F
                        };
                        A.push(Z);
                        const q = D;
                        z.then((h => {
                            if (!h || n() || q !== D) return;
                            Z.value = h, Q.add((() => {
                                if (n() || q !== D) return;
                                t(l);
                            }));
                        }));
                    }
                    function I(h, z, F, l) {
                        const {declarations: Z, onTypeChange: Q} = z, I = ++T, E = D, X = A.length;
                        let f = [];
                        if (Z.length === 0) {
                            const D = {
                                property: h,
                                value: l,
                                important: F,
                                sourceValue: l,
                                varKey: I
                            };
                            A.push(D), f = [ D ];
                        }
                        Z.forEach((D => {
                            if (D.value instanceof Promise) q(D.property, D.value, F, l); else {
                                const h = {
                                    property: D.property,
                                    value: D.value,
                                    important: F,
                                    sourceValue: l,
                                    varKey: I
                                };
                                A.push(h), f.push(h);
                            }
                        })), Q.addListener((h => {
                            if (n() || E !== D) return;
                            const z = h.map((D => ({
                                property: D.property,
                                value: D.value,
                                important: F,
                                sourceValue: l,
                                varKey: I
                            }))), j = A.indexOf(f[0], X);
                            A.splice(j, f.length, ...z), f = z, C(I);
                        })), j.add((() => Q.removeListeners()));
                    }
                    l.rules.push(Z), z.forEach((({property: D, value: h, important: z, sourceValue: j}) => {
                        if (typeof h === "function") {
                            const F = h(s);
                            if (F instanceof Promise) q(D, F, z, j); else if (D.startsWith("--")) I(D, F, z, j); else A.push({
                                property: D,
                                value: F,
                                important: z,
                                sourceValue: j
                            });
                        } else A.push({
                            property: D,
                            value: h,
                            important: z,
                            sourceValue: j
                        });
                    }));
                }));
                const G = x();
                function r() {
                    function D(D, h) {
                        const {rule: z} = D, j = h.cssRules.length, F = D => (h.insertRule(D, j), h.cssRules[j]);
                        try {
                            if (z instanceof CSSMediaRule) return F(`@media ${z.media.mediaText} {}`);
                            if (typeof CSSContainerRule !== "undefined" && z instanceof CSSContainerRule) return F(`@container ${z.conditionText} {}`);
                            if (typeof CSSSupportsRule !== "undefined" && z instanceof CSSSupportsRule) return F(`@supports ${z.conditionText} {}`);
                            if (typeof CSSScopeRule !== "undefined" && z instanceof CSSScopeRule) return F(`@scope${z.start ? ` (${z.start})` : ""}${z.end ? ` to (${z.end})` : ""} {}`);
                            if (typeof CSSStartingStyleRule !== "undefined" && z instanceof CSSStartingStyleRule) return F("@starting-style {}");
                            // Overrides join the original layer by name: inside one layer the later sheet wins for
                            // both normal and !important declarations, whereas an unlayered !important override
                            // would lose to a layered one (important declarations reverse the layer order).
                            if (typeof CSSLayerBlockRule !== "undefined" && z instanceof CSSLayerBlockRule && z.name) return F(`@layer ${z.name} {}`);
                            // Nested rules keep their parent so relative selectors ("& .x") stay valid.
                            if (z instanceof CSSStyleRule) return F(`${z.selectorText} {}`);
                        } catch (D) {}
                        // Anonymous @layer blocks cannot be re-joined and are flattened into the parent.
                        return h;
                    }
                    function h(z, j, F) {
                        z.rules.forEach((z => {
                            if (z.isGroup) {
                                const l = D(z, j);
                                h(z, l, F);
                            } else F(z, j);
                        }));
                    }
                    h(e, G, ((D, h) => {
                        const z = h.cssRules.length;
                        D.declarations.forEach((({asyncKey: j, varKey: F}) => {
                            if (j != null) c.set(j, {
                                rule: D,
                                target: h,
                                index: z
                            });
                            if (F != null) M.set(F, {
                                rule: D,
                                target: h,
                                index: z
                            });
                        })), K(h, z, D);
                    }));
                }
                function t(D) {
                    const {rule: h, target: z, index: j} = c.get(D);
                    z.deleteRule(j), K(z, j, h), c.delete(D);
                }
                function C(D) {
                    const {rule: h, target: z, index: j} = M.get(D);
                    z.deleteRule(j), K(z, j, h);
                }
                r();
            }
            return {
                modifySheet: f,
                shouldRebuildStyle: X
            };
        }
        z.createStyleSheetModifier = I;
    }, {
        aP: 43,
        sp: 5,
        Cp: 11,
        MV: 17
    } ],
    16: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.injectProxy = void 0;
        const j = D("x1");
        function F(D) {
            document.dispatchEvent(new CustomEvent(`${j.EVENT_PREFIX}inlineScriptsAllowed`));
            const h = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, "addRule"), z = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, "insertRule"), F = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, "deleteRule"), l = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, "removeRule"), Z = D ? Object.getOwnPropertyDescriptor(Document.prototype, "styleSheets") : null, A = [ "baidu.com", "baike.baidu.com", "ditu.baidu.com", "map.baidu.com", "maps.baidu.com", "haokan.baidu.com", "pan.baidu.com", "passport.baidu.com", "tieba.baidu.com", "www.baidu.com" ].includes(location.hostname), q = A ? Object.getOwnPropertyDescriptor(Element.prototype, "getElementsByTagName") : null, Q = location.hostname === "www.vy.no", I = Q ? Object.getOwnPropertyDescriptor(Node.prototype, "childNodes") : null, E = () => {
                if (Object.defineProperty(CSSStyleSheet.prototype, "addRule", h), Object.defineProperty(CSSStyleSheet.prototype, "insertRule", z),
                Object.defineProperty(CSSStyleSheet.prototype, "deleteRule", F), Object.defineProperty(CSSStyleSheet.prototype, "removeRule", l),
                document.removeEventListener(`${j.EVENT_PREFIX}cleanUp`, E), document.removeEventListener(`${j.EVENT_PREFIX}addUndefinedResolver`, X),
                D) Object.defineProperty(Document.prototype, "styleSheets", Z);
                if (A) Object.defineProperty(Element.prototype, "getElementsByTagName", q);
                if (Q) Object.defineProperty(Node.prototype, "childNodes", I);
            }, X = D => {
                customElements.whenDefined(D.detail.tag).then((() => {
                    document.dispatchEvent(new CustomEvent(`${j.EVENT_PREFIX}isDefined`, {
                        detail: {
                            tag: D.detail.tag
                        }
                    }));
                }));
            };
            document.addEventListener(j.MSG_CLEANUP, E), document.addEventListener(`${j.EVENT_PREFIX}addUndefinedResolver`, X);
            const f = new Event(`${j.EVENT_PREFIX}updateSheet`);
            function s(D, z, F) {
                if (h.value.call(this, D, z, F), this.ownerNode && !this.ownerNode.classList.contains(j.STYLESHEET_COMMON_CLASSNAME)) this.ownerNode.dispatchEvent(f);
                return -1;
            }
            function L(D, h) {
                const F = z.value.call(this, D, h);
                if (this.ownerNode && !this.ownerNode.classList.contains(j.STYLESHEET_COMMON_CLASSNAME)) this.ownerNode.dispatchEvent(f);
                return F;
            }
            function P(D) {
                if (F.value.call(this, D), this.ownerNode && !this.ownerNode.classList.contains(j.STYLESHEET_COMMON_CLASSNAME)) this.ownerNode.dispatchEvent(f);
            }
            function x(D) {
                if (l.value.call(this, D), this.ownerNode && !this.ownerNode.classList.contains(j.STYLESHEET_COMMON_CLASSNAME)) this.ownerNode.dispatchEvent(f);
            }
            function n() {
                const D = () => {
                    const D = Z.get.call(this), h = [ ...D ].filter((D => D.ownerNode && !D.ownerNode.classList.contains(j.STYLESHEET_COMMON_CLASSNAME)));
                    return h.item = D => h[D], Object.setPrototypeOf(h, StyleSheetList.prototype);
                };
                let h = D();
                const z = {
                    get: function(h, z) {
                        return D()[z];
                    }
                };
                return h = new Proxy(h, z), h;
            }
            function w(D) {
                if (D !== "style") return q.value.call(this, D);
                const h = () => {
                    const h = q.value.call(this, D);
                    return Object.setPrototypeOf([ ...h ].filter((D => !D.classList.contains(j.STYLESHEET_COMMON_CLASSNAME))), NodeList.prototype);
                };
                let z = h();
                const F = {
                    get: function(D, z) {
                        return h()[Number(z) || z];
                    }
                };
                return z = new Proxy(z, F), z;
            }
            function J() {
                const D = I.get.call(this);
                return Object.setPrototypeOf([ ...D ].filter((D => !D.classList || !D.classList.contains(j.STYLESHEET_COMMON_CLASSNAME))), NodeList.prototype);
            }
            if (Object.defineProperty(CSSStyleSheet.prototype, "addRule", Object.assign({}, h, {
                value: s
            })), Object.defineProperty(CSSStyleSheet.prototype, "insertRule", Object.assign({}, z, {
                value: L
            })), Object.defineProperty(CSSStyleSheet.prototype, "deleteRule", Object.assign({}, F, {
                value: P
            })), Object.defineProperty(CSSStyleSheet.prototype, "removeRule", Object.assign({}, l, {
                value: x
            })), D) Object.defineProperty(Document.prototype, "styleSheets", Object.assign({}, Z, {
                get: n
            }));
            if (A) Object.defineProperty(Element.prototype, "getElementsByTagName", Object.assign({}, q, {
                value: w
            }));
            if (Q) Object.defineProperty(Node.prototype, "childNodes", Object.assign({}, I, {
                get: J
            }));
        }
        z.injectProxy = F;
    }, {
        x1: 2
    } ],
    17: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.replaceCSSVariablesNames = z.variablesStore = z.VariablesStore = void 0;
        const j = D("9C"), F = D("zW"), l = D("sp"), Z = D("Cp"), A = D("n"), q = D("x1"), Q = 1 << 0, I = 1 << 1, E = 1 << 2, X = 1 << 3;
        class f {
            constructor() {
                this.varTypes = new Map, this.rulesQueue = [], this.definedVars = new Set, this.varRefs = new Map,
                this.unknownColorVars = new Set, this.unknownBgVars = new Set, this.undefinedVars = new Set,
                this.initialVarTypes = new Map, this.changedTypeVars = new Set, this.typeChangeSubscriptions = new Map,
                this.unstableVarValues = new Map;
            }
            clear() {
                this.varTypes.clear(), this.rulesQueue.splice(0), this.definedVars.clear(), this.varRefs.clear(),
                this.unknownColorVars.clear(), this.unknownBgVars.clear(), this.undefinedVars.clear(),
                this.initialVarTypes.clear(), this.changedTypeVars.clear(), this.typeChangeSubscriptions.clear(),
                this.unstableVarValues.clear();
            }
            isVarType(D, h) {
                return this.varTypes.has(D) && (this.varTypes.get(D) & h) > 0;
            }
            addRulesForMatching(D) {
                this.rulesQueue.push(D);
            }
            matchVariablesAndDependants() {
                this.changedTypeVars.clear(), this.initialVarTypes = new Map(this.varTypes), this.collectRootVariables(),
                this.collectVariablesAndVarDep(this.rulesQueue), this.rulesQueue.splice(0), this.collectRootVarDependants(),
                this.varRefs.forEach(((D, h) => {
                    D.forEach((D => {
                        if (this.varTypes.has(h)) this.resolveVariableType(D, this.varTypes.get(h));
                    }));
                })), this.unknownColorVars.forEach((D => {
                    if (this.unknownBgVars.has(D)) this.unknownColorVars.delete(D), this.unknownBgVars.delete(D),
                    this.resolveVariableType(D, Q); else if (this.isVarType(D, Q | I | E)) this.unknownColorVars.delete(D); else this.undefinedVars.add(D);
                })), this.unknownBgVars.forEach((D => {
                    const h = this.findVarRef(D, (D => this.unknownColorVars.has(D) || this.isVarType(D, I | E))) != null;
                    if (h) this.itarateVarRefs(D, (D => {
                        this.resolveVariableType(D, Q);
                    })); else if (this.isVarType(D, Q | X)) this.unknownBgVars.delete(D); else this.undefinedVars.add(D);
                })), this.changedTypeVars.forEach((D => {
                    if (this.typeChangeSubscriptions.has(D)) this.typeChangeSubscriptions.get(D).forEach((D => {
                        D();
                    }));
                })), this.changedTypeVars.clear();
            }
            getModifierForVariable(D) {
                return h => {
                    const {varName: z, sourceValue: j, rule: F, ignoredImgSelectors: l, isCancelled: A} = D, q = () => {
                        const D = [], q = (F, l, Z) => {
                            if (!this.isVarType(z, F)) return;
                            const A = l(z);
                            let q;
                            if (c(j)) if (M(j)) {
                                let D = t(j, this.unstableVarValues);
                                if (!D) D = F === Q ? "#ffffff" : "#000000";
                                q = Z(D, h);
                            } else q = n(j, (D => l(D)), (D => Z(D, h))); else q = Z(j, h);
                            D.push({
                                property: A,
                                value: q
                            });
                        };
                        if (q(Q, J, m), q(I, a, G), q(E, d, r), this.isVarType(z, X)) {
                            const q = H(z);
                            let Q = j;
                            if (c(j)) Q = n(j, (D => J(D)), (D => m(D, h)));
                            const I = (0, Z.getBgImageModifier)(Q, F, l, A);
                            Q = typeof I === "function" ? I(h) : I, D.push({
                                property: q,
                                value: Q
                            });
                        }
                        return D;
                    }, f = new Set, s = D => {
                        const h = () => {
                            const h = q();
                            D(h);
                        };
                        f.add(h), this.subscribeForVarTypeChange(z, h);
                    }, L = () => {
                        f.forEach((D => {
                            this.unsubscribeFromVariableTypeChanges(z, D);
                        }));
                    };
                    return {
                        declarations: q(),
                        onTypeChange: {
                            addListener: s,
                            removeListeners: L
                        }
                    };
                };
            }
            getModifierForVarDependant(D, h) {
                if (h.match(/^\s*(rgb|hsl)a?\(/)) {
                    const z = D.startsWith("background"), j = S(D);
                    return D => {
                        let F = t(h, this.unstableVarValues);
                        if (!F) F = z ? "#ffffff" : "#000000";
                        const l = z ? m : j ? G : r;
                        return l(F, D);
                    };
                }
                if (D === "background-color") return D => n(h, (D => J(D)), (h => m(h, D)));
                if (S(D)) return D => n(h, (D => a(D)), (h => G(h, D)));
                if (D === "background" || D === "background-image" || D === "box-shadow") return z => {
                    const j = new Set, isBgShorthand = D === "background", G = () => {
                        const F = n(h, (D => {
                            if (this.isVarType(D, Q)) return J(D);
                            if (this.isVarType(D, X)) return H(D);
                            // A bare `background: var(--x)` is almost always a colour. Renaming it to the
                            // background twin right away avoids missing the classification window; when the
                            // twin never materialises the declaration degrades to transparent, which the
                            // dark root canvas renders safely.
                            if (isBgShorthand) return j.add(D), J(D);
                            return j.add(D), D;
                        }), (D => m(D, z)));
                        if (D === "box-shadow") {
                            const D = (0, Z.getShadowModifierWithInfo)(F), h = D(z);
                            if (h.unparseableMatchesLength !== h.matchesLength) return h.result;
                        }
                        return F;
                    }, l = G();
                    if (j.size > 0) return new Promise((D => {
                        const h = j.values().next().value, z = () => {
                            this.unsubscribeFromVariableTypeChanges(h, z);
                            const j = G();
                            D(j);
                        };
                        this.subscribeForVarTypeChange(h, z);
                    }));
                    return l;
                };
                if (D.startsWith("border") || D.startsWith("outline")) return D => n(h, (D => d(D)), (h => r(h, D)));
                return null;
            }
            subscribeForVarTypeChange(D, h) {
                if (!this.typeChangeSubscriptions.has(D)) this.typeChangeSubscriptions.set(D, new Set);
                const z = this.typeChangeSubscriptions.get(D);
                if (!z.has(h)) z.add(h);
            }
            unsubscribeFromVariableTypeChanges(D, h) {
                if (this.typeChangeSubscriptions.has(D)) this.typeChangeSubscriptions.get(D).delete(h);
            }
            collectVariablesAndVarDep(D) {
                D.forEach((D => {
                    (0, l.iterateCSSRules)(D, (D => {
                        D.style && (0, l.iterateCSSDeclarations)(D.style, ((D, h) => {
                            if (K(D)) this.inspectVariable(D, h);
                            if (c(h)) this.inspectVarDependant(D, h);
                        }));
                    }));
                }));
            }
            collectRootVariables() {
                (0, l.iterateCSSDeclarations)(document.documentElement.style, ((D, h) => {
                    if (K(D)) this.inspectVariable(D, h);
                }));
            }
            inspectVariable(D, h) {
                if (this.unstableVarValues.set(D, h), c(h) && M(h)) this.unknownColorVars.add(D),
                this.definedVars.add(D);
                if (this.definedVars.has(D)) return;
                this.definedVars.add(D);
                const z = T.test(h) || (0, A.parseColorWithCache)(h);
                if (z) this.unknownColorVars.add(D); else if (h.includes("url(") || h.includes("linear-gradient(") || h.includes("radial-gradient(")) this.resolveVariableType(D, X);
            }
            resolveVariableType(D, h) {
                const z = this.initialVarTypes.get(D) || 0, j = this.varTypes.get(D) || 0, F = j | h;
                if (this.varTypes.set(D, F), F !== z || this.undefinedVars.has(D)) this.changedTypeVars.add(D),
                this.undefinedVars.delete(D);
                this.unknownColorVars.delete(D), this.unknownBgVars.delete(D);
            }
            collectRootVarDependants() {
                (0, l.iterateCSSDeclarations)(document.documentElement.style, ((D, h) => {
                    if (c(h)) this.inspectVarDependant(D, h);
                }));
            }
            inspectVarDependant(D, h) {
                if (K(D)) this.iterateVarDeps(h, (h => {
                    if (!this.varRefs.has(D)) this.varRefs.set(D, new Set);
                    this.varRefs.get(D).add(h);
                })); else if (D === "background-color" || D === "box-shadow") this.iterateVarDeps(h, (D => this.resolveVariableType(D, Q))); else if (S(D)) this.iterateVarDeps(h, (D => this.resolveVariableType(D, I))); else if (D.startsWith("border") || D.startsWith("outline")) this.iterateVarDeps(h, (D => this.resolveVariableType(D, E))); else if (D === "background" || D === "background-image") this.iterateVarDeps(h, (D => {
                    if (this.isVarType(D, Q | X)) return;
                    const h = this.findVarRef(D, (D => this.unknownColorVars.has(D) || this.isVarType(D, I | E))) != null;
                    this.itarateVarRefs(D, (D => {
                        if (h) this.resolveVariableType(D, Q); else this.unknownBgVars.add(D);
                    }));
                }));
            }
            iterateVarDeps(D, h) {
                const z = new Set;
                w(D, (D => z.add(D))), z.forEach((D => h(D)));
            }
            findVarRef(D, h, z = new Set) {
                if (z.has(D)) return null;
                z.add(D);
                const j = h(D);
                if (j) return D;
                const F = this.varRefs.get(D);
                if (!F || F.size === 0) return null;
                for (const D of F) {
                    const j = this.findVarRef(D, h, z);
                    if (j) return j;
                }
                return null;
            }
            itarateVarRefs(D, h) {
                this.findVarRef(D, (D => (h(D), false)));
            }
            setOnRootVariableChange(D) {
                this.onRootVariableDefined = D;
            }
            putRootVars(D, h) {
                const z = D.sheet;
                if (z.cssRules.length > 0) z.deleteRule(0);
                const j = new Map;
                (0, l.iterateCSSDeclarations)(document.documentElement.style, ((D, z) => {
                    if (K(D)) {
                        if (this.isVarType(D, Q)) j.set(J(D), m(z, h));
                        if (this.isVarType(D, I)) j.set(a(D), G(z, h));
                        if (this.isVarType(D, E)) j.set(d(D), r(z, h));
                        this.subscribeForVarTypeChange(D, this.onRootVariableDefined);
                    }
                }));
                const F = [];
                F.push(":root {");
                for (const [D, h] of j) F.push(`    ${D}: ${h};`);
                F.push("}");
                const Z = F.join("\n");
                z.insertRule(Z);
            }
        }
        function s(D, h = 0) {
            const z = D.indexOf("var(", h);
            if (z >= 0) {
                const h = (0, F.getParenthesesRange)(D, z + 3);
                if (h) return {
                    start: z,
                    end: h.end
                };
            }
            return null;
        }
        function L(D) {
            const h = [];
            let z = 0, j;
            while (j = s(D, z)) {
                const {start: F, end: l} = j;
                h.push({
                    start: F,
                    end: l,
                    value: D.substring(F, l)
                }), z = j.end + 1;
            }
            return h;
        }
        function P(D, h) {
            const z = L(D), j = z.length;
            if (j === 0) return D;
            const F = D.length, l = z.map((D => h(D.value))), Z = [];
            Z.push(D.substring(0, z[0].start));
            for (let h = 0; h < j; h++) {
                Z.push(l[h]);
                const A = z[h].end, q = h < j - 1 ? z[h + 1].start : F;
                Z.push(D.substring(A, q));
            }
            return Z.join("");
        }
        function x(D) {
            const h = D.indexOf(",");
            let z, j;
            if (h >= 0) z = D.substring(4, h).trim(), j = D.substring(h + 1, D.length - 1).trim(); else z = D.substring(4, D.length - 1).trim(),
            j = "";
            return {
                name: z,
                fallback: j
            };
        }
        function n(D, h, z) {
            const j = D => {
                const {name: j, fallback: F} = x(D), l = h(j);
                if (!F) return `var(${l})`;
                let Z;
                if (c(F)) Z = n(F, h, z); else if (z) Z = z(F); else Z = F;
                return `var(${l}, ${Z})`;
            };
            return P(D, j);
        }
        function w(D, h) {
            n(D, (D => (h(D), D)));
        }
        function J(D) {
            return `--${q.ROOT_VARS_PREFIX}-bg${D}`;
        }
        function a(D) {
            return `--${q.ROOT_VARS_PREFIX}-text${D}`;
        }
        function d(D) {
            return `--${q.ROOT_VARS_PREFIX}-border${D}`;
        }
        function H(D) {
            return `--${q.ROOT_VARS_PREFIX}-bgimg${D}`;
        }
        function K(D) {
            return D.startsWith("--");
        }
        function c(D) {
            return D.includes("var(");
        }
        function M(D) {
            return D.match(/^\s*(rgb|hsl)a?\(/);
        }
        function S(D) {
            return D === "color" || D === "caret-color" || D === "-webkit-text-fill-color";
        }
        z.VariablesStore = f, z.variablesStore = new f, z.replaceCSSVariablesNames = n;
        const T = /^\d{1,3}, ?\d{1,3}, ?\d{1,3}$/;
        function e(D) {
            if (T.test(D)) {
                const h = D.split(",");
                let z = "rgb(";
                return h.forEach((D => {
                    z += `${D.trim()}, `;
                })), z = z.substring(0, z.length - 2), z += ")", {
                    isRaw: true,
                    color: z
                };
            }
            return {
                isRaw: false,
                color: D
            };
        }
        function v(D, h, z) {
            const {isRaw: j, color: F} = e(D), l = (0, A.parseColorWithCache)(F);
            if (l) {
                const D = z(l, h);
                if (j) {
                    const h = (0, A.parseColorWithCache)(D);
                    return h ? `${h.r}, ${h.g}, ${h.b}` : D;
                }
                return D;
            }
            return F;
        }
        function m(D, h) {
            return v(D, h, j.modifyBackgroundColor);
        }
        function G(D, h) {
            return v(D, h, j.modifyForegroundColor);
        }
        function r(D, h) {
            return v(D, h, j.modifyBorderColor);
        }
        function t(D, h, z = new Set) {
            let j = false;
            const F = D => {
                const {name: F, fallback: l} = x(D);
                if (z.has(F)) return j = true, null;
                z.add(F);
                const Z = h.get(F) || l;
                let A = null;
                if (Z) if (c(Z)) A = t(Z, h, z); else A = Z;
                if (!A) return j = true, null;
                return A;
            }, l = P(D, F);
            if (j) return null;
            return l;
        }
    }, {
        x1: 2,
        "9C": 23,
        n: 34,
        zW: 42,
        sp: 5,
        Cp: 11
    } ],
    18: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.stopWatchingForStyleChanges = z.watchForStyleChanges = void 0;
        const j = D("Cc"), F = D("Dp"), l = D("Jd"), Z = D("LI"), A = D("x1"), q = [];
        let Q;
        const I = new Map;
        let E;
        function X(D) {
            if (!Z.isDefinedSelectorSupported) return;
            (0, j.forEach)(D.querySelectorAll(":not(:defined)"), (D => {
                let h = D.tagName.toLowerCase();
                if (!h.includes("-")) {
                    const z = D.getAttribute("is");
                    if (z) h = z; else return;
                }
                if (!I.has(h)) I.set(h, new Set), P(h).then((() => {
                    if (E) {
                        const D = I.get(h);
                        I.delete(h), E(Array.from(D));
                    }
                }));
                I.get(h).add(D);
            }));
        }
        let f = false;
        document.addEventListener(`${A.EVENT_PREFIX}inlineScriptsAllowed`, (() => {
            f = true;
        }));
        const s = new Map;
        function L(D) {
            if (f = true, s.has(D.detail.tag)) {
                const h = s.get(D.detail.tag);
                h();
            }
        }
        async function P(D) {
            return new Promise((h => {
                if (window.customElements && typeof customElements.whenDefined === "function") customElements.whenDefined(D).then((() => h())); else {
                    const z = () => {
                        const j = I.get(D);
                        if (j && j.size > 0) if (j.values().next().value.matches(":defined")) h(); else requestAnimationFrame(z);
                    };
                    requestAnimationFrame(z);
                }
            }));
        }
        function x(D) {
            E = D;
        }
        function n() {
            E = null, I.clear(), document.removeEventListener(`${A.EVENT_PREFIX}isDefined`, L);
        }
        function w(D, h, z) {
            a();
            const Z = new Set(D), I = new WeakMap, E = new WeakMap;
            function f(D) {
                I.set(D, D.previousElementSibling), E.set(D, D.nextElementSibling);
            }
            function s(D) {
                I.delete(D), E.delete(D);
            }
            function P(D) {
                return D.previousElementSibling !== I.get(D) || D.nextElementSibling !== E.get(D);
            }
            function n(D) {
                const {createdStyles: z, removedStyles: j, movedStyles: F} = D;
                if (z.forEach((D => f(D))), F.forEach((D => f(D))), j.forEach((D => s(D))), z.forEach((D => Z.add(D))),
                j.forEach((D => Z.delete(D))), z.size + j.size + F.size > 0) h({
                    created: Array.from(z),
                    removed: Array.from(j),
                    moved: Array.from(F),
                    updated: []
                });
            }
            function w({additions: D, moves: h, deletions: z}) {
                const j = new Set, Z = new Set, A = new Set;
                D.forEach((D => (0, l.getManageableStyles)(D).forEach((D => j.add(D))))), z.forEach((D => (0,
                l.getManageableStyles)(D).forEach((D => Z.add(D))))), h.forEach((D => (0, l.getManageableStyles)(D).forEach((D => A.add(D))))),
                n({
                    createdStyles: j,
                    removedStyles: Z,
                    movedStyles: A
                }), D.forEach((D => {
                    (0, F.iterateShadowHosts)(D, K), X(D);
                }));
            }
            function J(D) {
                const h = new Set((0, l.getManageableStyles)(D)), z = new Set, j = new Set, A = new Set;
                h.forEach((D => {
                    if (!Z.has(D)) z.add(D);
                })), Z.forEach((D => {
                    if (!h.has(D)) j.add(D);
                })), h.forEach((D => {
                    if (!z.has(D) && !j.has(D) && P(D)) A.add(D);
                })), n({
                    createdStyles: z,
                    removedStyles: j,
                    movedStyles: A
                }), (0, F.iterateShadowHosts)(D, K), X(D);
            }
            function d(D) {
                const z = new Set, j = new Set;
                if (D.forEach((D => {
                    const {target: h} = D;
                    if (h.isConnected) if ((0, l.shouldManageStyle)(h)) z.add(h); else if (h instanceof HTMLLinkElement && h.disabled) j.add(h);
                })), z.size + j.size > 0) h({
                    updated: Array.from(z),
                    created: [],
                    removed: Array.from(j),
                    moved: []
                });
            }
            function H(D) {
                const h = (0, F.createOptimizedTreeObserver)(D, {
                    onMinorMutations: w,
                    onHugeMutations: J
                }), z = new MutationObserver(d);
                z.observe(D, {
                    attributes: true,
                    attributeFilter: [ "rel", "disabled", "media", "href" ],
                    subtree: true
                }), q.push(h, z), Q.add(D);
            }
            function K(D) {
                const {shadowRoot: h} = D;
                if (h == null || Q.has(h)) return;
                H(h), z(h);
            }
            D.forEach(f), H(document), (0, F.iterateShadowHosts)(document.documentElement, K),
            x((D => {
                const z = [];
                D.forEach((D => (0, j.push)(z, (0, l.getManageableStyles)(D.shadowRoot)))), h({
                    created: z,
                    updated: [],
                    removed: [],
                    moved: []
                }), D.forEach((D => {
                    const {shadowRoot: h} = D;
                    if (h == null) return;
                    K(D), (0, F.iterateShadowHosts)(h, K), X(h);
                }));
            })), document.addEventListener(`${A.EVENT_PREFIX}isDefined`, L), X(document);
        }
        function J() {
            q.forEach((D => D.disconnect())), q.splice(0, q.length), Q = new WeakSet;
        }
        function a() {
            J(), n();
        }
        z.watchForStyleChanges = w, z.stopWatchingForStyleChanges = a;
    }, {
        x1: 2,
        Cc: 31,
        LI: 41,
        Dp: 19,
        Jd: 14
    } ],
    19: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.createOptimizedTreeObserver = z.cleanReadyStateCompleteListeners = z.addReadyStateCompleteListener = z.isReadyStateComplete = z.removeDOMReadyListener = z.addDOMReadyListener = z.setIsDOMReady = z.isDOMReady = z.iterateShadowHosts = z.watchForNodePosition = z.removeNode = z.createNodeAsap = void 0;
        const j = D("fm"), F = D("aP"), l = D("Cc"), Z = D("Eo");
        function A({selectNode: D, createNode: h, updateNode: z, selectTarget: j, createTarget: F, isTargetMutation: l}) {
            const Z = j();
            if (Z) {
                const j = D();
                if (j) z(j); else h(Z);
            } else {
                const z = new MutationObserver((z => {
                    const F = z.find(l);
                    if (F) {
                        A();
                        const z = j();
                        D() || h(z);
                    }
                })), Z = () => {
                    if (document.readyState !== "complete") return;
                    A();
                    const z = j() || F();
                    D() || h(z);
                }, A = () => {
                    document.removeEventListener("readystatechange", Z), z.disconnect();
                };
                if (document.readyState === "complete") Z(); else document.addEventListener("readystatechange", Z),
                z.observe(document, {
                    childList: true,
                    subtree: true
                });
            }
        }
        function q(D) {
            D && D.parentNode && D.parentNode.removeChild(D);
        }
        function Q(D, h, z = Function.prototype) {
            const l = 10, A = (0, Z.getDuration)({
                seconds: 2
            }), q = (0, Z.getDuration)({
                seconds: 10
            }), Q = D.previousSibling;
            let I = D.parentNode;
            if (!I) throw new Error("Unable to watch for node position: parent element not found");
            if (h === "prev-sibling" && !Q) throw new Error("Unable to watch for node position: there is no previous sibling");
            let E = 0, X = null, f = null;
            const s = (0, F.throttle)((() => {
                if (f) return;
                E++;
                const F = Date.now();
                if (X == null) X = F; else if (E >= l) {
                    if (F - X < q) return (0, j.logWarn)(`Node position watcher paused: retry in ${A}ms`, D, Q),
                    void (f = setTimeout((() => {
                        X = null, E = 0, f = null, s();
                    }), A));
                    X = F, E = 1;
                }
                if (h === "head") if (Q && Q.parentNode !== I) return (0, j.logWarn)("Unable to restore node position: sibling parent changed", D, Q, I),
                void x();
                if (h === "prev-sibling") {
                    if (Q.parentNode == null) return (0, j.logWarn)("Unable to restore node position: sibling was removed", D, Q, I),
                    void x();
                    if (Q.parentNode !== I) (0, j.logWarn)("Style was moved to another parent", D, Q, I),
                    w(Q.parentNode);
                }
                if (h === "head" && !I.isConnected) I = document.head;
                (0, j.logWarn)("Restoring node position", D, Q, I), I.insertBefore(D, Q && Q.isConnected ? Q.nextSibling : I.firstChild),
                L.takeRecords(), z && z();
            })), L = new MutationObserver((() => {
                if (h === "head" && (D.parentNode !== I || !D.parentNode.isConnected) || h === "prev-sibling" && D.previousSibling !== Q) s();
            })), P = () => {
                L.observe(I, {
                    childList: true
                });
            }, x = () => {
                clearTimeout(f), L.disconnect(), s.cancel();
            }, n = () => {
                L.takeRecords();
            }, w = D => {
                I = D, x(), P();
            };
            return P(), {
                run: P,
                stop: x,
                skip: n
            };
        }
        function I(D, h) {
            if (D == null) return;
            const z = document.createTreeWalker(D, NodeFilter.SHOW_ELEMENT, {
                acceptNode: D => D.shadowRoot == null ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT
            });
            for (let j = D.shadowRoot ? z.currentNode : z.nextNode(); j != null; j = z.nextNode()) {
                if (j.classList.contains("surfingkeys_hints_host")) continue;
                h(j), I(j.shadowRoot, h);
            }
        }
        z.createNodeAsap = A, z.removeNode = q, z.watchForNodePosition = Q, z.iterateShadowHosts = I;
        let E = () => document.readyState === "complete" || document.readyState === "interactive";
        function X(D) {
            z.isDOMReady = D;
        }
        z.isDOMReady = E, z.setIsDOMReady = X;
        const f = new Set;
        function s(D) {
            (0, z.isDOMReady)() ? D() : f.add(D);
        }
        function L(D) {
            f.delete(D);
        }
        function P() {
            return document.readyState === "complete";
        }
        z.addDOMReadyListener = s, z.removeDOMReadyListener = L, z.isReadyStateComplete = P;
        const x = new Set;
        function n(D) {
            P() ? D() : x.add(D);
        }
        function w() {
            x.clear();
        }
        if (z.addReadyStateCompleteListener = n, z.cleanReadyStateCompleteListeners = w,
        !(0, z.isDOMReady)()) {
            const D = () => {
                if ((0, z.isDOMReady)()) if (f.forEach((D => D())), f.clear(), P()) document.removeEventListener("readystatechange", D),
                x.forEach((D => D())), x.clear();
            };
            document.addEventListener("readystatechange", D);
        }
        const J = 1e3;
        function a(D) {
            if (D.length > J) return true;
            let h = 0;
            for (let z = 0; z < D.length; z++) if (h += D[z].addedNodes.length, h > J) return true;
            return false;
        }
        function d(D) {
            const h = new Set, z = new Set, j = new Set;
            D.forEach((D => {
                (0, l.forEach)(D.addedNodes, (D => {
                    if (D instanceof Element && D.isConnected) h.add(D);
                })), (0, l.forEach)(D.removedNodes, (D => {
                    if (D instanceof Element) if (D.isConnected) j.add(D), h.delete(D); else z.add(D);
                }));
            }));
            const F = [], Z = [];
            return h.forEach((D => {
                if (h.has(D.parentElement)) F.push(D);
            })), z.forEach((D => {
                if (z.has(D.parentElement)) Z.push(D);
            })), F.forEach((D => h.delete(D))), Z.forEach((D => z.delete(D))), {
                additions: h,
                moves: j,
                deletions: z
            };
        }
        const H = new Map, K = new WeakMap;
        function c(D, h) {
            let j, F, l;
            if (H.has(D)) j = H.get(D), F = K.get(j); else {
                let h = false, Z = false;
                j = new MutationObserver((j => {
                    if (a(j)) {
                        if (!h || (0, z.isDOMReady)()) F.forEach((({onHugeMutations: h}) => h(D))); else if (!Z) l = () => F.forEach((({onHugeMutations: h}) => h(D))),
                        s(l), Z = true;
                        h = true;
                    } else {
                        const D = d(j);
                        F.forEach((({onMinorMutations: h}) => h(D)));
                    }
                })), j.observe(D, {
                    childList: true,
                    subtree: true
                }), H.set(D, j), F = new Set, K.set(j, F);
            }
            return F.add(h), {
                disconnect() {
                    if (F.delete(h), l) L(l);
                    if (F.size === 0) j.disconnect(), K.delete(j), H.delete(D);
                }
            };
        }
        z.createOptimizedTreeObserver = c;
    }, {
        Cc: 31,
        aP: 43,
        Eo: 44,
        fm: 20
    } ],
    20: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.logInfoCollapsed = z.logWarn = z.logInfo = void 0;
        const j = D("k7"), F = true, l = false, Z = "info";
        function A(D, ...h) {
            if (l && Z && (Z === "info" || D === "warn")) chrome.runtime.sendMessage({
                type: j.MessageType.CS_LOG,
                data: {
                    level: D,
                    log: h
                }
            });
        }
        function q(...D) {
            if (F) A("info", ...D);
        }
        function Q(...D) {
            if (F) A("warn", ...D);
        }
        function I(D, ...h) {
            if (F) ;
        }
        z.logInfo = q, z.logWarn = Q, z.logInfoCollapsed = I;
    }, {
        k7: 38
    } ],
    21: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.DEFAULT_SETTINGS = z.DEFAULT_COLORSCHEME = z.DEFAULT_THEME = z.DEFAULT_COLORS = void 0;
        const j = D("xG"), F = D("Yo"), l = D("QY");
        z.DEFAULT_COLORS = {
            darkScheme: {
                background: "#181a1b",
                text: "#e8e6e3"
            },
            lightScheme: {
                background: "#181a1b",
                text: "#e8e6e3"
            }
        }, z.DEFAULT_THEME = {
            mode: 1,
            brightness: 100,
            contrast: 110,
            grayscale: 0,
            sepia: 0,
            useFont: false,
            fontFamily: F.isMacOS ? "Helvetica Neue" : F.isWindows ? "Segoe UI" : "Open Sans",
            textStroke: 0,
            engine: j.ThemeEngine.dynamicTheme,
            stylesheet: "",
            darkSchemeBackgroundColor: z.DEFAULT_COLORS.darkScheme.background,
            darkSchemeTextColor: z.DEFAULT_COLORS.darkScheme.text,
            lightSchemeBackgroundColor: z.DEFAULT_COLORS.lightScheme.background,
            lightSchemeTextColor: z.DEFAULT_COLORS.lightScheme.text,
            scrollbarColor: F.isMacOS ? "" : "auto",
            selectionColor: "auto",
            styleSystemControls: false,
            lightColorScheme: "Default",
            darkColorScheme: "Default",
            immediateModify: false
        }, z.DEFAULT_COLORSCHEME = {
            light: {
                Default: {
                    backgroundColor: z.DEFAULT_COLORS.lightScheme.background,
                    textColor: z.DEFAULT_COLORS.lightScheme.text
                }
            },
            dark: {
                Default: {
                    backgroundColor: z.DEFAULT_COLORS.darkScheme.background,
                    textColor: z.DEFAULT_COLORS.darkScheme.text
                }
            }
        }, z.DEFAULT_SETTINGS = {
            enabled: true,
            fetchNews: true,
            theme: z.DEFAULT_THEME,
            presets: [],
            customThemes: [],
            siteList: [],
            siteListEnabled: [],
            applyToListedOnly: false,
            changeBrowserTheme: false,
            syncSettings: true,
            syncSitesFixes: false,
            automation: {
                enabled: false,
                mode: l.AutomationMode.NONE,
                behavior: "OnOff"
            },
            time: {
                activation: "18:00",
                deactivation: "9:00"
            },
            location: {
                latitude: null,
                longitude: null
            },
            previewNewDesign: false,
            enableForPDF: true,
            enableForProtectedPages: false,
            enableContextMenus: false,
            detectDarkTheme: false
        };
    }, {
        xG: 26,
        QY: 33,
        Yo: 41
    } ],
    22: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.formatInversionFixes = z.parseInversionFixes = z.getInversionFixesFor = z.getCSSFilterValue = z.cssFilterStyleSheetTemplate = z.hasFirefoxNewRootBehavior = z.hasPatchForChromiumIssue501582 = z.FilterMode = void 0;
        const j = D("f5"), F = D("pN"), l = D("tZ"), Z = D("hh"), A = D("Pt"), q = D("zz"), Q = D("UE");
        var I;
        function E() {
            return true;
        }
        function X() {
            return Boolean(Q.isFirefox && (0, Q.compareChromeVersions)(Q.firefoxVersion, "102.0") >= 0);
        }
        function f(D, h, z, j, F) {
            const l = L(D), Z = "invert(100%) hue-rotate(180deg)";
            return s(l, Z, D, h, z, j, F);
        }
        function s(D, h, z, j, l, Z, A) {
            const Q = w(j, Z, A), E = [];
            if (E.push("@media screen {"), D && l) E.push(""), E.push("/* Leading rule */"),
            E.push(P(D));
            if (z.mode === I.dark) E.push(""), E.push("/* Reverse rule */"), E.push(n(h, Q));
            if (z.useFont || z.textStroke > 0) E.push(""), E.push("/* Font */"), E.push((0,
            q.createTextStyle)(z));
            if (E.push(""), E.push("/* Text contrast */"), E.push("html {"), E.push("  text-shadow: 0 0 0 !important;"),
            E.push("}"), E.push(""), E.push("/* Full screen */"), [ ":-webkit-full-screen", ":-moz-full-screen", ":fullscreen" ].forEach((D => {
                E.push(`${D}, ${D} * {`), E.push("  -webkit-filter: none !important;"), E.push("  filter: none !important;"),
                E.push("}");
            })), l) {
                const D = [ 255, 255, 255 ], h = !true && !X() && z.mode === I.dark ? (0, F.applyColorMatrix)(D, (0,
                F.createFilterMatrix)(z)).map(Math.round) : D;
                E.push(""), E.push("/* Page background */"), E.push("html {"), E.push(`  background: rgb(${h.join(",")}) !important;`),
                E.push("}");
            }
            if (Q.css && Q.css.length > 0 && z.mode === I.dark) E.push(""), E.push("/* Custom rules */"),
            E.push(Q.css);
            return E.push(""), E.push("}"), E.join("\n");
        }
        function L(D) {
            const h = [];
            if (D.mode === I.dark) h.push("invert(100%) hue-rotate(180deg)");
            if (D.brightness !== 100) h.push(`brightness(${D.brightness}%)`);
            if (D.contrast !== 100) h.push(`contrast(${D.contrast}%)`);
            if (D.grayscale !== 0) h.push(`grayscale(${D.grayscale}%)`);
            if (D.sepia !== 0) h.push(`sepia(${D.sepia}%)`);
            if (h.length === 0) return null;
            return h.join(" ");
        }
        function P(D) {
            return [ "html {", `  -webkit-filter: ${D} !important;`, `  filter: ${D} !important;`, "}" ].join("\n");
        }
        function x(D) {
            return D.map((D => D.replace(/\,$/, ""))).join(",\n");
        }
        function n(D, h) {
            const z = [];
            if (h.invert.length > 0) z.push(`${x(h.invert)} {`), z.push(`  -webkit-filter: ${D} !important;`),
            z.push(`  filter: ${D} !important;`), z.push("}");
            if (h.noinvert.length > 0) z.push(`${x(h.noinvert)} {`), z.push("  -webkit-filter: none !important;"),
            z.push("  filter: none !important;"), z.push("}");
            if (h.removebg.length > 0) z.push(`${x(h.removebg)} {`), z.push("  background: white !important;"),
            z.push("}");
            return z.join("\n");
        }
        function w(D, h, z) {
            const j = (0, l.getSitesFixesFor)(D, h, z, {
                commands: Object.keys(J),
                getCommandPropName: D => J[D],
                parseCommandValue: (D, h) => {
                    if (D === "CSS") return h.trim();
                    return (0, Z.parseArray)(h);
                }
            }), F = {
                url: j[0].url,
                invert: j[0].invert || [],
                noinvert: j[0].noinvert || [],
                removebg: j[0].removebg || [],
                css: j[0].css || ""
            };
            if (D) {
                const h = j.slice(1).filter((h => (0, A.isURLInList)(D, h.url))).sort(((D, h) => h.url[0].length - D.url[0].length));
                if (h.length > 0) {
                    const D = h[0];
                    return {
                        url: D.url,
                        invert: F.invert.concat(D.invert || []),
                        noinvert: F.noinvert.concat(D.noinvert || []),
                        removebg: F.removebg.concat(D.removebg || []),
                        css: [ F.css, D.css ].filter((D => D)).join("\n")
                    };
                }
            }
            return F;
        }
        (function(D) {
            D[D["light"] = 0] = "light", D[D["dark"] = 1] = "dark";
        })(I = z.FilterMode || (z.FilterMode = {})), z.hasPatchForChromiumIssue501582 = E,
        z.hasFirefoxNewRootBehavior = X, z.default = f, z.cssFilterStyleSheetTemplate = s,
        z.getCSSFilterValue = L, z.getInversionFixesFor = w;
        const J = {
            INVERT: "invert",
            "NO INVERT": "noinvert",
            "REMOVE BG": "removebg",
            CSS: "css"
        };
        function a(D) {
            return (0, l.parseSitesFixesConfig)(D, {
                commands: Object.keys(J),
                getCommandPropName: D => J[D],
                parseCommandValue: (D, h) => {
                    if (D === "CSS") return h.trim();
                    return (0, Z.parseArray)(h);
                }
            });
        }
        function d(D) {
            const h = D.slice().sort(((D, h) => (0, A.compareURLPatterns)(D.url[0], h.url[0])));
            return (0, j.formatSitesFixesConfig)(h, {
                props: Object.values(J),
                getPropCommandName: D => Object.entries(J).find((([, h]) => h === D))[0],
                formatPropValue: (D, h) => {
                    if (D === "css") return h.trim().replace(/\n+/g, "\n");
                    return (0, Z.formatArray)(h).trim();
                },
                shouldIgnoreProp: (D, h) => {
                    if (D === "css") return !h;
                    return !(Array.isArray(h) && h.length > 0);
                }
            });
        }
        z.parseInversionFixes = a, z.formatInversionFixes = d;
    }, {
        UE: 41,
        hh: 42,
        Pt: 46,
        zz: 25,
        f5: 27,
        pN: 28,
        tZ: 29
    } ],
    23: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.modifyGradientColor = z.modifyShadowColor = z.modifyBorderColor = z.modifyForegroundColor = z.modifyBackgroundColor = z.modifyColor = z.clearColorModificationCache = void 0;
        const j = D("VF"), F = D("vc"), l = D("pN");
        function Z(D) {
            const h = D.mode === 1, z = h ? "darkSchemeBackgroundColor" : "lightSchemeBackgroundColor";
            return D[z];
        }
        function A(D) {
            const h = D.mode === 1, z = h ? "darkSchemeTextColor" : "lightSchemeTextColor";
            return D[z];
        }
        const q = new Map;
        function Q() {
            q.clear();
        }
        z.clearColorModificationCache = Q;
        const I = [ "r", "g", "b", "a" ], E = [ "mode", "brightness", "contrast", "grayscale", "sepia", "darkSchemeBackgroundColor", "darkSchemeTextColor", "lightSchemeBackgroundColor", "lightSchemeTextColor" ];
        function X(D, h) {
            let z = "";
            return I.forEach((h => {
                z += `${D[h]};`;
            })), E.forEach((D => {
                z += `${h[D]};`;
            })), z;
        }
        function f(D, h, z, F, Z) {
            let A;
            if (q.has(z)) A = q.get(z); else A = new Map, q.set(z, A);
            const Q = X(D, h);
            if (A.has(Q)) return A.get(Q);
            const I = (0, j.rgbToHSL)(D), E = F == null ? null : (0, j.parseToHSLWithCache)(F), f = Z == null ? null : (0,
            j.parseToHSLWithCache)(Z), s = z(I, E, f), {r: L, g: P, b: x, a: n} = (0, j.hslToRGB)(s), w = (0,
            l.createFilterMatrix)(h), [J, a, d] = (0, l.applyColorMatrix)([ L, P, x ], w), H = n === 1 ? (0,
            j.rgbToHexString)({
                r: J,
                g: a,
                b: d
            }) : (0, j.rgbToString)({
                r: J,
                g: a,
                b: d,
                a: n
            });
            return A.set(Q, H), H;
        }
        function s(D) {
            return D;
        }
        function L(D, h) {
            return f(D, h, s);
        }
        function P(D, h) {
            const z = Z(h), j = A(h);
            return f(D, h, x, j, z);
        }
        function x({h: D, s: h, l: z, a: j}, l, Z) {
            const A = z < .5;
            let q;
            if (A) q = z < .2 || h < .12; else {
                const j = D > 200 && D < 280;
                q = h < .24 || z > .8 && j;
            }
            let Q = D, I = z;
            if (q) if (A) Q = l.h, I = l.s; else Q = Z.h, I = Z.s;
            const E = (0, F.scale)(z, 0, 1, l.l, Z.l);
            return {
                h: Q,
                s: I,
                l: E,
                a: j
            };
        }
        z.modifyColor = L;
        const n = .4;
        function w({h: D, s: h, l: z, a: j}, l) {
            const Z = z < .5, A = D > 200 && D < 280, q = h < .12 || z > .8 && A;
            if (Z) {
                const Z = (0, F.scale)(z, 0, .5, 0, n);
                if (q) {
                    const D = l.h, h = l.s;
                    return {
                        h: D,
                        s: h,
                        l: Z,
                        a: j
                    };
                }
                return {
                    h: D,
                    s: h,
                    l: Z,
                    a: j
                };
            }
            let Q = (0, F.scale)(z, .5, 1, n, l.l);
            if (q) {
                const D = l.h, h = l.s;
                return {
                    h: D,
                    s: h,
                    l: Q,
                    a: j
                };
            }
            let I = D;
            const E = D > 60 && D < 180;
            if (E) {
                const h = D > 120;
                if (h) I = (0, F.scale)(D, 120, 180, 135, 180); else I = (0, F.scale)(D, 60, 120, 60, 105);
            }
            if (I > 40 && I < 80) Q *= .75;
            return {
                h: I,
                s: h,
                l: Q,
                a: j
            };
        }
        function J(D, h) {
            if (h.mode === 0) return P(D, h);
            const z = Z(h);
            return f(D, Object.assign(Object.assign({}, h), {
                mode: 0
            }), w, z);
        }
        z.modifyBackgroundColor = J;
        const a = .55;
        function d(D) {
            return (0, F.scale)(D, 205, 245, 205, 220);
        }
        function H({h: D, s: h, l: z, a: j}, l) {
            const Z = z > .5, A = z < .2 || h < .24, q = !A && D > 205 && D < 245;
            if (Z) {
                const Z = (0, F.scale)(z, .5, 1, a, l.l);
                if (A) {
                    const D = l.h, h = l.s;
                    return {
                        h: D,
                        s: h,
                        l: Z,
                        a: j
                    };
                }
                let Q = D;
                if (q) Q = d(D);
                return {
                    h: Q,
                    s: h,
                    l: Z,
                    a: j
                };
            }
            if (A) {
                const D = l.h, h = l.s, Z = (0, F.scale)(z, 0, .5, l.l, a);
                return {
                    h: D,
                    s: h,
                    l: Z,
                    a: j
                };
            }
            let Q = D, I;
            if (q) Q = d(D), I = (0, F.scale)(z, 0, .5, l.l, Math.min(1, a + .05)); else I = (0,
            F.scale)(z, 0, .5, l.l, a);
            return {
                h: Q,
                s: h,
                l: I,
                a: j
            };
        }
        function K(D, h) {
            if (h.mode === 0) return P(D, h);
            const z = A(h);
            return f(D, Object.assign(Object.assign({}, h), {
                mode: 0
            }), H, z);
        }
        function c({h: D, s: h, l: z, a: j}, l, Z) {
            const A = z < .5, q = z < .2 || h < .24;
            let Q = D, I = h;
            if (q) if (A) Q = l.h, I = l.s; else Q = Z.h, I = Z.s;
            const E = (0, F.scale)(z, 0, 1, .5, .2);
            return {
                h: Q,
                s: I,
                l: E,
                a: j
            };
        }
        function M(D, h) {
            if (h.mode === 0) return P(D, h);
            const z = A(h), j = Z(h);
            return f(D, Object.assign(Object.assign({}, h), {
                mode: 0
            }), c, z, j);
        }
        function S(D, h) {
            return J(D, h);
        }
        function T(D, h) {
            return J(D, h);
        }
        z.modifyForegroundColor = K, z.modifyBorderColor = M, z.modifyShadowColor = S, z.modifyGradientColor = T;
    }, {
        VF: 34,
        vc: 37,
        pN: 28
    } ],
    24: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.getSVGReverseFilterMatrixValue = z.getSVGFilterMatrixValue = z.createSVGFilterStylesheet = void 0;
        const j = D("pN"), F = D("hq"), l = D("UE"), Z = D("Dk");
        function A(D, h, z, j, A) {
            let Q, X;
            if (l.isFirefox) Q = q(I(D)), X = q(E()); else Q = `url(#${Z.MISC_PREFIX}-filter)`,
            X = `url(#${Z.MISC_PREFIX}-reverse-filter)`;
            return (0, F.cssFilterStyleSheetTemplate)(Q, X, D, h, z, j, A);
        }
        function q(D) {
            const h = `${Z.MISC_PREFIX}-filter`, z = [ '<svg xmlns="http://www.w3.org/2000/svg">', `<filter id="${h}" style="color-interpolation-filters: sRGB;">`, `<feColorMatrix type="matrix" values="${D}" />`, "</filter>", "</svg>" ].join("");
            return `url(data:image/svg+xml;base64,${btoa(z)}#${h})`;
        }
        function Q(D) {
            return D.slice(0, 4).map((D => D.map((D => D.toFixed(3))).join(" "))).join(" ");
        }
        function I(D) {
            return Q((0, j.createFilterMatrix)(D));
        }
        function E() {
            return Q(j.Matrix.invertNHue());
        }
        z.createSVGFilterStylesheet = A, z.getSVGFilterMatrixValue = I, z.getSVGReverseFilterMatrixValue = E;
    }, {
        Dk: 2,
        UE: 41,
        hq: 22,
        pN: 28
    } ],
    25: [ function(D, h, z) {
        "use strict";
        function j(D) {
            const h = [];
            if (h.push('*:not(pre, pre *, code, .far, .fa, .glyphicon, [class*="vjs-"], .fab, .fa-github, .fas, .material-icons, .icofont, .typcn, mu, [class*="mu-"], .glyphicon, .icon) {'),
            D.useFont && D.fontFamily) h.push(`  font-family: ${D.fontFamily} !important;`);
            if (D.textStroke > 0) h.push(`  -webkit-text-stroke: ${D.textStroke}px !important;`),
            h.push(`  text-stroke: ${D.textStroke}px !important;`);
            return h.push("}"), h.join("\n");
        }
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.createTextStyle = void 0, z.createTextStyle = j;
    }, {} ],
    26: [ function(D, h, z) {
        "use strict";
        var j;
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.ThemeEngine = void 0, function(D) {
            D["cssFilter"] = "cssFilter", D["svgFilter"] = "svgFilter", D["staticTheme"] = "staticTheme",
            D["dynamicTheme"] = "dynamicTheme";
        }(j = z.ThemeEngine || (z.ThemeEngine = {}));
    }, {} ],
    27: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.formatSitesFixesConfig = void 0;
        const j = D("Cc");
        function F(D, h) {
            const z = [];
            return D.forEach(((F, l) => {
                if ((0, j.push)(z, F.url), h.props.forEach((D => {
                    const j = h.getPropCommandName(D), l = F[D];
                    if (h.shouldIgnoreProp(D, l)) return;
                    z.push(""), z.push(j);
                    const Z = h.formatPropValue(D, l);
                    if (Z) z.push(Z);
                })), l < D.length - 1) z.push(""), z.push("=".repeat(32)), z.push("");
            })), z.push(""), z.join("\n");
        }
        z.formatSitesFixesConfig = F;
    }, {
        Cc: 31
    } ],
    28: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.Matrix = z.applyColorMatrix = z.createFilterMatrix = void 0;
        const j = D("uN");
        function F(D) {
            let h = z.Matrix.identity();
            if (D.sepia !== 0) h = (0, j.multiplyMatrices)(h, z.Matrix.sepia(D.sepia / 100));
            if (D.grayscale !== 0) h = (0, j.multiplyMatrices)(h, z.Matrix.grayscale(D.grayscale / 100));
            if (D.contrast !== 100) h = (0, j.multiplyMatrices)(h, z.Matrix.contrast(D.contrast / 100));
            if (D.brightness !== 100) h = (0, j.multiplyMatrices)(h, z.Matrix.brightness(D.brightness / 100));
            if (D.mode === 1) h = (0, j.multiplyMatrices)(h, z.Matrix.invertNHue());
            return h;
        }
        function l([D, h, z], F) {
            const l = [ [ D / 255 ], [ h / 255 ], [ z / 255 ], [ 1 ], [ 1 ] ], Z = (0, j.multiplyMatrices)(F, l);
            return [ 0, 1, 2 ].map((D => (0, j.clamp)(Math.round(Z[D][0] * 255), 0, 255)));
        }
        z.createFilterMatrix = F, z.applyColorMatrix = l, z.Matrix = {
            identity: () => [ [ 1, 0, 0, 0, 0 ], [ 0, 1, 0, 0, 0 ], [ 0, 0, 1, 0, 0 ], [ 0, 0, 0, 1, 0 ], [ 0, 0, 0, 0, 1 ] ],
            invertNHue: () => [ [ .333, -.667, -.667, 0, 1 ], [ -.667, .333, -.667, 0, 1 ], [ -.667, -.667, .333, 0, 1 ], [ 0, 0, 0, 1, 0 ], [ 0, 0, 0, 0, 1 ] ],
            brightness: D => [ [ D, 0, 0, 0, 0 ], [ 0, D, 0, 0, 0 ], [ 0, 0, D, 0, 0 ], [ 0, 0, 0, 1, 0 ], [ 0, 0, 0, 0, 1 ] ],
            contrast(D) {
                const h = (1 - D) / 2;
                return [ [ D, 0, 0, 0, h ], [ 0, D, 0, 0, h ], [ 0, 0, D, 0, h ], [ 0, 0, 0, 1, 0 ], [ 0, 0, 0, 0, 1 ] ];
            },
            sepia: D => [ [ .393 + .607 * (1 - D), .769 - .769 * (1 - D), .189 - .189 * (1 - D), 0, 0 ], [ .349 - .349 * (1 - D), .686 + .314 * (1 - D), .168 - .168 * (1 - D), 0, 0 ], [ .272 - .272 * (1 - D), .534 - .534 * (1 - D), .131 + .869 * (1 - D), 0, 0 ], [ 0, 0, 0, 1, 0 ], [ 0, 0, 0, 0, 1 ] ],
            grayscale: D => [ [ .2126 + .7874 * (1 - D), .7152 - .7152 * (1 - D), .0722 - .0722 * (1 - D), 0, 0 ], [ .2126 - .2126 * (1 - D), .7152 + .2848 * (1 - D), .0722 - .0722 * (1 - D), 0, 0 ], [ .2126 - .2126 * (1 - D), .7152 - .7152 * (1 - D), .0722 + .9278 * (1 - D), 0, 0 ], [ 0, 0, 0, 1, 0 ], [ 0, 0, 0, 0, 1 ] ]
        };
    }, {
        uN: 37
    } ],
    29: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.isURLInSiteList = z.indexSiteListConfig = z.getSitesFixesFor = z.indexSitesFixesConfig = z.getDomain = z.parseSitesFixesConfig = void 0;
        const j = D("KT"), F = D("zW"), l = 6e4;
        function Z(D, h) {
            const z = [], j = D.replace(/\r/g, "").split(/^\s*={2,}\s*$/gm);
            return j.forEach((D => {
                const j = D.split("\n"), l = [];
                if (j.forEach(((D, h) => {
                    if (D.match(/^[A-Z]+(\s[A-Z]+){0,2}$/)) l.push(h);
                })), l.length === 0) return;
                const Z = {
                    url: (0, F.parseArray)(j.slice(0, l[0]).join("\n"))
                };
                l.forEach(((D, z) => {
                    const F = j[D].trim(), A = j.slice(D + 1, z === l.length - 1 ? j.length : l[z + 1]).join("\n"), q = h.getCommandPropName(F);
                    if (!q) return;
                    const Q = h.parseCommandValue(F, A);
                    Z[q] = Q;
                })), z.push(Z);
            })), z;
        }
        function A(D) {
            try {
                return new URL(D).hostname.toLowerCase();
            } catch (h) {
                return D.split("/")[0].toLowerCase();
            }
        }
        function q(D) {
            return D.map((([D, h]) => {
                const z = D.toString(36), j = h.toString(36);
                return "0".repeat(4 - z.length) + z + "0".repeat(3 - j.length) + j;
            })).join("");
        }
        function Q(D, h) {
            const z = (4 + 3) * h, j = parseInt(D.substring(z + 0, z + 4), 36), F = parseInt(D.substring(z + 4, z + 4 + 3), 36);
            return [ j, j + F ];
        }
        function I(D, h, z) {
            if (!D[h]) D[h] = [ z ]; else if (!D[h].includes(z)) D[h].push(z);
        }
        function E(D) {
            const h = D.lastIndexOf("*"), z = D.substring(h + 2);
            if (h < 0 || z.length === 0) return D.split(".");
            const j = [ z ], F = D.substring(0, h);
            return F.split(".").filter(Boolean).forEach((D => j.concat(D))), j;
        }
        function X(D) {
            const h = {}, z = {}, F = [], l = {}, Z = [];
            for (let z = 0; z < D.length; z++) {
                const q = D[z], Q = new Set;
                for (const D of q) {
                    const l = A(D);
                    if ((0, j.isFullyQualifiedDomain)(l)) I(h, l, z); else if ((0, j.isFullyQualifiedDomainWildcard)(l)) {
                        const D = E(l);
                        Z.push({
                            labels: D,
                            index: z
                        }), D.forEach((D => Q.add(D)));
                    } else {
                        F.push(z);
                        break;
                    }
                }
                for (const D of Q) if (l[D]) l[D]++; else l[D] = 1;
            }
            for (const {labels: D, index: h} of Z) {
                let j = D[0];
                for (const h of D) if (l[h] < l[j]) j = h;
                I(z, j, h);
            }
            return {
                domains: h,
                domainLabels: z,
                nonstandard: F
            };
        }
        function f(D, h, z, j, l) {
            const Z = D.substring(z, j), A = Z.split("\n"), q = [];
            if (A.forEach(((D, h) => {
                if (D.match(/^[A-Z]+(\s[A-Z]+){0,2}$/)) q.push(h);
            })), q.length === 0) return;
            h.push([ z, j - z ]);
            const Q = (0, F.parseArray)(A.slice(0, q[0]).join("\n"));
            l.push(Q);
        }
        function s(D) {
            const h = [], z = [];
            let j = 0;
            const F = /^\s*={2,}\s*$/gm;
            let l;
            while (l = F.exec(D)) {
                const F = l.index, Z = l.index + l[0].length;
                f(D, z, j, F, h), j = Z;
            }
            return f(D, z, j, D.length, h), {
                urls: h,
                offsets: z
            };
        }
        function L(D) {
            const {urls: h, offsets: z} = s(D), {domains: j, domainLabels: F, nonstandard: l} = X(h);
            return {
                offsets: q(z),
                domains: j,
                domainLabels: F,
                nonstandard: l,
                cacheDomainIndex: {},
                cacheSiteFix: {},
                cacheCleanupTimer: null
            };
        }
        function P(D, h, z) {
            const F = A(D), l = F.split(".");
            let Z = [];
            if ("*" in h.domainLabels) Z = Z.concat(h.domainLabels["*"]);
            for (const D of l) if (D in h.domainLabels) {
                const l = h.domainLabels[D];
                for (const D of l) {
                    const h = z(D);
                    for (const z of h) {
                        const h = A(z);
                        if ((0, j.isFullyQualifiedDomainWildcard)(h) && (0, j.fullyQualifiedDomainMatchesWildcard)(h, F)) Z.push(D);
                    }
                }
            }
            for (let D = 0; D < l.length; D++) {
                const z = l.slice(D).join(".");
                if (z in h.domains) Z = Z.concat(h.domains[z]);
                if (z in h.domainLabels) Z = Z.concat(h.domainLabels[z]);
            }
            return Z = Z.concat(h.nonstandard), Z = Array.from(new Set(Z)), Z;
        }
        function x(D, h, z, j) {
            if (j in h.cacheSiteFix) return h.cacheSiteFix[j];
            const [F, l] = Q(h.offsets, j), A = D.substring(F, l), q = Z(A, z)[0];
            return h.cacheSiteFix[j] = q, q;
        }
        function n(D) {
            clearTimeout(D.cacheCleanupTimer), D.cacheCleanupTimer = setTimeout((() => {
                D.cacheCleanupTimer = null, D.cacheDomainIndex = {}, D.cacheSiteFix = {};
            }), l);
        }
        function w(D, h, z, j) {
            const F = [], l = A(D);
            if (!z.cacheDomainIndex[l]) z.cacheDomainIndex[l] = P(l, z, (D => x(h, z, j, D).url));
            const Z = z.cacheDomainIndex[l];
            for (const D of Z) {
                const l = x(h, z, j, D);
                F.push(l);
            }
            return n(z), F;
        }
        function J(D) {
            const h = (0, F.parseArray)(D), z = h.map((D => [ D ])), {domains: j, domainLabels: l, nonstandard: Z} = X(z);
            return {
                domains: j,
                domainLabels: l,
                nonstandard: Z,
                urls: h
            };
        }
        function a(D, h) {
            const z = A(D), j = P(z, h, (D => [ h.urls[D] ])), F = [];
            for (const D of j) F.push(h.urls[D]);
            return F;
        }
        function d(D, h) {
            if (h === null) return false;
            const z = a(D, h);
            return (0, j.isURLInList)(D, z);
        }
        z.parseSitesFixesConfig = Z, z.getDomain = A, z.indexSitesFixesConfig = L, z.getSitesFixesFor = w,
        z.indexSiteListConfig = J, z.isURLInSiteList = d;
    }, {
        zW: 42,
        KT: 46
    } ],
    30: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.PREFIX = void 0, z.PREFIX = "dm";
    }, {} ],
    31: [ function(D, h, z) {
        "use strict";
        function j(D) {
            return D.length != null;
        }
        function F(D, h) {
            if (j(D)) for (let z = 0, j = D.length; z < j; z++) h(D[z]); else for (const z of D) h(z);
        }
        function l(D, h) {
            F(h, (h => D.push(h)));
        }
        function Z(D) {
            const h = [];
            for (let z = 0, j = D.length; z < j; z++) h.push(D[z]);
            return h;
        }
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.toArray = z.push = z.forEach = void 0, z.forEach = F, z.push = l, z.toArray = Z;
    }, {} ],
    32: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        });
        class j {
            constructor() {
                this.queue = [], this.timerId = null, this.frameDuration = 1e3 / 60;
            }
            addToQueue(D) {
                this.queue.push(D), this.startQueue();
            }
            stopQueue() {
                if (this.timerId !== null) cancelAnimationFrame(this.timerId), this.timerId = null;
                this.queue = [];
            }
            startQueue() {
                if (this.timerId) return;
                this.timerId = requestAnimationFrame((() => {
                    this.timerId = null;
                    const D = Date.now();
                    let h;
                    while (h = this.queue.shift()) if (h(), Date.now() - D >= this.frameDuration) {
                        this.startQueue();
                        break;
                    }
                }));
            }
        }
        z.default = j;
    }, {} ],
    33: [ function(D, h, z) {
        "use strict";
        var j;
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.AutomationMode = void 0, function(D) {
            D["NONE"] = "", D["TIME"] = "time", D["SYSTEM"] = "system", D["LOCATION"] = "location";
        }(j = z.AutomationMode || (z.AutomationMode = {}));
    }, {} ],
    34: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.getSRGBLightness = z.lowerCalcExpression = z.parse = z.hslToString = z.rgbToHexString = z.rgbToString = z.rgbToHSL = z.hslToRGB = z.clearColorCache = z.parseToHSLWithCache = z.parseColorWithCache = void 0;
        const j = D("Ti"), F = D("eu"), l = new Map, Z = new Map;
        function A(D) {
            if (D = D.trim(), Z.has(D)) return Z.get(D);
            if (D.includes("calc(")) D = m(D);
            const h = w(D);
            return h && Z.set(D, h), h;
        }
        function q(D) {
            if (l.has(D)) return l.get(D);
            const h = A(D);
            if (!h) return null;
            const z = E(h);
            return l.set(D, z), z;
        }
        function Q() {
            l.clear(), Z.clear();
        }
        function I({h: D, s: h, l: z, a: j = 1}) {
            if (h === 0) {
                const [D, h, F] = [ z, z, z ].map((D => Math.round(D * 255)));
                return {
                    r: D,
                    g: F,
                    b: h,
                    a: j
                };
            }
            const F = (1 - Math.abs(2 * z - 1)) * h, l = F * (1 - Math.abs(D / 60 % 2 - 1)), Z = z - F / 2, [A, q, Q] = (D < 60 ? [ F, l, 0 ] : D < 120 ? [ l, F, 0 ] : D < 180 ? [ 0, F, l ] : D < 240 ? [ 0, l, F ] : D < 300 ? [ l, 0, F ] : [ F, 0, l ]).map((D => Math.round((D + Z) * 255)));
            return {
                r: A,
                g: q,
                b: Q,
                a: j
            };
        }
        function E({r: D, g: h, b: z, a: j = 1}) {
            const F = D / 255, l = h / 255, Z = z / 255, A = Math.max(F, l, Z), q = Math.min(F, l, Z), Q = A - q, I = (A + q) / 2;
            if (Q === 0) return {
                h: 0,
                s: 0,
                l: I,
                a: j
            };
            let E = (A === F ? (l - Z) / Q % 6 : A === l ? (Z - F) / Q + 2 : (F - l) / Q + 4) * 60;
            if (E < 0) E += 360;
            const X = Q / (1 - Math.abs(2 * I - 1));
            return {
                h: E,
                s: X,
                l: I,
                a: j
            };
        }
        function X(D, h = 0) {
            const z = D.toFixed(h);
            if (h === 0) return z;
            const j = z.indexOf(".");
            if (j >= 0) {
                const D = z.match(/0+$/);
                if (D) {
                    if (D.index === j + 1) return z.substring(0, j);
                    return z.substring(0, D.index);
                }
            }
            return z;
        }
        function f(D) {
            const {r: h, g: z, b: j, a: F} = D;
            if (F != null && F < 1) return `rgba(${X(h)}, ${X(z)}, ${X(j)}, ${X(F, 2)})`;
            return `rgb(${X(h)}, ${X(z)}, ${X(j)})`;
        }
        function s({r: D, g: h, b: z, a: j}) {
            return `#${(j != null && j < 1 ? [ D, h, z, Math.round(j * 255) ] : [ D, h, z ]).map((D => `${D < 16 ? "0" : ""}${D.toString(16)}`)).join("")}`;
        }
        function L(D) {
            const {h: h, s: z, l: j, a: F} = D;
            if (F != null && F < 1) return `hsla(${X(h)}, ${X(z * 100)}%, ${X(j * 100)}%, ${X(F, 2)})`;
            return `hsl(${X(h)}, ${X(z * 100)}%, ${X(j * 100)}%)`;
        }
        z.parseColorWithCache = A, z.parseToHSLWithCache = q, z.clearColorCache = Q, z.hslToRGB = I,
        z.rgbToHSL = E, z.rgbToString = f, z.rgbToHexString = s, z.hslToString = L;
        const P = /^rgba?\([^\(\)]+\)$/, x = /^hsla?\([^\(\)]+\)$/, n = /^#[0-9a-f]+$/i;
        // Colour syntaxes the hand-written parser does not understand (oklch(), oklab(), lab(), lch(),
        // hwb(), color(), color-mix(), light-dark(), relative colours) are rasterised through a 1x1
        // canvas, which yields sRGB channels for any valid CSS colour. The fillStyle getter cannot be
        // used for that because modern browsers serialise non-sRGB colours in their own colour space.
        // light-dark() resolves to its light operand here, which is the value that then gets darkened.
        const modernColorFunction = /^(?:oklch|oklab|lab|lch|hwb|color|color-mix|light-dark|rgba?|hsla?)\(/, relativeColor = /^[a-z-]+\(\s*from\s/, unresolvable = new Set;
        let canvasContext = null;
        function resolveColorWithBrowser(D) {
            if (unresolvable.has(D)) return null;
            try {
                if (canvasContext === null) {
                    const D = document.createElement("canvas");
                    D.width = D.height = 1, canvasContext = D.getContext && D.getContext("2d", {
                        willReadFrequently: true
                    }) || false;
                }
                if (!canvasContext) return null;
                // A colour is valid when assigning it moves the getter away from both sentinels.
                canvasContext.fillStyle = "#010203", canvasContext.fillStyle = D;
                if (canvasContext.fillStyle === "#010203") {
                    canvasContext.fillStyle = "#030201", canvasContext.fillStyle = D;
                    if (canvasContext.fillStyle === "#030201") {
                        if (unresolvable.size > 4096) unresolvable.clear();
                        return unresolvable.add(D), null;
                    }
                }
                canvasContext.clearRect(0, 0, 1, 1), canvasContext.fillRect(0, 0, 1, 1);
                const h = canvasContext.getImageData(0, 0, 1, 1).data;
                return {
                    r: h[0],
                    g: h[1],
                    b: h[2],
                    a: Math.round(h[3] / 255 * 100) / 100
                };
            } catch (D) {
                return null;
            }
        }
        function w(D) {
            const h = D.trim().toLowerCase();
            if (relativeColor.test(h)) return h.includes("var(") ? null : resolveColorWithBrowser(h);
            if (h.match(P)) return K(h);
            if (h.match(x)) return S(h);
            if (h.match(n)) return T(h);
            if (G.has(h)) return e(h);
            if (r.has(h)) return v(h);
            if (D === "transparent") return {
                r: 0,
                g: 0,
                b: 0,
                a: 0
            };
            if (modernColorFunction.test(h) && !h.includes("var(")) return resolveColorWithBrowser(h);
            return null;
        }
        function J(D) {
            const h = [];
            let z = 0, j = false;
            const F = D.indexOf("(");
            D = D.substring(F + 1, D.length - 1);
            for (let F = 0; F < D.length; F++) {
                const l = D[F];
                if (l >= "0" && l <= "9" || l === "." || l === "+" || l === "-") j = true; else if (j && (l === " " || l === "," || l === "/")) h.push(D.substring(z, F)),
                j = false, z = F + 1; else if (!j) z = F + 1;
            }
            if (j) h.push(D.substring(z, D.length));
            return h;
        }
        function a(D, h, z) {
            const j = J(D), F = Object.entries(z), l = j.map((D => D.trim())).map(((D, z) => {
                let j;
                const l = F.find((([h]) => D.endsWith(h)));
                if (l) j = parseFloat(D.substring(0, D.length - l[0].length)) / l[1] * h[z]; else j = parseFloat(D);
                if (h[z] > 1) return Math.round(j);
                return j;
            }));
            return l;
        }
        z.parse = w;
        const d = [ 255, 255, 255, 1 ], H = {
            "%": 100
        };
        function K(D) {
            const [h, z, j, F = 1] = a(D, d, H);
            return {
                r: h,
                g: z,
                b: j,
                a: F
            };
        }
        const c = [ 360, 1, 1, 1 ], M = {
            "%": 100,
            deg: 360,
            rad: 2 * Math.PI,
            turn: 1
        };
        function S(D) {
            const [h, z, j, F = 1] = a(D, c, M);
            return I({
                h: h,
                s: z,
                l: j,
                a: F
            });
        }
        function T(D) {
            const h = D.substring(1);
            switch (h.length) {
              case 3:
              case 4:
                {
                    const [D, z, j] = [ 0, 1, 2 ].map((D => parseInt(`${h[D]}${h[D]}`, 16))), F = h.length === 3 ? 1 : parseInt(`${h[3]}${h[3]}`, 16) / 255;
                    return {
                        r: D,
                        g: z,
                        b: j,
                        a: F
                    };
                }

              case 6:
              case 8:
                {
                    const [D, z, j] = [ 0, 2, 4 ].map((D => parseInt(h.substring(D, D + 2), 16))), F = h.length === 6 ? 1 : parseInt(h.substring(6, 8), 16) / 255;
                    return {
                        r: D,
                        g: z,
                        b: j,
                        a: F
                    };
                }
            }
            return null;
        }
        function e(D) {
            const h = G.get(D);
            return {
                r: h >> 16 & 255,
                g: h >> 8 & 255,
                b: h >> 0 & 255,
                a: 1
            };
        }
        function v(D) {
            const h = r.get(D);
            return {
                r: h >> 16 & 255,
                g: h >> 8 & 255,
                b: h >> 0 & 255,
                a: 1
            };
        }
        function m(D) {
            let h = 0;
            const z = (h, z, j) => {
                D = D.substring(0, h) + j + D.substring(z);
            };
            while ((h = D.indexOf("calc(")) !== -1) {
                const l = (0, F.getParenthesesRange)(D, h);
                if (!l) break;
                let Z = D.slice(l.start + 1, l.end - 1);
                const A = Z.includes("%");
                Z = Z.split("%").join("");
                const q = Math.round((0, j.evalMath)(Z));
                z(l.start - 4, l.end, q + (A ? "%" : ""));
            }
            return D;
        }
        z.lowerCalcExpression = m;
        const G = new Map(Object.entries({
            aliceblue: 15792383,
            antiquewhite: 16444375,
            aqua: 65535,
            aquamarine: 8388564,
            azure: 15794175,
            beige: 16119260,
            bisque: 16770244,
            black: 0,
            blanchedalmond: 16772045,
            blue: 255,
            blueviolet: 9055202,
            brown: 10824234,
            burlywood: 14596231,
            cadetblue: 6266528,
            chartreuse: 8388352,
            chocolate: 13789470,
            coral: 16744272,
            cornflowerblue: 6591981,
            cornsilk: 16775388,
            crimson: 14423100,
            cyan: 65535,
            darkblue: 139,
            darkcyan: 35723,
            darkgoldenrod: 12092939,
            darkgray: 11119017,
            darkgrey: 11119017,
            darkgreen: 25600,
            darkkhaki: 12433259,
            darkmagenta: 9109643,
            darkolivegreen: 5597999,
            darkorange: 16747520,
            darkorchid: 10040012,
            darkred: 9109504,
            darksalmon: 15308410,
            darkseagreen: 9419919,
            darkslateblue: 4734347,
            darkslategray: 3100495,
            darkslategrey: 3100495,
            darkturquoise: 52945,
            darkviolet: 9699539,
            deeppink: 16716947,
            deepskyblue: 49151,
            dimgray: 6908265,
            dimgrey: 6908265,
            dodgerblue: 2003199,
            firebrick: 11674146,
            floralwhite: 16775920,
            forestgreen: 2263842,
            fuchsia: 16711935,
            gainsboro: 14474460,
            ghostwhite: 16316671,
            gold: 16766720,
            goldenrod: 14329120,
            gray: 8421504,
            grey: 8421504,
            green: 32768,
            greenyellow: 11403055,
            honeydew: 15794160,
            hotpink: 16738740,
            indianred: 13458524,
            indigo: 4915330,
            ivory: 16777200,
            khaki: 15787660,
            lavender: 15132410,
            lavenderblush: 16773365,
            lawngreen: 8190976,
            lemonchiffon: 16775885,
            lightblue: 11393254,
            lightcoral: 15761536,
            lightcyan: 14745599,
            lightgoldenrodyellow: 16448210,
            lightgray: 13882323,
            lightgrey: 13882323,
            lightgreen: 9498256,
            lightpink: 16758465,
            lightsalmon: 16752762,
            lightseagreen: 2142890,
            lightskyblue: 8900346,
            lightslategray: 7833753,
            lightslategrey: 7833753,
            lightsteelblue: 11584734,
            lightyellow: 16777184,
            lime: 65280,
            limegreen: 3329330,
            linen: 16445670,
            magenta: 16711935,
            maroon: 8388608,
            mediumaquamarine: 6737322,
            mediumblue: 205,
            mediumorchid: 12211667,
            mediumpurple: 9662683,
            mediumseagreen: 3978097,
            mediumslateblue: 8087790,
            mediumspringgreen: 64154,
            mediumturquoise: 4772300,
            mediumvioletred: 13047173,
            midnightblue: 1644912,
            mintcream: 16121850,
            mistyrose: 16770273,
            moccasin: 16770229,
            navajowhite: 16768685,
            navy: 128,
            oldlace: 16643558,
            olive: 8421376,
            olivedrab: 7048739,
            orange: 16753920,
            orangered: 16729344,
            orchid: 14315734,
            palegoldenrod: 15657130,
            palegreen: 10025880,
            paleturquoise: 11529966,
            palevioletred: 14381203,
            papayawhip: 16773077,
            peachpuff: 16767673,
            peru: 13468991,
            pink: 16761035,
            plum: 14524637,
            powderblue: 11591910,
            purple: 8388736,
            rebeccapurple: 6697881,
            red: 16711680,
            rosybrown: 12357519,
            royalblue: 4286945,
            saddlebrown: 9127187,
            salmon: 16416882,
            sandybrown: 16032864,
            seagreen: 3050327,
            seashell: 16774638,
            sienna: 10506797,
            silver: 12632256,
            skyblue: 8900331,
            slateblue: 6970061,
            slategray: 7372944,
            slategrey: 7372944,
            snow: 16775930,
            springgreen: 65407,
            steelblue: 4620980,
            tan: 13808780,
            teal: 32896,
            thistle: 14204888,
            tomato: 16737095,
            turquoise: 4251856,
            violet: 15631086,
            wheat: 16113331,
            white: 16777215,
            whitesmoke: 16119285,
            yellow: 16776960,
            yellowgreen: 10145074
        })), r = new Map(Object.entries({
            ActiveBorder: 3906044,
            ActiveCaption: 0,
            AppWorkspace: 11184810,
            Background: 6513614,
            ButtonFace: 16777215,
            ButtonHighlight: 15329769,
            ButtonShadow: 10461343,
            ButtonText: 0,
            CaptionText: 0,
            GrayText: 8355711,
            Highlight: 11720703,
            HighlightText: 0,
            InactiveBorder: 16777215,
            InactiveCaption: 16777215,
            InactiveCaptionText: 0,
            InfoBackground: 16514245,
            InfoText: 0,
            Menu: 16185078,
            MenuText: 16777215,
            Scrollbar: 11184810,
            ThreeDDarkShadow: 0,
            ThreeDFace: 12632256,
            ThreeDHighlight: 16777215,
            ThreeDLightShadow: 16777215,
            ThreeDShadow: 0,
            Window: 15527148,
            WindowFrame: 11184810,
            WindowText: 0,
            "-webkit-focus-ring-color": 15046400
        }).map((([D, h]) => [ D.toLowerCase(), h ])));
        function t(D, h, z) {
            return (.2126 * D + .7152 * h + .0722 * z) / 255;
        }
        z.getSRGBLightness = t;
    }, {
        Ti: 36,
        eu: 42
    } ],
    35: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.compareIPV6 = z.isIPV6 = void 0;
        const j = /\[[0-9:a-zA-Z]+?\]/;
        function F(D) {
            const h = j.exec(D);
            if (!h) return false;
            const z = D.indexOf("?");
            if (z >= 0 && h.index > z) return false;
            return true;
        }
        z.isIPV6 = F;
        const l = /\[.*?\](\:\d+)?/;
        function Z(D, h) {
            const z = D.match(l)[0], j = h.match(l)[0];
            return z === j;
        }
        z.compareIPV6 = Z;
    }, {} ],
    36: [ function(D, h, z) {
        "use strict";
        function j(D) {
            const h = [], z = [];
            let j;
            for (let F = 0, Z = D.length; F < Z; F++) {
                const Z = D[F];
                if (!Z || Z === " ") continue;
                if (l.has(Z)) {
                    const D = l.get(Z);
                    while (z.length) {
                        const j = l.get(z[0]);
                        if (!j) break;
                        if (D.lessOrEqualThan(j)) h.push(z.shift()); else break;
                    }
                    z.unshift(Z);
                } else if (!j || l.has(j)) h.push(Z); else h[h.length - 1] += Z;
                j = Z;
            }
            h.push(...z);
            const F = [];
            for (let D = 0, z = h.length; D < z; D++) {
                const z = l.get(h[D]);
                if (z) {
                    const D = F.splice(0, 2);
                    F.push(z.exec(D[1], D[0]));
                } else F.unshift(parseFloat(h[D]));
            }
            return F[0];
        }
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.evalMath = void 0, z.evalMath = j;
        class F {
            constructor(D, h) {
                this.precendce = D, this.execMethod = h;
            }
            exec(D, h) {
                return this.execMethod(D, h);
            }
            lessOrEqualThan(D) {
                return this.precendce <= D.precendce;
            }
        }
        const l = new Map([ [ "+", new F(1, ((D, h) => D + h)) ], [ "-", new F(1, ((D, h) => D - h)) ], [ "*", new F(2, ((D, h) => D * h)) ], [ "/", new F(2, ((D, h) => D / h)) ] ]);
    }, {} ],
    37: [ function(D, h, z) {
        "use strict";
        function j(D, h, z, j, F) {
            return (D - h) * (F - j) / (z - h) + j;
        }
        function F(D, h, z) {
            return Math.min(z, Math.max(h, D));
        }
        function l(D, h) {
            const z = [];
            for (let j = 0, F = D.length; j < F; j++) {
                z[j] = [];
                for (let F = 0, l = h[0].length; F < l; F++) {
                    let l = 0;
                    for (let z = 0, Z = D[0].length; z < Z; z++) l += D[j][z] * h[z][F];
                    z[j][F] = l;
                }
            }
            return z;
        }
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.multiplyMatrices = z.clamp = z.scale = void 0, z.scale = j, z.clamp = F, z.multiplyMatrices = l;
    }, {} ],
    38: [ function(D, h, z) {
        "use strict";
        var j;
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.MessageType = void 0, function(D) {
            D["UI_GET_DATA"] = "ui-get-data", D["UI_GET_DEVTOOLS_DATA"] = "ui-get-devtools-data",
            D["UI_SUBSCRIBE_TO_CHANGES"] = "ui-subscribe-to-changes", D["UI_UNSUBSCRIBE_FROM_CHANGES"] = "ui-unsubscribe-from-changes",
            D["UI_CHANGE_SETTINGS"] = "ui-change-settings", D["UI_SET_THEME"] = "ui-set-theme",
            D["UI_TOGGLE_ACTIVE_TAB"] = "ui-toggle-active-tab", D["UI_MARK_NEWS_AS_READ"] = "ui-mark-news-as-read",
            D["UI_MARK_NEWS_AS_DISPLAYED"] = "ui-mark-news-as-displayed", D["UI_LOAD_CONFIG"] = "ui-load-config",
            D["UI_APPLY_DEV_DYNAMIC_THEME_FIXES"] = "ui-apply-dev-dynamic-theme-fixes", D["UI_RESET_DEV_DYNAMIC_THEME_FIXES"] = "ui-reset-dev-dynamic-theme-fixes",
            D["UI_APPLY_DEV_INVERSION_FIXES"] = "ui-apply-dev-inversion-fixes", D["UI_RESET_DEV_INVERSION_FIXES"] = "ui-reset-dev-inversion-fixes",
            D["UI_APPLY_DEV_STATIC_THEMES"] = "ui-apply-dev-static-themes", D["UI_RESET_DEV_STATIC_THEMES"] = "ui-reset-dev-static-themes",
            D["UI_SAVE_FILE"] = "ui-save-file", D["UI_REQUEST_EXPORT_CSS"] = "ui-request-export-css",
            D["UI_COLOR_SCHEME_CHANGE"] = "ui-color-scheme-change", D["BG_CHANGES"] = "bg-changes",
            D["BG_ADD_CSS_FILTER"] = "bg-add-css-filter", D["BG_ADD_STATIC_THEME"] = "bg-add-static-theme",
            D["BG_ADD_SVG_FILTER"] = "bg-add-svg-filter", D["BG_ADD_DYNAMIC_THEME"] = "bg-add-dynamic-theme",
            D["BG_EXPORT_CSS"] = "bg-export-css", D["BG_UNSUPPORTED_SENDER"] = "bg-unsupported-sender",
            D["BG_CLEAN_UP"] = "bg-clean-up", D["BG_RELOAD"] = "bg-reload", D["BG_FETCH_RESPONSE"] = "bg-fetch-response",
            D["BG_UI_UPDATE"] = "bg-ui-update", D["BG_CSS_UPDATE"] = "bg-css-update", D["CS_COLOR_SCHEME_CHANGE"] = "cs-color-scheme-change",
            D["CS_FRAME_CONNECT"] = "cs-frame-connect", D["CS_FRAME_FORGET"] = "cs-frame-forget",
            D["CS_FRAME_FREEZE"] = "cs-frame-freeze", D["CS_FRAME_RESUME"] = "cs-frame-resume",
            D["CS_EXPORT_CSS_RESPONSE"] = "cs-export-css-response", D["CS_FETCH"] = "cs-fetch",
            D["CS_DARK_THEME_DETECTED"] = "cs-dark-theme-detected", D["CS_DARK_THEME_NOT_DETECTED"] = "cs-dark-theme-not-detected",
            D["CS_LOG"] = "cs-log";
        }(j = z.MessageType || (z.MessageType = {}));
    }, {} ],
    39: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.loadAsText = z.readResponseAsDataURL = z.loadAsDataURL = void 0;
        const j = D("CH");
        async function F(D, h, z) {
            const F = await fetch(D, {
                cache: "force-cache",
                credentials: "omit",
                referrer: z
            });
            if (j.isFirefox && h === "text/css" && D.startsWith("moz-extension://") && D.endsWith(".css")) return F;
            if (h && !F.headers.get("Content-Type").startsWith(h)) throw new Error(`Mime type mismatch when loading ${D}`);
            if (!F.ok) throw new Error(`Unable to load ${D} ${F.status} ${F.statusText}`);
            return F;
        }
        async function l(D, h) {
            const z = await F(D, h);
            return await Z(z);
        }
        async function Z(D) {
            const h = await D.blob(), z = await new Promise((D => {
                const z = new FileReader;
                z.onloadend = () => D(z.result), z.readAsDataURL(h);
            }));
            return z;
        }
        async function A(D, h, z) {
            const j = await F(D, h, z);
            return await j.text();
        }
        z.loadAsDataURL = l, z.readResponseAsDataURL = Z, z.loadAsText = A;
    }, {
        CH: 41
    } ],
    40: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.parseGradient = void 0;
        const j = D("eu"), F = "gradient".length, l = "conic-", Z = l.length, A = "radial-", q = "linear-";
        function Q(D) {
            const h = [];
            let z = 0, Q = l.length;
            while ((z = D.indexOf("gradient", Q)) !== -1) {
                let I;
                if ([ q, A, l ].find((h => {
                    if (z - h.length >= 0) {
                        const j = D.substring(z - h.length, z);
                        if (j === h) {
                            if (D.slice(z - h.length - 10, z - h.length - 1) === "repeating") return I = `repeating-${h}gradient`,
                            true;
                            if (D.slice(z - h.length - 8, z - h.length - 1) === "-webkit") return I = `-webkit-${h}gradient`,
                            true;
                            return I = `${h}gradient`, true;
                        }
                    }
                })), !I) break;
                const {start: E, end: X} = (0, j.getParenthesesRange)(D, z + F), f = D.substring(E + 1, X - 1);
                Q = X + 1 + Z, h.push({
                    typeGradient: I,
                    match: f,
                    offset: I.length + 2,
                    index: z - I.length + F,
                    hasComma: true
                });
            }
            if (h.length) h[h.length - 1].hasComma = false;
            return h;
        }
        z.parseGradient = Q;
    }, {
        eu: 42
    } ],
    41: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.isCSSColorSchemePropSupported = z.isFetchSupported = z.isXMLHttpRequestSupported = z.compareChromeVersions = z.isDefinedSelectorSupported = z.firefoxVersion = z.chromiumVersion = z.isNonPersistent = z.isMatchMediaChangeEventListenerBuggy = z.isMatchMediaChangeEventListenerSupported = z.isShadowDomSupported = z.isMobile = z.isMacOS = z.isWindows = z.isSafari = z.isEdge = z.isOpera = z.isYaBrowser = z.isVivaldi = z.isFirefox = z.isThunderbird = z.isChromium = void 0;
        const j = typeof navigator !== "undefined", F = j ? navigator.userAgentData && Array.isArray(navigator.userAgentData.brands) ? navigator.userAgentData.brands.map((D => `${D.brand.toLowerCase()} ${D.version}`)).join(" ") : navigator.userAgent.toLowerCase() : "some useragent", l = j ? navigator.userAgentData && typeof navigator.userAgentData.platform === "string" ? navigator.userAgentData.platform.toLowerCase() : navigator.platform.toLowerCase() : "some platform";
        function Z(D, h) {
            const z = D.split(".").map((D => parseInt(D))), j = h.split(".").map((D => parseInt(D)));
            for (let D = 0; D < z.length; D++) if (z[D] !== j[D]) return z[D] < j[D] ? -1 : 1;
            return 0;
        }
        z.isChromium = true, z.isThunderbird = false, z.isFirefox = false, z.isVivaldi = false,
        z.isYaBrowser = false, z.isOpera = false, z.isEdge = false, z.isSafari = false,
        z.isWindows = l.startsWith("win"), z.isMacOS = l.startsWith("mac"), z.isMobile = j && navigator.userAgentData ? navigator.userAgentData.mobile : F.includes("mobile"),
        z.isShadowDomSupported = typeof ShadowRoot === "function", z.isMatchMediaChangeEventListenerSupported = true,
        z.isMatchMediaChangeEventListenerBuggy = j && navigator.userAgentData && [ "Linux", "Android" ].includes(navigator.userAgentData.platform) || l.startsWith("linux"),
        z.isNonPersistent = true, z.chromiumVersion = (() => {
            const D = F.match(/chrom(?:e|ium)(?:\/| )([^ ]+)/);
            if (D && D[1]) return D[1];
            return "";
        })(), z.firefoxVersion = (() => {
            const D = F.match(/(?:firefox|librewolf)(?:\/| )([^ ]+)/);
            if (D && D[1]) return D[1];
            return "";
        })(), z.isDefinedSelectorSupported = (() => {
            try {
                return document.querySelector(":defined"), true;
            } catch (D) {
                return false;
            }
        })(), z.compareChromeVersions = Z, z.isXMLHttpRequestSupported = typeof XMLHttpRequest === "function",
        z.isFetchSupported = typeof fetch === "function", z.isCSSColorSchemePropSupported = true;
    }, {} ],
    42: [ function(D, h, z) {
        "use strict";
        function j(D, h) {
            if (!isFinite(h)) throw new Error(`Wrong char index ${h}`);
            let z = "", j = 0, F, l = 0;
            do {
                j++, F = l, l = D.indexOf("\n", F + 1);
            } while (l >= 0 && l <= h);
            const Z = h - F;
            if (z += `line ${j}, column ${Z}`, z += "\n", h < D.length) z += D.substring(F + 1, l); else z += D.substring(D.lastIndexOf("\n") + 1);
            return z += "\n", z += `${new Array(Z).join("-")}^`, z;
        }
        function F(D, h) {
            const z = Math.min(D.length, h.length);
            for (let j = 0; j < z; j++) if (D[j] !== h[j]) return j;
            if (D.length !== h.length) return z;
            return -1;
        }
        function l(D) {
            return D.replace(/\r/g, "").split("\n").map((D => D.trim())).filter((D => D));
        }
        function Z(D) {
            return D.concat("").join("\n");
        }
        function A(D, h, z = 0) {
            const j = [];
            let F;
            while (F = D.exec(h)) j.push(F[z]);
            return j;
        }
        function q(D) {
            return D.length * 2;
        }
        function Q(D) {
            function h(D) {
                return D.replace(/^\s+/, "");
            }
            function z(D) {
                if (D === 0) return "";
                return " ".repeat(4 * D);
            }
            if (D.length < 5e4) {
                const h = /[^{}]+{\s*}/;
                while (h.test(D)) D = D.replace(h, "");
            }
            const j = D.replace(/\s{2,}/g, " ").replace(/\{/g, "{\n").replace(/\}/g, "\n}\n").replace(/\;(?![^\(|\"]*(\)|\"))/g, ";\n").replace(/\,(?![^\(|\"]*(\)|\"))/g, ",\n").replace(/\n\s*\n/g, "\n").split("\n");
            let F = 0;
            const l = [];
            for (let D = 0, Z = j.length; D < Z; D++) {
                const Z = `${j[D]}\n`;
                if (Z.includes("{")) l.push(z(F++) + h(Z)); else if (Z.includes("}")) l.push(z(--F) + h(Z)); else l.push(z(F) + h(Z));
            }
            return l.join("").trim();
        }
        function I(D, h = 0) {
            const z = D.length;
            let j = 0, F = -1;
            for (let l = h; l < z; l++) if (j === 0) {
                const h = D.indexOf("(", l);
                if (h < 0) break;
                F = h, j++, l = h;
            } else {
                const h = D.indexOf(")", l);
                if (h < 0) break;
                const z = D.indexOf("(", l);
                if (z < 0 || h < z) {
                    if (j--, j === 0) return {
                        start: F,
                        end: h + 1
                    };
                    l = h;
                } else j++, l = z;
            }
            return null;
        }
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.getParenthesesRange = z.formatCSS = z.getStringSize = z.getMatches = z.formatArray = z.parseArray = z.getTextDiffIndex = z.getTextPositionMessage = void 0,
        z.getTextPositionMessage = j, z.getTextDiffIndex = F, z.parseArray = l, z.formatArray = Z,
        z.getMatches = A, z.getStringSize = q, z.formatCSS = Q, z.getParenthesesRange = I;
    }, {} ],
    43: [ function(D, h, z) {
        "use strict";
        function j(D) {
            let h = false, z = null, j;
            const F = (...F) => {
                if (j = F, z) h = true; else D(...j), z = requestAnimationFrame((() => {
                    if (z = null, h) D(...j), h = false;
                }));
            }, l = () => {
                cancelAnimationFrame(z), h = false, z = null;
            };
            return Object.assign(F, {
                cancel: l
            });
        }
        function F() {
            const D = [];
            let h = null;
            function z() {
                let z;
                while (z = D.shift()) z();
                h = null;
            }
            function j(j) {
                if (D.push(j), !h) h = requestAnimationFrame(z);
            }
            function F() {
                D.splice(0), cancelAnimationFrame(h), h = null;
            }
            return {
                add: j,
                cancel: F
            };
        }
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.createAsyncTasksQueue = z.throttle = void 0, z.throttle = j, z.createAsyncTasksQueue = F;
    }, {} ],
    44: [ function(D, h, z) {
        "use strict";
        function j(D) {
            const h = D.split(":").slice(0, 2), z = D.trim().toLowerCase(), j = z.endsWith("am") || z.endsWith("a.m."), F = z.endsWith("pm") || z.endsWith("p.m.");
            let l = h.length > 0 ? parseInt(h[0]) : 0;
            if (isNaN(l) || l > 23) l = 0;
            if (j && l === 12) l = 0;
            if (F && l < 12) l += 12;
            let Z = h.length > 1 ? parseInt(h[1]) : 0;
            if (isNaN(Z) || Z > 59) Z = 0;
            return [ l, Z ];
        }
        function F(D) {
            return D.split(":").map((D => parseInt(D)));
        }
        function l(D, h) {
            if (D[0] === h[0] && D[1] === h[1]) return 0;
            if (D[0] < h[0] || D[0] === h[0] && D[1] < h[1]) return -1;
            return 1;
        }
        function Z(D, h, z = new Date) {
            const j = F(D), A = F(h), q = [ z.getHours(), z.getMinutes() ];
            if (l(j, A) > 0) return Z(h, D, z);
            if (l(j, A) === 0) return null;
            if (l(q, j) < 0) return z.setHours(j[0]), z.setMinutes(j[1]), z.setSeconds(0), z.setMilliseconds(0),
            z.getTime();
            if (l(q, A) < 0) return z.setHours(A[0]), z.setMinutes(A[1]), z.setSeconds(0), z.setMilliseconds(0),
            z.getTime();
            return new Date(z.getFullYear(), z.getMonth(), z.getDate() + 1, j[0], j[1]).getTime();
        }
        function A(D, h, z = new Date) {
            const j = F(D), Z = F(h), A = [ z.getHours(), z.getMinutes() ];
            if (l(j, Z) > 0) return l(j, A) <= 0 || l(A, Z) < 0;
            return l(j, A) <= 0 && l(A, Z) < 0;
        }
        function q(D, h, z) {
            if (h < D) return z <= h || D <= z;
            return D < z && z < h;
        }
        function Q(D) {
            let h = 0;
            if (D.seconds) h += D.seconds * 1e3;
            if (D.minutes) h += D.minutes * 60 * 1e3;
            if (D.hours) h += D.hours * 60 * 60 * 1e3;
            if (D.days) h += D.days * 24 * 60 * 60 * 1e3;
            return h;
        }
        function I(D) {
            return Q(D) / 1e3 / 60;
        }
        function E(D, h, z) {
            const j = Date.UTC(z.getUTCFullYear(), 0, 0, 0, 0, 0, 0), F = Q({
                days: 1
            }), l = Math.floor((z.getTime() - j) / F), Z = 90.83333333333333, A = Math.PI / 180, q = 180 / Math.PI, I = h / 15;
            function E(h) {
                const z = l + ((h ? 6 : 18) - I) / 24, j = .9856 * z - 3.289;
                let F = j + 1.916 * Math.sin(j * A) + .02 * Math.sin(2 * j * A) + 282.634;
                if (F > 360) F -= 360; else if (F < 0) F += 360;
                let E = q * Math.atan(.91764 * Math.tan(F * A));
                if (E > 360) E -= 360; else if (E < 0) E += 360;
                const X = Math.floor(F / 90) * 90, f = Math.floor(E / 90) * 90;
                E += X - f, E /= 15;
                const s = .39782 * Math.sin(F * A), L = Math.cos(Math.asin(s)), P = (Math.cos(Z * A) - s * Math.sin(D * A)) / (L * Math.cos(D * A));
                if (P > 1) return {
                    alwaysDay: false,
                    alwaysNight: true,
                    time: 0
                }; else if (P < -1) return {
                    alwaysDay: true,
                    alwaysNight: false,
                    time: 0
                };
                const x = (h ? 360 - q * Math.acos(P) : q * Math.acos(P)) / 15, n = x + E - .06571 * z - 6.622;
                let w = n - I;
                if (w > 24) w -= 24; else if (w < 0) w += 24;
                return {
                    alwaysDay: false,
                    alwaysNight: false,
                    time: Math.round(w * Q({
                        hours: 1
                    }))
                };
            }
            const X = E(true), f = E(false);
            if (X.alwaysDay || f.alwaysDay) return {
                alwaysDay: true
            }; else if (X.alwaysNight || f.alwaysNight) return {
                alwaysNight: true
            };
            return {
                sunriseTime: X.time,
                sunsetTime: f.time
            };
        }
        function X(D, h, z = new Date) {
            const j = E(D, h, z);
            if (j.alwaysDay) return false; else if (j.alwaysNight) return true;
            const F = j.sunriseTime, l = j.sunsetTime, Z = z.getUTCHours() * Q({
                hours: 1
            }) + z.getUTCMinutes() * Q({
                minutes: 1
            }) + z.getUTCSeconds() * Q({
                seconds: 1
            }) + z.getUTCMilliseconds();
            return q(l, F, Z);
        }
        function f(D, h, z = new Date) {
            const j = E(D, h, z);
            if (j.alwaysDay) return z.getTime() + Q({
                days: 1
            }); else if (j.alwaysNight) return z.getTime() + Q({
                days: 1
            });
            const [F, l] = j.sunriseTime < j.sunsetTime ? [ j.sunriseTime, j.sunsetTime ] : [ j.sunsetTime, j.sunriseTime ], Z = z.getUTCHours() * Q({
                hours: 1
            }) + z.getUTCMinutes() * Q({
                minutes: 1
            }) + z.getUTCSeconds() * Q({
                seconds: 1
            }) + z.getUTCMilliseconds();
            if (Z <= F) return Date.UTC(z.getUTCFullYear(), z.getUTCMonth(), z.getUTCDate(), 0, 0, 0, F);
            if (Z <= l) return Date.UTC(z.getUTCFullYear(), z.getUTCMonth(), z.getUTCDate(), 0, 0, 0, l);
            return Date.UTC(z.getUTCFullYear(), z.getUTCMonth(), z.getUTCDate() + 1, 0, 0, 0, F);
        }
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.nextTimeChangeAtLocation = z.isNightAtLocation = z.getDurationInMinutes = z.getDuration = z.isInTimeIntervalLocal = z.nextTimeInterval = z.parseTime = void 0,
        z.parseTime = j, z.nextTimeInterval = Z, z.isInTimeIntervalLocal = A, z.getDuration = Q,
        z.getDurationInMinutes = I, z.isNightAtLocation = X, z.nextTimeChangeAtLocation = f;
    }, {} ],
    45: [ function(D, h, z) {
        "use strict";
        function j(D) {
            return (D < 16 ? "0" : "") + D.toString(16);
        }
        function F() {
            if ("randomUUID" in crypto) {
                const D = crypto.randomUUID();
                return D.substring(0, 8) + D.substring(9, 13) + D.substring(14, 18) + D.substring(19, 23) + D.substring(24);
            }
            return Array.from(crypto.getRandomValues(new Uint8Array(16))).map((D => j(D))).join("");
        }
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.generateUID = void 0, z.generateUID = F;
    }, {} ],
    46: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.isLocalFile = z.fullyQualifiedDomainMatchesWildcard = z.isFullyQualifiedDomainWildcard = z.isFullyQualifiedDomain = z.isURLEnabled = z.isPDF = z.isURLMatched = z.isURLInList = z.compareURLPatterns = z.getURLHostOrProtocol = z.isRelativeHrefOnAbsolutePath = z.getAbsoluteURL = z.parseURL = z.parsedURLCache = void 0;
        const j = D("pw"), F = false;
        let l;
        function Z(D) {
            if (!l) l = document.createElement("a");
            return l.href = D, l.href;
        }
        function A(D, h = null) {
            const j = `${D}${h ? `;${h}` : ""}`;
            if (z.parsedURLCache.has(j)) return z.parsedURLCache.get(j);
            if (h) {
                const F = new URL(D, Z(h));
                return z.parsedURLCache.set(j, F), F;
            }
            const F = new URL(Z(D));
            return z.parsedURLCache.set(D, F), F;
        }
        function q(D, h) {
            if (h.match(/^data\\?\:/)) return h;
            if (/^\/\//.test(h)) return `${location.protocol}${h}`;
            const z = A(D), j = A(h, z.href);
            return j.href;
        }
        function Q(D) {
            if (D.startsWith("data:")) return true;
            const h = A(D);
            if (h.protocol !== location.protocol) return false;
            if (h.hostname !== location.hostname) return false;
            if (h.port !== location.port) return false;
            return h.pathname === location.pathname;
        }
        function I(D) {
            const h = new URL(D);
            if (h.host) return h.host; else if (h.protocol === "file:") return h.pathname;
            return h.protocol;
        }
        function E(D, h) {
            return D.localeCompare(h);
        }
        function X(D, h) {
            for (let z = 0; z < h.length; z++) if (f(D, h[z])) return true;
            return false;
        }
        function f(D, h) {
            const z = (0, j.isIPV6)(D), F = (0, j.isIPV6)(h);
            if (z && F) return (0, j.compareIPV6)(D, h); else if (!z && !F) {
                const z = s(h);
                return z !== null && Boolean(D.match(z));
            }
            return false;
        }
        function s(D) {
            try {
                D = D.trim();
                const h = D[0] === "^", z = D[D.length - 1] === "$", j = /\/\$?$/.test(D);
                let F, l, Z;
                if (D = D.replace(/^\^/, "").replace(/\$$/, "").replace(/^.*?\/{2,3}/, "").replace(/\?.*$/, "").replace(/\/$/, ""),
                (F = D.indexOf("/")) >= 0) l = D.substring(0, F), Z = D.replace(/\$/g, "").substring(F); else l = D.replace(/\$/g, "");
                let A = h ? "^(.*?\\:\\/{2,3})?" : "^(.*?\\:\\/{2,3})?([^/]*?\\.)?";
                const q = l.split(".");
                A += "(";
                for (let D = 0; D < q.length; D++) if (q[D] === "*") q[D] = "[^\\.\\/]+?";
                if (A += q.join("\\."), A += ")", Z) A += "(", A += Z.replace("/", "\\/"), A += ")";
                return A += z ? "(\\/?(\\?[^/]*?)?)$" : `(\\/${j ? "" : "?"}.*?)$`, new RegExp(A, "i");
            } catch (D) {
                return null;
            }
        }
        function L(D) {
            if (D.includes(".pdf")) {
                if (D.includes("?")) D = D.substring(0, D.lastIndexOf("?"));
                if (D.includes("#")) D = D.substring(0, D.lastIndexOf("#"));
                if (D.match(/(wikipedia|wikimedia)\.org/i) && D.match(/(wikipedia|wikimedia)\.org\/.*\/[a-z]+\:[^\:\/]+\.pdf/i) || D.match(/timetravel\.mementoweb\.org\/reconstruct/i) && D.match(/\.pdf$/i) || D.match(/dropbox\.com\/s\//i) && D.match(/\.pdf$/i)) return false;
                if (D.endsWith(".pdf")) {
                    for (let h = D.length; h > 0; h--) if (D[h] === "=") return false; else if (D[h] === "/") return true;
                } else return false;
            }
            return false;
        }
        function P(D, h, {isProtected: z, isInDarkList: j, isDarkThemeDetected: l}, Z = true) {
            if (J(D) && !Z) return false;
            if (z && !h.enableForProtectedPages) return false;
            if (F) return true;
            if (L(D)) return h.enableForPDF;
            const A = X(D, h.siteList), q = X(D, h.siteListEnabled);
            if (h.applyToListedOnly) return q || A;
            if (q) return true;
            if (j || h.detectDarkTheme && l) return false;
            return !A;
        }
        function x(D) {
            return /^[a-z0-9\.\-]+$/i.test(D) && D.indexOf("..") === -1;
        }
        function n(D) {
            if (!D.includes("*") || !/^[a-z0-9\.\-\*]+$/i.test(D)) return false;
            const h = D.split(".");
            for (const D of h) if (D !== "*" && !/^[a-z0-9\-]+$/i.test(D)) return false;
            return true;
        }
        function w(D, h) {
            const z = D.toLowerCase().split("."), j = h.toLowerCase().split(".");
            if (j.length < z.length) return false;
            while (z.length) {
                const D = z.pop(), h = j.pop();
                if (D !== "*" && D !== h) return false;
            }
            return true;
        }
        function J(D) {
            return D && D.startsWith("file:///");
        }
        z.parsedURLCache = new Map, z.parseURL = A, z.getAbsoluteURL = q, z.isRelativeHrefOnAbsolutePath = Q,
        z.getURLHostOrProtocol = I, z.compareURLPatterns = E, z.isURLInList = X, z.isURLMatched = f,
        z.isPDF = L, z.isURLEnabled = P, z.isFullyQualifiedDomain = x, z.isFullyQualifiedDomainWildcard = n,
        z.fullyQualifiedDomainMatchesWildcard = w, z.isLocalFile = J;
    }, {
        pw: 35
    } ],
    47: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.documentIsVisible = z.removeDocumentVisibilityListener = z.setDocumentVisibilityListener = void 0;
        let j = null, F = !document.hidden;
        const l = {
            capture: true,
            passive: true
        };
        function Z() {
            document.addEventListener("visibilitychange", j, l), window.addEventListener("pageshow", j, l),
            window.addEventListener("focus", j, l);
        }
        function A() {
            document.removeEventListener("visibilitychange", j, l), window.removeEventListener("pageshow", j, l),
            window.removeEventListener("focus", j, l);
        }
        function q(D) {
            const h = Boolean(j);
            if (j = () => {
                if (!document.hidden) Q(), D(), F = true;
            }, !h) Z();
        }
        function Q() {
            A(), j = null;
        }
        function I() {
            return F;
        }
        z.setDocumentVisibilityListener = q, z.removeDocumentVisibilityListener = Q, z.documentIsVisible = I;
    }, {} ]
}, {}, [ 1 ]);
