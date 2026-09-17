/*
 * Settings page logic. Every control writes straight through to storage; there
 * is no save button.
 */

let state = null;
let editingIndex = -1;

const $ = (id) => document.getElementById(id);

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function save(patch) {
  state = Object.assign(state, patch);
  return writeTranslateSettings(patch);
}

/* ------------------------------------------------------------------- nav */

function showPane(name) {
  document.querySelectorAll('.nav .item').forEach((item) => {
    item.classList.toggle('on', item.dataset.pane === name);
  });
  document.querySelectorAll('.view').forEach((view) => {
    view.hidden = view.id !== 'view-' + name;
  });
}

document.querySelectorAll('.nav .item').forEach((item) => {
  item.addEventListener('click', () => showPane(item.dataset.pane));
});

/* ------------------------------------------------------------------ segs */

function wireSeg(id, key) {
  const group = $(id);
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    group.querySelectorAll('button').forEach((item) => item.classList.toggle('on', item === button));
    const raw = button.dataset.value;
    save({ [key]: /^\d+$/.test(raw) ? Number(raw) : raw });
  });
}

function paintSeg(id, value) {
  const group = $(id);
  group.querySelectorAll('button').forEach((item) => {
    item.classList.toggle('on', item.dataset.value === String(value));
  });
}

function wireSwitch(id, key) {
  const button = $(id);
  button.addEventListener('click', () => {
    const next = !button.classList.contains('on');
    button.classList.toggle('on', next);
    button.setAttribute('aria-checked', String(next));
    save({ [key]: next });
  });
}

function paintSwitch(id, value) {
  const button = $(id);
  button.classList.toggle('on', value !== false);
  button.setAttribute('aria-checked', String(value !== false));
}

/* ---------------------------------------------------------------- models */

function selectModel(id) {
  if (String(id) === String(state.translateModelId)) return;
  save({ translateModelId: id });
  renderModels();
}

/*
 * What the failure alert says. The engine reports the model's own reason
 * without the JSON around it; the one thing it cannot know is that the card
 * that just failed is the one translation runs on - which is worth saying out
 * loud, because the fallback list covers exactly this case.
 */
function testFailureText(reply, model) {
  const reason = String((reply && reply.error) || '无法连接').slice(0, 400);
  const inUse = String(state.translateModelId) === String(model.id);
  if (!inUse || state.models.length < 2) return reason;
  return reason + '\n\n这一档正是翻译在用的那一个；翻译时连不上会自动按列表顺序换下一个。';
}

/*
 * Removing a model only removes the entry: whatever is running locally keeps
 * running, and the card can be added back at any time. The last one stays,
 * because a list with no model in it has nothing left to translate with.
 */
function removeModel(index) {
  const gone = state.models[index];
  if (!gone || state.models.length <= 1) return;
  const models = state.models.filter((model, position) => position !== index);
  const patch = { models };
  if (String(state.translateModelId) === String(gone.id)) patch.translateModelId = models[0].id;
  if (String(state.subtitleModelId) === String(gone.id)) patch.subtitleModelId = '';
  save(patch);
  renderModels();
  renderSubtitle();
}

/*
 * The order of the list is the order the engine walks when a model cannot be
 * reached, so it is the user's to arrange. The card leaves its slot before it
 * lands, which is why a move downwards ends up one place above the slot it was
 * dropped on.
 */
function modelDropIndex(from, over, after) {
  const to = over + (after ? 1 : 0);
  return from < to ? to - 1 : to;
}

function moveModel(from, to) {
  if (from === to || from < 0 || to < 0 || to >= state.models.length) return;
  const models = state.models.slice();
  const moved = models.splice(from, 1)[0];
  models.splice(to, 0, moved);
  /* Only the order changes: whichever model is in use stays in use. */
  save({ models });
  renderModels();
  /* The list was rebuilt, so the handle has to be found again. */
  const grip = document.querySelector('#modelList .card:nth-child(' + (to + 1) + ') .grip');
  if (grip) grip.focus();
}

/* Which card a drag started from, and whether it started on a handle. */
let dragFrom = -1;
let dragArmed = false;

