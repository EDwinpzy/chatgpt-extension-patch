/* Translation-only service worker. */

importScripts('settings.js', 'engine.js');

/* Clicking the extension icon opens its only extension page: settings. */
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
