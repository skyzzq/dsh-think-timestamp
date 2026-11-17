import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';

class MockNode {
  constructor(nodeType, nodeName) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.className = '';
    this._textContent = '';
    this._isConnected = false;
  }

  get textContent() {
    if (this.childNodes.length === 0) return this._textContent;
    return this.childNodes.map(c => c.textContent).join('');
  }

  set textContent(v) {
    this._textContent = String(v);
  }

  get isConnected() {
    if (!this.parentNode) return this._isConnected;
    return this.parentNode.isConnected;
  }

  setAttribute(k, v) {
    const old = this.attributes.get(k);
    this.attributes.set(k, String(v));
    if (globalThis.__observer_notify) {
      globalThis.__observer_notify({
        type: 'attributes',
        target: this,
        attributeName: k,
        oldValue: old
      });
    }
  }

  getAttribute(k) {
    return this.attributes.get(k) || null;
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    this.childNodes.push(child);
    child.parentNode = this;
    if (globalThis.__observer_notify) {
      globalThis.__observer_notify({
        type: 'childList',
        target: this,
        addedNodes: [child],
        removedNodes: []
      });
    }
    return child;
  }

  insertBefore(newChild, refChild) {
    if (newChild.parentNode) {
      newChild.parentNode.removeChild(newChild);
    }
    const idx = this.childNodes.indexOf(refChild);
    if (idx === -1) {
      return this.appendChild(newChild);
    }
    this.childNodes.splice(idx, 0, newChild);
    newChild.parentNode = this;
    if (globalThis.__observer_notify) {
      globalThis.__observer_notify({
        type: 'childList',
        target: this,
        addedNodes: [newChild],
        removedNodes: []
      });
    }
    return newChild;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
      if (globalThis.__observer_notify) {
        globalThis.__observer_notify({
          type: 'childList',
          target: this,
          addedNodes: [],
          removedNodes: [child]
        });
      }
    }
    return child;
  }

  get firstElementChild() {
    return this.childNodes.find(n => n.nodeType === 1) || null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    const idx = siblings.indexOf(this);
    return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  }

  querySelector(selector) {
    const list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
  }

  querySelectorAll(selector) {
    const res = [];
    function match(node) {
      if (node.nodeType !== 1) return;
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (node.className && node.className.split(/\s+/).includes(cls)) {
          res.push(node);
        }
      } else if (selector.includes('[class*="')) {
        const matchStr = selector.match(/\[class\*="([^"]+)"\]/)[1];
        if (node.className && node.className.includes(matchStr)) {
          res.push(node);
        }
      } else if (selector === '[data-variant="think"]') {
        if (node.getAttribute('data-variant') === 'think') {
          res.push(node);
        }
      } else if (selector === 'p, li') {
        if (node.nodeName === 'P' || node.nodeName === 'LI') {
          res.push(node);
        }
      } else if (selector === 'time[datetime]') {
        if (node.nodeName === 'TIME' && node.getAttribute('datetime')) {
          res.push(node);
        }
      }
      for (const child of node.childNodes) {
        match(child);
      }
    }
    for (const child of this.childNodes) {
      match(child);
    }
    return res;
  }
}