function clearDropMarks() {
  document.querySelectorAll('#modelList .card').forEach((card) => {
    card.classList.remove('dragging', 'drop-before', 'drop-after');
  });
}

function modelSummary(model) {
  const parts = [];
  try {
    parts.push(new URL(model.baseUrl).host);
  } catch (error) {
    parts.push(model.baseUrl || '未填地址');
  }
  parts.push(model.kind === 'local' ? '本地' : '云端');
  /* Cloud models always say which interface they are sent to - it is a pick,
   * not a guess, so it belongs on the card. Local services are chat only. */
  if (model.kind !== 'local') parts.push(DIALECT_LABELS[model.dialect] || DIALECT_LABELS.chat);
  return parts.join(' · ');
}

function renderModels() {
  const list = $('modelList');
  list.textContent = '';
  state.models.forEach((model, index) => {
    const active = String(model.id) === String(state.translateModelId);
    const card = document.createElement('div');
    card.className = 'card' + (active ? ' on' : '');
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', String(active));
    card.addEventListener('click', () => selectModel(model.id));

    /*
     * A handle rather than a draggable card: the whole card is a click target
     * for switching models, and the buttons inside it are click targets too.
     * Hidden while there is only one model, because there is nothing to
     * reorder against.
     */
    if (state.models.length > 1) {
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'grip';
      grip.title = '拖动调整顺序';
      grip.setAttribute('aria-label', '拖动调整顺序：' + (model.name || model.model || '未命名'));
      const dots = document.createElement('span');
      dots.className = 'ico';
      dots.setAttribute('data-icon', 'grip');
      grip.appendChild(dots);
      /* Dragging is allowed only when it started here; the keyboard path below
       * does the same thing without a pointer. */
      grip.addEventListener('mousedown', () => {
        dragArmed = true;
      });
      /* A click on the handle is not a drag; forget the arming on release. */
      grip.addEventListener('mouseup', () => {
        dragArmed = false;
      });
      grip.addEventListener('click', (event) => event.stopPropagation());
      grip.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
        if (!step) return;
        event.preventDefault();
        event.stopPropagation();
        moveModel(index, index + step);
      });
      card.draggable = true;
      card.addEventListener('dragstart', (event) => {
        if (!dragArmed) {
          event.preventDefault();
          return;
        }
        dragFrom = index;
        card.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        /* Firefox refuses to start a drag with an empty payload. */
        event.dataTransfer.setData('text/plain', String(index));
      });
      card.addEventListener('dragover', (event) => {
        if (dragFrom < 0) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const box = card.getBoundingClientRect();
        const after = event.clientY > box.top + box.height / 2;
        card.classList.toggle('drop-after', after);
        card.classList.toggle('drop-before', !after);
      });
      card.addEventListener('dragleave', (event) => {
        /* Moving between the card's own children is not leaving it. */
        if (card.contains(event.relatedTarget)) return;
        card.classList.remove('drop-before', 'drop-after');
      });
      card.addEventListener('drop', (event) => {
        event.preventDefault();
        const from = dragFrom;
        dragFrom = -1;
        dragArmed = false;
        if (from < 0) return;
        const box = card.getBoundingClientRect();
        const after = event.clientY > box.top + box.height / 2;
        clearDropMarks();
        moveModel(from, modelDropIndex(from, index, after));
      });
      card.addEventListener('dragend', () => {
        dragFrom = -1;
        dragArmed = false;
        clearDropMarks();
      });
      card.appendChild(grip);
    } else {
      card.draggable = false;
    }

    // The badge doubles as the control: the model in use says so, every other
    // one offers to take over. A grey "备用" tag left people unable to tell
    // which model was actually translating.
    const tag = document.createElement(active ? 'span' : 'button');
    tag.className = 'tag' + (active ? ' on' : ' action');
    tag.textContent = active ? '在用' : '设为在用';
    if (!active) {
      tag.type = 'button';
      tag.addEventListener('click', (event) => {
        event.stopPropagation();
        selectModel(model.id);
      });
    }

    const grow = document.createElement('div');
    grow.className = 'grow';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = model.name || model.model || '未命名';
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = modelSummary(model);
    grow.appendChild(name);
    grow.appendChild(sub);

    const edit = document.createElement('button');
    edit.className = 'btn sm ghost';
    edit.textContent = '编辑';
    edit.addEventListener('click', (event) => {
      event.stopPropagation();
      openModelModal(index);
    });

    const test = document.createElement('button');
    test.className = 'btn sm ghost';
    test.textContent = '测试';
    test.addEventListener('click', async (event) => {
      event.stopPropagation();
      test.textContent = '测试中';
      const reply = await send({ type: 'translate:test-model', model }).catch(() => null);
      if (reply && reply.ok) {
        test.textContent = '连接正常';
        window.setTimeout(() => { test.textContent = '测试'; }, 1600);
      } else {
        test.textContent = '失败';
        window.setTimeout(() => { test.textContent = '测试'; }, 2600);
        window.alert(testFailureText(reply, model));
      }
    });

    card.appendChild(tag);
    card.appendChild(grow);
    card.appendChild(test);
    card.appendChild(edit);
    if (state.models.length > 1) {
      /*
       * Two taps, because 测试 and 编辑 sit in the same row and a stray click
       * should not throw away a model that was typed in by hand. The second
       * tap lands within a couple of seconds or the button goes back.
       */
      const remove = document.createElement('button');
      remove.className = 'btn sm ghost danger';
      remove.textContent = '删除';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        if (remove.dataset.armed === '1') {
          removeModel(index);
          return;
        }
        remove.dataset.armed = '1';
        remove.className = 'btn sm danger';
        remove.textContent = '确认删除';
        window.setTimeout(() => {
          remove.dataset.armed = '0';
          remove.className = 'btn sm ghost danger';
          remove.textContent = '删除';
        }, 2600);
      });
      card.appendChild(remove);
    }
    list.appendChild(card);
  });
}

