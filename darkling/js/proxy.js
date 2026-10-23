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
        "1p": 7
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
        TD: 6
    } ],
    3: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.EVENT_ARG = void 0;
        const j = D("Dk"), F = D("k8"), l = D("rV");
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
        rV: 2,
        k8: 5,
        Dk: 4
    } ],
    4: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.injectProxy = void 0;
        const j = D("rV");
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
        rV: 2
    } ],
    5: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.logInfoCollapsed = z.logWarn = z.logInfo = void 0;
        const j = D("4o"), F = true, l = false, Z = "info";
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
        "4o": 8
    } ],
    6: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.PREFIX = void 0, z.PREFIX = "dm";
    }, {} ],
    7: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), D("t5");
    }, {
        t5: 3
    } ],
    8: [ function(D, h, z) {
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
    }, {} ]
}, {}, [ 1 ]);