function setupMockDom() {
  const root = new MockNode(1, 'HTML');
  root._isConnected = true;
  const body = new MockNode(1, 'BODY');
  root.appendChild(body);
  const head = new MockNode(1, 'HEAD');
  root.appendChild(head);

  const document = {
    head,
    body,
    getElementById(id) {
      function find(node) {
        if (node.id === id) return node;
        for (const c of node.childNodes) {
          const r = find(c);
          if (r) return r;
        }
        return null;
      }
      return find(document.head) || find(document.body);
    },
    createElement(tag) {
      return new MockNode(1, tag.toUpperCase());
    },
    querySelectorAll(selector) {
      return document.body.querySelectorAll(selector);
    }
  };

  const observers = [];
  globalThis.__observer_notify = function (rec) {
    for (const ob of observers) {
      ob._enqueue(rec);
    }
  };

  class MockMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.queue = [];
      this.connected = false;
      observers.push(this);
    }

    observe(target, options) {
      this.connected = true;
      this.target = target;
      this.options = options;
    }

    _enqueue(rec) {
      if (!this.connected) return;
      this.queue.push(rec);
      queueMicrotask(() => {
        if (this.queue.length > 0) {
          const records = this.takeRecords();
          if (records.length > 0) {
            this.callback(records);
          }
        }
      });
    }

    takeRecords() {
      const records = [...this.queue];
      this.queue = [];
      return records;
    }

    disconnect() {
      this.connected = false;
      const idx = observers.indexOf(this);
      if (idx !== -1) observers.splice(idx, 1);
    }
  }

  globalThis.document = document;
  globalThis.MutationObserver = MockMutationObserver;
  // 简易 localStorage：跨 apply() 生命周期存活，用于验证「离开再回来」场景
  const lsData = new Map();
  const localStorage = {
    getItem(k) { return lsData.has(k) ? lsData.get(k) : null; },
    setItem(k, v) { lsData.set(k, String(v)); },
    removeItem(k) { lsData.delete(k); }
  };

  globalThis.window = {
    document,
    localStorage,
    requestAnimationFrame(fn) {
      return setTimeout(fn, 16);
    },
    cancelAnimationFrame(id) {
      clearTimeout(id);
    }
  };
}

test('1. Client interactive timestamp: retain timestamp on done, change color state', async () => {
  setupMockDom();

  let registeredModule = null;
  globalThis.window.__ModuleLoader__ = {
    load(def) {
      registeredModule = def.factory();
    }
  };

  await import('../lib/client.js');
  assert.ok(registeredModule, 'Client module should be registered');
  assert.ok(
    registeredModule.name === 'dsh-think-timestamp' || registeredModule.name === 'dsh-thinking-timestamp',
    'Module name should match'
  );

  // 构建一个正在思考的 DOM 节点
  const thinkEl = document.createElement('div');
  thinkEl.setAttribute('data-variant', 'think');
  thinkEl.setAttribute('data-state', 'running');

  const titleRow = document.createElement('div');
  titleRow.className = 'VJlF5q_row';
  const titleText = document.createElement('div');
  titleText.className = 'VJlF5q_title';
  titleText.textContent = '思考过程';
  titleRow.appendChild(titleText);
  thinkEl.appendChild(titleRow);

  const thinkBody = document.createElement('div');
  thinkBody.className = 'VJlF5q_thinkBody';
  const p1 = document.createElement('p');
  p1.textContent = '正在分析用户问题...';
  thinkBody.appendChild(p1);
  thinkEl.appendChild(thinkBody);

  document.body.appendChild(thinkEl);

  let cleanupFn = null;
  const mockCtx = {
    effect(fn) {
      cleanupFn = fn();
    }
  };

  registeredModule.apply(mockCtx);

  // 1. 验证运行态药丸生成
  const pill = titleRow.querySelector('.dsh-think-time-pill');
  assert.ok(pill, 'Pill element must be created');
  assert.equal(pill.getAttribute('data-state'), 'running');
  assert.match(pill.textContent, /⏱️ \d{2}:\d{2}:\d{2} \(思考中(?:\s*\d+s)?\.\.\.\)/);

  // 记录开始时间戳
  const originalTimestampMatch = pill.textContent.match(/\d{2}:\d{2}:\d{2}/);
  assert.ok(originalTimestampMatch);
  const startTimestampStr = originalTimestampMatch[0];

  // 2. 验证段落时间戳通过属性标记
  assert.match(p1.getAttribute('data-dsh-think-time'), /\d{2}:\d{2}:\d{2}/);

  // 3. 模拟思考完成: 切换为 ok 状态
  thinkEl.setAttribute('data-state', 'ok');

  // 等待微任务与 rAF
  await new Promise(r => setTimeout(r, 60));

  // 验证思考完成后：
  // A. 状态切换为 done（触发 CSS 变色为完成绿，去除呼吸动画）
  assert.equal(pill.getAttribute('data-state'), 'done', 'State must switch to done for color styling');
  // B. 依然保留原始思考时间戳与耗时！
  assert.ok(pill.textContent.includes(startTimestampStr), 'Must retain original thinking timestamp after complete');
  assert.match(pill.textContent, /⏱️ \d{2}:\d{2}:\d{2} \(耗时 \d+\.\d+s\)/);

  // C. 段落的时间戳属性依然保留
  assert.ok(p1.getAttribute('data-dsh-think-time'), 'Paragraph timestamp attribute must be retained');

  // 4. 验证清理
  if (cleanupFn) cleanupFn();
  assert.equal(document.getElementById('dsh-thinking-timestamp-style'), null);
});