/*
 * Local models only need a service and a model name: the endpoint follows from
 * the service, and there is no key to type.
 */
const LOCAL_SERVICES = [
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://127.0.0.1:11434/v1' },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1' },
  { id: 'llamacpp', label: 'llama.cpp', baseUrl: 'http://127.0.0.1:8080/v1' },
  { id: 'custom', label: '自定义地址…', baseUrl: '' },
];

/* Endpoints taken from the local Codex Router's provider table. */
const CLOUD_SERVICES = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  { id: 'commandcode', label: 'Command Code', baseUrl: 'https://api.commandcode.ai/provider/v1' },
  { id: 'opencode', label: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1' },
  { id: 'opencode-go', label: 'OpenCode Go', baseUrl: 'https://opencode.ai/zen/go/v1' },
  { id: 'custom', label: '自定义服务…', baseUrl: '' },
];

/* Only for the model card subtitle; the engine owns the actual routing. */
const DIALECT_LABELS = {
  chat: 'Chat Completions',
  messages: 'Messages',
  responses: 'Responses',
};

/* Keeps a key while flipping between services inside one dialog session. */
const cloudKeyDraft = {};
let cloudKeyTimer = null;
let localUrlTimer = null;

function currentKind() {
  return $('modelKind').querySelector('button.on').dataset.value;
}

function selectedService() {
  const id = $('fieldService').value;
  return LOCAL_SERVICES.find((service) => service.id === id) || LOCAL_SERVICES[0];
}

function localBaseUrl() {
  const service = selectedService();
  return service.id === 'custom' ? $('fieldLocalBaseUrl').value.trim() : service.baseUrl;
}

function paintKind(kind) {
  const local = kind === 'local';
  paintSeg('modelKind', local ? 'local' : 'cloud');
  $('localFields').hidden = !local;
  $('cloudFields').hidden = local;
  clearTestResult();
}

/* A leftover result from the other tab would read as if this one passed. */
function clearTestResult() {
  const result = $('testResult');
  result.hidden = true;
  result.textContent = '';
  result.classList.remove('bad');
  $('testModel').textContent = '测试连接';
}

function selectedCloudService() {
  const id = $('fieldCloudService').value;
  return CLOUD_SERVICES.find((service) => service.id === id) || CLOUD_SERVICES[0];
}

