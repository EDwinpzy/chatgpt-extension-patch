/*
 * One-off port: turns the ES modules of D:\MyProjects\bookmark-sorter into plain
 * scripts that the patched extension can importScripts from its service worker.
 *
 *   node tools\port-bookmarks.mjs
 *
 * What it does, per file:
 *   - strips the "export" keyword so the declarations become plain functions
 *   - wraps the whole file in an IIFE, so nothing lands in the worker's global
 *     scope except the single CodexBookmarks namespace
 *   - appends the namespace registration for the names the rest of the port uses
 *
 * The result is written to src\bookmarks\lib\. The model call and the settings
 * source in the ported classifier are edited by hand afterwards, so re-running
 * this script overwrites those edits: it is here to record where the code came
 * from, not to be run again casually.
 */

import fs from 'node:fs';
import path from 'node:path';

const FROM = 'D:/MyProjects/bookmark-sorter';
const TO = path.resolve(process.cwd(), 'src', 'bookmarks', 'lib');

const FILES = [
  {
    file: 'bookmark-utils.js',
    title: 'Bookmark tree helpers: walking the tree, nested folder paths, moves.',
    exported: [
      'collectBookmarks', 'getBookmarkBarBookmarks', 'getAllBookmarks',
      'ensureFolderPath', 'moveBookmark', 'batchMoveBookmarks', 'removeBookmark',
      'getBookmarkBarId', 'getBookmarkBarTree', 'getBookmarkBarCategories',
      'cleanEmptyFolders', 'mergeDuplicateFolders',
    ],
  },
  {
    file: 'deduplicator.js',
    title: 'Duplicate detection: URL normalisation, similarity pass, removals.',
    exported: ['normalizeUrl', 'findDuplicates', 'removeDuplicates', 'getDuplicateStats'],
  },
  {
    file: 'classifier.js',
    title: 'Classification: domain and keyword rules first, the model for the rest.',
    exported: ['classifyBookmarks', 'classifySingleBookmark', 'getDefaultCategories', 'validateCategory'],
    // Upstream read its own settings and guessed the API path from the host
    // name. Both are replaced by tools\parts\classify-model-call.js, which talks
    // to the model this extension already has configured.
    rename: [['callAIClassify(', 'classifyBatch(']],
    replace: {
      from: '/**\n * 获取扩展设置（多模型版本）',
      to: "throw lastError || new Error('所有模型均不可用');\n}",
      with: 'tools/parts/classify-model-call.js',
    },
  },
];

function transform(source, entry) {
  let body = source
    .replace(/^export\s+(async\s+function|function|const|class)/gm, '$1')
    .replace(/^export\s*\{[^}]*\};\s*$/gm, '')
    .trimEnd();

  for (const [from, to] of entry.rename || []) {
    body = body.split(from).join(to);
  }

  if (entry.replace) {
    const start = body.indexOf(entry.replace.from);
    const end = body.indexOf(entry.replace.to);
    if (start < 0 || end < 0) {
      throw new Error('port markers not found in ' + entry.file);
    }
    const replacement = fs.readFileSync(path.join(process.cwd(), entry.replace.with), 'utf8').trimEnd();
    body = body.slice(0, start) + replacement + body.slice(end + entry.replace.to.length);
  }

  const registered = entry.exported.join(',\n    ');
  return `/*
 * Ported from bookmark-sorter (${entry.file}).
 * ${entry.title}
 *
 * Plain script, not a module: the service worker loads it with importScripts.
 * Everything stays inside this function scope, and only the names listed at the
 * bottom are published on self.CodexBookmarks.
 */

(function () {
  'use strict';

${body}

  self.CodexBookmarks = Object.assign(self.CodexBookmarks || {}, {
    ${registered},
  });
})();
`;
}

fs.mkdirSync(TO, { recursive: true });
for (const entry of FILES) {
  const source = fs.readFileSync(path.join(FROM, 'lib', entry.file), 'utf8');
  const out = transform(source, entry);
  fs.writeFileSync(path.join(TO, entry.file), out, 'utf8');
  console.log('ported ' + entry.file + ' -> ' + path.join(TO, entry.file));
}