test('2. Historical node re-hydration: retains thinking timestamp and sets state to done', async () => {
  setupMockDom();

  let registeredModule = null;
  globalThis.window.__ModuleLoader__ = {
    load(def) {
      registeredModule = def.factory();
    }
  };

  await import('../lib/client.js?v=2');

  const historicalThinkEl = document.createElement('div');
  historicalThinkEl.setAttribute('data-variant', 'think');
  historicalThinkEl.setAttribute('data-state', 'ok');
  historicalThinkEl.setAttribute('data-think-start', '14:20:00');
  historicalThinkEl.setAttribute('data-think-duration', '4.5');

  const titleRow = document.createElement('div');
  titleRow.className = 'VJlF5q_row';
  historicalThinkEl.appendChild(titleRow);
  document.body.appendChild(historicalThinkEl);

  const mockCtx = { effect: () => {} };
  registeredModule.apply(mockCtx);

  const pill = titleRow.querySelector('.dsh-think-time-pill');
  assert.ok(pill, 'Pill should exist for historical node');
  assert.equal(pill.getAttribute('data-state'), 'done');
  assert.equal(pill.textContent, '⏱️ 14:20:00 (耗时 4.5s)');
});

test('3. Direct ok node with native text sniffing: must retain elapsed duration', async () => {
  setupMockDom();

  let registeredModule = null;
  globalThis.window.__ModuleLoader__ = {
    load(def) {
      registeredModule = def.factory();
    }
  };

  await import('../lib/client.js?v=3');

  const thinkEl = document.createElement('div');
  thinkEl.setAttribute('data-variant', 'think');
  thinkEl.setAttribute('data-state', 'ok');

  const titleRow = document.createElement('div');
  titleRow.className = 'VJlF5q_row';
  const titleText = document.createElement('div');
  titleText.className = 'VJlF5q_title';
  titleText.textContent = '思考过程 · 6 秒';
  titleRow.appendChild(titleText);
  thinkEl.appendChild(titleRow);
  document.body.appendChild(thinkEl);

  const mockCtx = { effect: () => {} };
  registeredModule.apply(mockCtx);

  const pill = titleRow.querySelector('.dsh-think-time-pill');
  assert.ok(pill, 'Pill must be created');
  assert.equal(pill.getAttribute('data-state'), 'done');
  // 必须保留耗时 6.0s
  assert.match(pill.textContent, /⏱️ \d{2}:\d{2}:\d{2} \(耗时 6\.0s\)/);
});