function cloudBaseUrl() {
  const service = selectedCloudService();
  return service.id === 'custom' ? $('fieldBaseUrl').value.trim() : service.baseUrl;
}

function paintCloudOptions() {
  const select = $('fieldCloudService');
  select.textContent = '';
  CLOUD_SERVICES.forEach((service) => {
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = service.label;
    select.appendChild(option);
  });
}

function paintCloudService() {
  const custom = selectedCloudService().id === 'custom';
  $('cloudPresetFields').hidden = custom;
  $('cloudCustomFields').hidden = !custom;
}

/* A picker with one option keeps a saved value alive until the list refreshes. */
function seedSelect(select, value) {
  select.textContent = '';
  if (!value) return;
  const option = document.createElement('option');
  option.value = value;
  option.textContent = value;
  select.appendChild(option);
  select.value = value;
}

async function refreshCloudModels(preselect) {
  const select = $('fieldCloudModel');
  const hint = $('cloudModelHint');
  const apiKey = $('fieldCloudKey').value.trim();
  const baseUrl = cloudBaseUrl();
  select.textContent = '';
  if (!baseUrl) {
    hint.textContent = '先选一个服务。';
    return;
  }
  if (!apiKey) {
    hint.textContent = '填好 API Key 后会自动读取模型列表。';
    return;
  }
  hint.textContent = '正在读取模型列表…';
  const reply = await send({ type: 'translate:list-models', baseUrl, apiKey }).catch(() => null);
  if (!reply || !reply.ok) {
    hint.textContent = (reply && reply.error) || '读取失败';
    return;
  }
  reply.models.forEach((id) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    select.appendChild(option);
  });
  if (preselect && reply.models.includes(preselect)) select.value = preselect;
  hint.textContent = '找到 ' + reply.models.length + ' 个模型。';
}

function paintServiceOptions() {
  const select = $('fieldService');
  select.textContent = '';
  LOCAL_SERVICES.forEach((service) => {
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = service.label;
    select.appendChild(option);
  });
}

function paintLocalBaseUrlRow() {
  $('localBaseUrlRow').hidden = selectedService().id !== 'custom';
}

async function refreshLocalModels(preselect) {
  const select = $('fieldLocalModel');
  const hint = $('localModelHint');
  const baseUrl = localBaseUrl();
  select.textContent = '';
  if (!baseUrl) {
    hint.textContent = '填上服务地址后会自动读取模型列表。';
    return;
  }
  hint.textContent = '正在读取模型列表…';
  const reply = await send({ type: 'translate:list-models', baseUrl }).catch(() => null);
  if (!reply || !reply.ok) {
    hint.textContent = (reply && reply.error) || '读取失败';
    return;
  }
  reply.models.forEach((id) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    select.appendChild(option);
  });
  if (preselect && reply.models.includes(preselect)) select.value = preselect;
  hint.textContent = '找到 ' + reply.models.length + ' 个模型。';
}

