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
        TD: 4
    } ],
    3: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        });
        const j = D("Dk");
        if (document.documentElement instanceof HTMLHtmlElement && matchMedia("(prefers-color-scheme: dark)").matches && !document.querySelector(j.STYLESHEET_FALLBACK_SELECTOR)) {
            const D = 'html, body, body :not(iframe):not(div[style^="position:absolute;top:0;left:-"]) { background-color: #181a1b !important; border-color: #776e62 !important; color: #e8e6e3 !important; } html, body { opacity: 1 !important; transition: none !important; }', h = document.createElement("style");
            if (h.classList.add(j.STYLESHEET_COMMON_CLASSNAME), h.classList.add(j.STYLESHEET_FALLBACK_SELECTOR.substring(1)),
            h.media = "screen", h.textContent = D, document.head) document.head.append(h); else {
                const D = document.documentElement;
                D.append(h);
                const z = new MutationObserver((() => {
                    if (document.head) if (z.disconnect(), h.isConnected) document.head.append(h);
                }));
                z.observe(D, {
                    childList: true
                });
            }
        }
    }, {
        Dk: 2
    } ],
    4: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.PREFIX = void 0, z.PREFIX = "dm";
    }, {} ]
}, {}, [ 1 ]);