test('4. Leave & return: timestamps must survive full DOM unmount/remount (no reset to now)', async () => {
  setupMockDom();

  let mod1 = null;
  globalThis.window.__ModuleLoader__ = {
    load(def) {
      mod1 = def.factory();
    }
  };

  await import('../lib/client.js?v=4a');

  // ── 第一次挂载：模拟正在思考的节点 ────────────────────────────────
  function buildTurn(nodeKey, state) {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-chat-node-key', nodeKey);

    const thinkEl = document.createElement('div');
    thinkEl.setAttribute('data-variant', 'think');
    thinkEl.setAttribute('data-state', state);

    const titleRow = document.createElement('div');
    titleRow.className = 'VJlF5q_row';
    const titleText = document.createElement('div');
    titleText.className = 'VJlF5q_title';
    titleText.textContent = '思考过程';
    titleRow.appendChild(titleText);
    thinkEl.appendChild(titleRow);

    const body = document.createElement('div');
    body.className = 'VJlF5q_thinkBody';
    const para = document.createElement('p');
    para.textContent = '第一段推理：先确认会话事件键的稳定性。';
    body.appendChild(para);
    thinkEl.appendChild(body);

    wrapper.appendChild(thinkEl);
    return { wrapper, thinkEl, titleRow, body, para };
  }

  const first = buildTurn('msg-42', 'running');
  document.body.appendChild(first.wrapper);

  const cleanupFns = [];
  mod1.apply({ effect: (fn) => { cleanupFns.push(fn()); } });

  const pill1 = first.titleRow.querySelector('.dsh-think-time-pill');
  assert.ok(pill1, 'Pill must exist while running');
  assert.equal(pill1.getAttribute('data-state'), 'running');
  const startStamp = first.thinkEl.getAttribute('data-think-start');
  assert.match(startStamp, /^\d{2}:\d{2}:\d{2}$/, 'start stamp must be captured while running');
  const paraStamp1 = first.para.getAttribute('data-dsh-think-time');
  assert.match(paraStamp1, /^\d{2}:\d{2}:\d{2}$/, 'paragraph stamp must be recorded');

  // 等待真实耗时累积，然后完成思考
  await new Promise((r) => setTimeout(r, 60));
  first.thinkEl.setAttribute('data-state', 'ok');
  await new Promise((r) => setTimeout(r, 120));

  const doneText1 = pill1.textContent;
  assert.match(doneText1, new RegExp('⏱️ ' + startStamp + ' \\(耗时 \\d+\\.\\ds\\)'), 'done text must carry start stamp');

  // 等待 localStorage 异步落盘
  await new Promise((r) => setTimeout(r, 260));

  // ── 模拟离开会话：卸载插件 + React 销毁整棵子树 ──────────────────
  for (const fn of cleanupFns) fn();
  document.body.removeChild(first.wrapper);

  // ── 第二次挂载：全新模块实例（等价于页面重进，只能靠 localStorage）──
  let mod2 = null;
  globalThis.window.__ModuleLoader__ = {
    load(def) {
      mod2 = def.factory();
    }
  };
  await import('../lib/client.js?v=4b');

  const second = buildTurn('msg-42', 'ok');
  document.body.appendChild(second.wrapper);

  mod2.apply({ effect: () => {} });

  const pill2 = second.titleRow.querySelector('.dsh-think-time-pill');
  assert.ok(pill2, 'Pill must exist after remount');

  // 核心断言：起始时间戳必须与首次挂载完全一致，绝不能是「当前时间」
  assert.equal(
    second.thinkEl.getAttribute('data-think-start'),
    startStamp,
    'start timestamp must survive unmount/remount'
  );
  assert.equal(
    pill2.textContent,
    doneText1,
    'pill text (stamp + duration) must be identical after remount'
  );

  // 段落时间戳同样必须还原
  assert.equal(
    second.para.getAttribute('data-dsh-think-time'),
    paraStamp1,
    'paragraph timestamp must survive unmount/remount'
  );
});