function openModelModal(index) {
  editingIndex = typeof index === 'number' ? index : -1;
  const model = editingIndex >= 0
    ? state.models[editingIndex]
    : { id: '', name: '', kind: 'cloud', baseUrl: '', apiKey: '', model: '' };
  $('modalTitle').textContent = editingIndex >= 0 ? '编辑模型' : '添加模型';
  paintKind(model.kind === 'local' ? 'local' : 'cloud');

  $('fieldName').value = model.name || '';
  $('fieldBaseUrl').value = model.baseUrl || '';
  $('fieldApiKey').value = model.apiKey || '';
  $('fieldModel').value = model.model || '';

  paintServiceOptions();
  const matched = LOCAL_SERVICES.find(
    (service) => service.baseUrl && service.baseUrl === String(model.baseUrl || '')
  );
  $('fieldService').value = matched ? matched.id : (model.baseUrl ? 'custom' : 'ollama');
  $('fieldLocalBaseUrl').value = matched ? '' : (model.baseUrl || '');
  paintLocalBaseUrlRow();
  seedSelect($('fieldLocalModel'), model.kind === 'local' ? model.model : '');

  paintCloudOptions();
  const cloudMatched = CLOUD_SERVICES.find(
    (service) => service.baseUrl && service.baseUrl === String(model.baseUrl || '')
  );
  $('fieldCloudService').value = cloudMatched ? cloudMatched.id : (model.baseUrl ? 'custom' : 'deepseek');
  paintCloudService();
  const cloudServiceId = $('fieldCloudService').value;
  $('fieldCloudKey').value =
    (model.kind === 'cloud' ? model.apiKey : '') || cloudKeyDraft[cloudServiceId] || '';
  seedSelect($('fieldCloudModel'), model.kind === 'cloud' ? model.model : '');
  $('cloudModelHint').textContent = '填好 API Key 后会自动读取这个服务可用的模型。';
  /* No "auto": the pick is what gets sent. Chat is the default because every
   * provider outside OpenCode's catalog speaks it. */
  $('fieldDialect').value = DIALECT_LABELS[model.dialect] ? model.dialect : 'chat';

  $('testResult').hidden = true;
  $('modelModal').hidden = false;

  if (model.kind === 'local') refreshLocalModels(model.model);
  else if (cloudMatched && $('fieldCloudKey').value) refreshCloudModels(model.model);
}

function closeModelModal() {
  $('modelModal').hidden = true;
  editingIndex = -1;
}

function readModalModel() {
  const kind = currentKind();
  const existing = editingIndex >= 0 ? state.models[editingIndex] : null;

  if (kind === 'local') {
    const service = selectedService();
    const model = $('fieldLocalModel').value || '';
    return {
      id: (existing && existing.id) || 'model-' + Date.now().toString(36),
      name: service.label + (model ? ' · ' + model : ''),
      kind,
      baseUrl: localBaseUrl(),
      apiKey: '',
      model,
    };
  }

  const service = selectedCloudService();
  if (service.id !== 'custom') {
    const model = $('fieldCloudModel').value || '';
    return {
      id: (existing && existing.id) || 'model-' + Date.now().toString(36),
      name: service.label + (model ? ' · ' + model : ''),
      kind,
      baseUrl: service.baseUrl,
      apiKey: $('fieldCloudKey').value.trim(),
      model,
      dialect: $('fieldDialect').value || 'chat',
    };
  }

  const baseUrl = $('fieldBaseUrl').value.trim();
  const model = $('fieldModel').value.trim();
  const name = $('fieldName').value.trim() || model || baseUrl;
  return {
    id: (existing && existing.id) || 'model-' + Date.now().toString(36),
    name,
    kind,
    baseUrl,
    apiKey: $('fieldApiKey').value.trim(),
    model,
    dialect: $('fieldDialect').value || 'chat',
  };
}

$('addModel').addEventListener('click', () => openModelModal(-1));
$('cancelModel').addEventListener('click', closeModelModal);
$('modelModal').addEventListener('click', (event) => {
  if (event.target === $('modelModal')) closeModelModal();
});

$('modelKind').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  paintKind(button.dataset.value);
  if (button.dataset.value === 'local' && !$('fieldLocalModel').options.length) {
    refreshLocalModels();
  }
});

$('fieldService').addEventListener('change', () => {
  paintLocalBaseUrlRow();
  refreshLocalModels();
});

$('fieldLocalBaseUrl').addEventListener('input', () => {
  if (localUrlTimer) clearTimeout(localUrlTimer);
  localUrlTimer = setTimeout(() => refreshLocalModels(), 700);
});

$('fieldCloudKey').addEventListener('input', () => {
  const serviceId = $('fieldCloudService').value;
  cloudKeyDraft[serviceId] = $('fieldCloudKey').value.trim();
  if (cloudKeyTimer) clearTimeout(cloudKeyTimer);
  cloudKeyTimer = setTimeout(() => refreshCloudModels(), 700);
});

$('fieldCloudService').addEventListener('change', () => {
  paintCloudService();
  clearTestResult();
  const serviceId = $('fieldCloudService').value;
  $('fieldCloudKey').value = cloudKeyDraft[serviceId] || '';
  seedSelect($('fieldCloudModel'), '');
  $('cloudModelHint').textContent = '填好 API Key 后会自动读取这个服务可用的模型。';
  if ($('fieldCloudKey').value) refreshCloudModels();
});

