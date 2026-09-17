/*
 * Diagnostic: the same few sentences, two models, side by side.
 *
 * Speed says nothing about whether the Chinese is usable, and the speed
 * fixture is 200 copies of one sentence. This sends a handful of realistic
 * lines - a heading, a short button, a long paragraph, and one line full of
 * product vocabulary - through one model and prints what comes back.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   $env:QUALITY_MODEL = 'translategemma:4b'
 *   node tests\probe-translation-quality.cjs
 */

const http = require('http');

const MODEL = process.env.QUALITY_MODEL || 'hunyuan-mt-7b:latest';
const BASE = 'http://127.0.0.1:11434/v1';

const LINES = [
  'Welcome back, EDwinpzy',
  'Buy more credits',
  'Your plan renews on the fifteenth of every month.',
  'Requests on this model cost no credits while capacity lasts.',
  'Credits never expire, and the whole workspace shares one balance.',
  'Open the command line interface, sign in, and run your first prompt.',
  'Usage and billing details are shown here.',
];

function post(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const target = new URL(url);
    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (response) => {
        let raw = '';
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode, raw }));
      }
    );
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

async function main() {
  const reply = await post(BASE + '/chat/completions', {
    model: MODEL,
    temperature: 0.1,
    max_tokens: 1024,
    messages: [
      {
        role: 'system',
        content:
          'Translate each numbered line into Chinese. Keep the [n] prefix. ' +
          'One line in, one line out, no notes.',
      },
      { role: 'user', content: LINES.map((text, index) => '[' + (index + 1) + '] ' + text).join('\n') },
    ],
  });

  if (reply.status !== 200) {
    console.log('HTTP ' + reply.status + ': ' + reply.raw.slice(0, 300));
    return;
  }
  let content = '';
  try {
    content = JSON.parse(reply.raw).choices[0].message.content || '';
  } catch (error) {
    content = '(unreadable reply) ' + reply.raw.slice(0, 200);
  }

  const got = new Map();
  content.split('\n').forEach((line) => {
    const match = /^\s*\[(\d+)\]\s*([\s\S]*)$/.exec(line);
    if (match) got.set(Number(match[1]), match[2].trim());
  });

  console.log('model: ' + MODEL);
  console.log('');
  LINES.forEach((text, index) => {
    console.log('[' + (index + 1) + '] ' + text);
    console.log('    -> ' + (got.get(index + 1) || '(missing)'));
  });
  const missing = LINES.filter((text, index) => !got.get(index + 1)).length;
  console.log('');
  console.log('lines back: ' + got.size + ' / ' + LINES.length + (missing ? '  <- ' + missing + ' missing' : ''));
}

main().catch((error) => {
  console.error('quality probe failed: ' + (error && error.message));
  process.exit(1);
});