test('5. Legacy node without any record: no fabricated multi-hour duration', async () => {
  setupMockDom();

  let registeredModule = null;
  globalThis.window.__ModuleLoader__ = {
    load(def) {
      registeredModule = def.factory();
    }
  };

  await import('../lib/client.js?v=5');

  // 一条插件安装前就已存在的旧消息：有原生 <time>，但没有任何耗时记录
  const wrapper = document.createElement('div');
  const timeEl = document.createElement('time');
  timeEl.setAttribute('datetime', '2026-11-15T02:30:00.000Z');
  wrapper.appendChild(timeEl);

  const thinkEl = document.createElement('div');
  thinkEl.setAttribute('data-variant', 'think');
  thinkEl.setAttribute('data-state', 'ok');
  const titleRow = document.createElement('div');
  titleRow.className = 'VJlF5q_row';
  const titleText = document.createElement('div');
  titleText.className = 'VJlF5q_title';
  titleText.textContent = '思考过程';
  titleRow.appendChild(titleText);
  thinkEl.appendChild(titleRow);
  wrapper.appendChild(thinkEl);
  document.body.appendChild(wrapper);

  registeredModule.apply({ effect: () => {} });

  const pill = titleRow.querySelector('.dsh-think-time-pill');
  assert.ok(pill, 'Pill must exist');
  // 必须从原生 <time> 还原为东八区 10:30:00
  assert.equal(thinkEl.getAttribute('data-think-start'), '10:30:00');
  // 绝不允许凭空编造耗时
  assert.equal(pill.textContent, '⏱️ 10:30:00');
});

test('6. Multiple reasoning blocks under one message key must not share a record', async () => {
  setupMockDom();

  let mod = null;
  globalThis.window.__ModuleLoader__ = {
    load(def) {
      mod = def.factory();
    }
  };

  await import('../lib/client.js?v=6');

  function buildBlock(nodeKey, text) {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-chat-node-key', nodeKey);

    const thinkEl = document.createElement('div');
    thinkEl.setAttribute('data-variant', 'think');
    thinkEl.setAttribute('data-state', 'ok');

    const row = document.createElement('div');
    row.className = 'VJlF5q_row';
    const title = document.createElement('div');
    title.className = 'VJlF5q_title';
    title.textContent = '思考过程';
    row.appendChild(title);
    thinkEl.appendChild(row);

    const body = document.createElement('div');
    body.className = 'VJlF5q_thinkBody';
    const p = document.createElement('p');
    p.textContent = text;
    body.appendChild(p);
    thinkEl.appendChild(body);

    wrapper.appendChild(thinkEl);
    return { wrapper, thinkEl, row, para: p };
  }

  // 同一条消息（同一个 data-chat-node-key）下两个独立思考块
  const a = buildBlock('msg-shared', '第一段推理');
  const b = buildBlock('msg-shared', '第二段推理');
  document.body.appendChild(a.wrapper);
  document.body.appendChild(b.wrapper);

  mod.apply({ effect: () => {} });

  const startA = a.thinkEl.getAttribute('data-think-start');
  const startB = b.thinkEl.getAttribute('data-think-start');
  assert.match(startA, /^\d{2}:\d{2}:\d{2}$/, 'first block must get a stamp');
  assert.match(startB, /^\d{2}:\d{2}:\d{2}$/, 'second block must get its own stamp');

  // 两个块各自独立记录，不能互相覆盖
  const raw = globalThis.window.localStorage.getItem('dsh-think-ts:v1');
  const parsed = JSON.parse(raw);
  const keys = Object.keys(parsed.records).filter((k) => k.startsWith('k:msg-shared'));
  assert.equal(keys.length, 2, 'each reasoning block needs its own record, got: ' + keys.join(','));

  // 各自的段落时间戳也必须独立
  assert.ok(a.para.getAttribute('data-dsh-think-time'));
  assert.ok(b.para.getAttribute('data-dsh-think-time'));
});