$('testModel').addEventListener('click', async () => {
  const button = $('testModel');
  const result = $('testResult');
  button.textContent = '测试中…';
  result.hidden = false;
  result.classList.remove('bad');
  result.textContent = '正在请求模型…';
  const reply = await send({ type: 'translate:test-model', model: readModalModel() }).catch(() => null);
  button.textContent = '测试连接';
  if (reply && reply.ok) {
    result.textContent = '连接正常（' + reply.elapsedMs + ' 毫秒）\n' + (reply.sample || '');
  } else {
    result.classList.add('bad');
    result.textContent = (reply && reply.error) || '无法连接';
  }
});

$('saveModel').addEventListener('click', () => {
  const model = readModalModel();
  if (!model.baseUrl) {
    window.alert('还没有确定服务地址');
    return;
  }
  if (!model.model) {
    window.alert(currentKind() === 'local' ? '请先选一个模型' : '模型 ID 要填');
    return;
  }
  const models = state.models.slice();
  if (editingIndex >= 0) models[editingIndex] = model;
  else models.push(model);
  const patch = { models };
  if (!state.translateModelId) patch.translateModelId = model.id;
  save(patch);
  closeModelModal();
  renderModels();
});

/* --------------------------------------------------------------- display */

function renderDisplay() {
  const select = $('targetLang');
  select.textContent = '';
  TARGET_LANGUAGES.forEach((lang) => {
    const option = document.createElement('option');
    option.value = lang.id;
    option.textContent = lang.label;
    select.appendChild(option);
  });
  select.value = state.targetLang;
  paintSeg('displayMode', state.displayMode);
  paintSwitch('autoSelection', state.autoTranslateSelection);
  paintSwitch('disableThinking', state.disableThinking);
  paintSwitch('autoTranslateAll', state.autoTranslateAll);
}

$('targetLang').addEventListener('change', (event) => save({ targetLang: event.target.value }));
  wireSeg('displayMode', 'displayMode');
  wireSwitch('autoSelection', 'autoTranslateSelection');
wireSwitch('disableThinking', 'disableThinking');
wireSwitch('autoTranslateAll', 'autoTranslateAll');

/* -------------------------------------------------------------- glossary */

function renderGlossary() {
  const body = $('glossaryBody');
  body.textContent = '';

  // Shipped terms first, read-only: they travel with the extension, and the
  // user's own entry with the same source text takes over from them.
  TRANSLATE_BUILTIN_GLOSSARY.forEach((entry) => {
    const row = document.createElement('tr');
    row.className = 'builtin';
    /* A name written on both sides is not a translation: it means "leave this
     * alone", which reads better than the same word twice. */
    const keep = String(entry.from).trim().toLowerCase() === String(entry.to).trim().toLowerCase();
    [entry.from, keep ? '保持原文' : entry.to].forEach((value) => {
      const cell = document.createElement('td');
      const text = document.createElement('span');
      text.className = 'term';
      text.textContent = value;
      cell.appendChild(text);
      row.appendChild(cell);
    });
    const source = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'srctag';
    badge.textContent = '内置';
    source.appendChild(badge);
    row.appendChild(source);
    body.appendChild(row);
  });

  state.glossary.forEach((entry, index) => {
    const row = document.createElement('tr');

    const fromCell = document.createElement('td');
    const from = document.createElement('input');
    from.type = 'text';
    from.value = entry.from || '';
    from.addEventListener('change', () => {
      state.glossary[index].from = from.value.trim();
      save({ glossary: state.glossary });
    });
    fromCell.appendChild(from);

    const toCell = document.createElement('td');
    const to = document.createElement('input');
    to.type = 'text';
    to.value = entry.to || '';
    to.addEventListener('change', () => {
      state.glossary[index].to = to.value.trim();
      save({ glossary: state.glossary });
    });
    toCell.appendChild(to);

    const actionCell = document.createElement('td');
    const remove = document.createElement('button');
    remove.className = 'x';
    remove.textContent = '×';
    remove.title = '删除';
    remove.addEventListener('click', () => {
      state.glossary.splice(index, 1);
      save({ glossary: state.glossary });
      renderGlossary();
    });
    actionCell.appendChild(remove);

    row.appendChild(fromCell);
    row.appendChild(toCell);
    row.appendChild(actionCell);
    body.appendChild(row);
  });
}

