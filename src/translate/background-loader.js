/*
 * Service worker entry point for the patched extension.
 *
 * The manifest points background.service_worker here instead of at
 * background.js. Both files share one global scope, which lets the host
 * extension's own worker stay byte-identical while the translation engine
 * loads alongside it.
 *
 * Order matters: the host worker is defined first, then the translation
 * settings and engine register their message and context-menu listeners, and
 * last the bookmark port: its classifier reuses the translation settings
 * (the model list and the "thinking off" fields) and its worker registers the
 * bookmark listeners, which have to be in place every time the worker starts.
 */

importScripts(
  '../background.js',
  'settings.js',
  'engine.js',
  '../bookmarks/lib/bookmark-utils.js',
  '../bookmarks/lib/deduplicator.js',
  '../bookmarks/lib/classifier.js',
  '../bookmarks/worker.js'
);