test('7. Leave mid-thinking & return: backlogged paragraphs get distinct stamps', async () => {
  setupMockDom();

  let mod1 = null;
  globalThis.window.__ModuleLoader__ = {
    load(def) {
      mod1 = def.factory();
    }
  };

  await import('../lib/client.js?v=7a');

  function build(nodeKey, state) {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-chat-node-key', nodeKey);
    const thinkEl = document.createElement('div');
    thinkEl.setAttribute('data-variant', 'think');
    thinkEl.setAttribute('data-state', state);
    const row = document.createElement('div');
    row.className = 'VJlF5q_row';
    const title = document.createElement('div');
    title.className = 'VJlF5q_title';
    title.textContent = '思考过程';
    row.appendChild(title);
    thinkEl.appendChild(row);
    const body = document.createElement('div');
    body.className = 'VJlF5q_thinkBody';
    thinkEl.appendChild(body);
    wrapper.appendChild(thinkEl);
    return { wrapper, thinkEl, row, body };
  }

  function addPara(host, text) {
    const p = document.createElement('p');
    p.textContent = text;
    host.body.appendChild(p);
    return p;
  }

  // ── 第一次：思考进行中，已产出 1 段 ──────────────────────────────
  const first = build('msg-mid', 'running');
  const p1 = addPara(first, '第一段：解析需求');
  document.body.appendChild(first.wrapper);

  const cleanups = [];
  mod1.apply({ effect: (fn) => { cleanups.push(fn()); } });

  const stamp1 = p1.getAttribute('data-dsh-think-time');
  assert.match(stamp1, /^\d{2}:\d{2}:\d{2}$/, 'first paragraph stamped while visible');

  await new Promise((r) => setTimeout(r, 60));

  // ── 切走：卸载插件并销毁子树（思考仍在后台继续）─────────────────
  for (const fn of cleanups) fn();
  document.body.removeChild(first.wrapper);

  // ── 切回：DOM 重建，且缺席期间累积了 3 段新内容 ────────────────
  let mod2 = null;
  globalThis.window.__ModuleLoader__ = {
    load(def) {
      mod2 = def.factory();
    }
  };
  await import('../lib/client.js?v=7b');

  const second = build('msg-mid', 'running');
  const r1 = addPara(second, '第一段：解析需求');
  const r2 = addPara(second, '第二段：设计存储结构');
  const r3 = addPara(second, '第三段：验证边界条件');
  const r4 = addPara(second, '第四段：收敛结论');
  document.body.appendChild(second.wrapper);

  const secondCleanups = [];
  mod2.apply({ effect: (fn) => { secondCleanups.push(fn()); } });
  assert.equal(r1.getAttribute('data-dsh-think-time'), stamp1, 'existing paragraph keeps its stamp');

  // 缺席期间补录的段落必须各不相同
  const backlog = [r2, r3, r4].map((p) => p.getAttribute('data-dsh-think-time'));
  for (const s of backlog) {
    assert.match(s, /^\d{2}:\d{2}:\d{2}$/, 'backlogged paragraph must be stamped');
  }
  assert.equal(
    new Set(backlog).size,
    backlog.length,
    'backlogged paragraphs must not share one identical timestamp, got: ' + backlog.join(', ')
  );

  // 并且按出现顺序单调递增
  const toSec = (s) => {
    const [h, m, sec] = s.split(':').map(Number);
    return h * 3600 + m * 60 + sec;
  };
  assert.ok(toSec(backlog[0]) >= toSec(stamp1), 'backlog must not precede the earlier paragraph');
  assert.ok(toSec(backlog[1]) > toSec(backlog[0]), 'second backlog paragraph must be later');
  assert.ok(toSec(backlog[2]) > toSec(backlog[1]), 'third backlog paragraph must be later');

  // 释放心跳与观察器，否则事件循环不会退出
  for (const fn of secondCleanups) fn();
});

test('8. Register exactly one client module id matching the bundle name', async () => {
  const src = await fs.promises.readFile(new URL('../lib/client.js', import.meta.url), 'utf8');

  // DSH 的启动冻结检查按脚本注册的 id 校验；多注册一个别名会被判定为
  // “不再注册原 id”，热重载被永久拒绝，页面一直跑旧脚本。
  const ids = [...src.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(
    ids,
    ['dsh-thinking-timestamp'],
    'client bundle must register exactly one id equal to the package/bundle name, got: ' + ids.join(', ')
  );
});