$('addTerm').addEventListener('click', () => {
  state.glossary.push({ from: '', to: '' });
  save({ glossary: state.glossary });
  renderGlossary();
});

$('exportGlossary').addEventListener('click', () => {
  const csv = state.glossary
    .filter((entry) => entry.from || entry.to)
    .map((entry) => '"' + String(entry.from).replace(/"/g, '""') + '","' + String(entry.to).replace(/"/g, '""') + '"')
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'glossary.csv';
  link.click();
  URL.revokeObjectURL(url);
});

$('importGlossary').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const text = await file.text();
    const parsed = text
      .split(/\r?\n/)
      .map((line) => line.split(',').map((cell) => cell.replace(/^"|"$/g, '').trim()))
      .filter((cells) => cells.length >= 2 && cells[0])
      .map((cells) => ({ from: cells[0], to: cells[1] }));
    if (!parsed.length) {
      window.alert('没有解析到词条');
      return;
    }
    state.glossary = state.glossary.concat(parsed);
    save({ glossary: state.glossary });
    renderGlossary();
  });
  input.click();
});

/* -------------------------------------------------------------- subtitle */

/* The subtitle model list: "same as translation" plus every saved model. */
function renderSubtitle() {
  const select = $('subtitleModel');
  select.textContent = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '同翻译模型';
  select.appendChild(none);
  state.models.forEach((model) => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name || model.model || '未命名';
    select.appendChild(option);
  });
  select.value = state.subtitleModelId || '';
  paintSwitch('subtitleEnabled', state.subtitleEnabled !== false);
  paintSeg('subtitleFontSize', Number(state.subtitleFontSize) || 20);
  paintSeg('subtitlePosition', state.subtitlePosition || 'bottom');
  paintSeg('subtitleMaxLines', Number(state.subtitleMaxLines) || 2);
}

wireSwitch('subtitleEnabled', 'subtitleEnabled');
wireSeg('subtitleFontSize', 'subtitleFontSize');
wireSeg('subtitlePosition', 'subtitlePosition');
wireSeg('subtitleMaxLines', 'subtitleMaxLines');

$('subtitleModel').addEventListener('change', (event) => {
  save({ subtitleModelId: event.target.value });
});

/* ----------------------------------------------------------------- sites */

function renderSiteList(containerId, countId, key) {
  const container = $(containerId);
  container.textContent = '';
  const list = state[key] || [];

  list.forEach((value, index) => {
    const chip = document.createElement('span');
    chip.className = 'entry';
    chip.textContent = value;
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.title = '删除';
    remove.addEventListener('click', () => {
      list.splice(index, 1);
      save({ [key]: list });
      renderSiteList(containerId, countId, key);
    });
    chip.appendChild(remove);
    container.appendChild(chip);
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'example.com';
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const value = input.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!value) return;
    if (!list.includes(value)) list.push(value);
    save({ [key]: list });
    renderSiteList(containerId, countId, key);
  });
  container.appendChild(input);
  $(countId).textContent = list.length + ' 个';
}

$('clearCache').addEventListener('click', async () => {
  const button = $('clearCache');
  const reply = await send({ type: 'translate:clear-cache' }).catch(() => null);
  button.textContent = reply ? '已清空 ' + reply.removed + ' 条' : '清空失败';
  window.setTimeout(() => { button.textContent = '清空缓存'; }, 1800);
});

/* ------------------------------------------------------------------ init */

async function init() {
  state = await readTranslateSettings();
  renderModels();
  renderDisplay();
  renderGlossary();
  renderSubtitle();
  renderSiteList('blockedSites', 'blockedSiteCount', 'blockedSites');
}

init().catch((error) => {
  document.body.textContent = '设置页加载失败：' + (error && error.message ? error.message : error);
});
