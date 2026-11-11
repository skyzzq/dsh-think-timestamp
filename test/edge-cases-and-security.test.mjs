import assert from 'node:assert/strict';
import { test } from 'node:test';

class MockSecurityNode {
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

  get textContent() {
    if (this.childNodes.length === 0) return this._textContent;
    return this.childNodes.map(c => c.textContent).join('');
  }

  set textContent(v) {
    this._textContent = String(v);
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

function setupMockEnvironment() {
  const root = new MockSecurityNode(1, 'HTML');
  root._isConnected = true;
  const body = new MockSecurityNode(1, 'BODY');
  root.appendChild(body);
  const head = new MockSecurityNode(1, 'HEAD');
  root.appendChild(head);

  const document = {
    head,
    body,
    getElementById(id) {
      if (head.id === id) return head;
      return null;
    },
    createElement(tag) {
      return new MockSecurityNode(1, tag.toUpperCase());
    },
    querySelectorAll(selector) {
      return body.querySelectorAll(selector);
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
  globalThis.window = {
    document,
    requestAnimationFrame(fn) { return setTimeout(fn, 16); },
    cancelAnimationFrame(id) { clearTimeout(id); }
  };
}

async function loadClient() {
  setupMockEnvironment();
  let registeredModule = null;
  globalThis.window.__ModuleLoader__ = {
    load(def) { registeredModule = def.factory(); }
  };
  await import('../lib/client.js?sec_test=' + Math.random());
  return registeredModule;
}

test('Security 1: XSS & HTML Entity Injection Resilience', async () => {
  const mod = await loadClient();
  const thinkEl = document.createElement('div');
  thinkEl.setAttribute('data-variant', 'think');
  thinkEl.setAttribute('data-state', 'running');

  const titleRow = document.createElement('div');
  titleRow.className = 'VJlF5q_row';
  thinkEl.appendChild(titleRow);

  const thinkBody = document.createElement('div');
  thinkBody.className = 'VJlF5q_thinkBody';

  // 构造恶意攻击输入
  const maliciousParagraph = document.createElement('p');
  maliciousParagraph.textContent = '<script>alert("XSS")</script><img src=x onerror=alert(1)>"\'&';
  thinkBody.appendChild(maliciousParagraph);
  thinkEl.appendChild(thinkBody);
  document.body.appendChild(thinkEl);

  let cleanup = null;
  mod.apply({ effect: fn => { cleanup = fn(); } });

  // 验证时间戳注入后，未产生任何不可信的 childNodes
  assert.equal(maliciousParagraph.childNodes.length, 0, 'No DOM elements should be injected into paragraph');
  // 验证属性包含合法时间戳
  assert.match(maliciousParagraph.getAttribute('data-dsh-think-time'), /^\d{2}:\d{2}:\d{2}$/);

  if (cleanup) cleanup();
});

test('Boundary 2: Nested List & Markdown Anti-Duplication (<li><p>...</p></li>)', async () => {
  const mod = await loadClient();
  const thinkEl = document.createElement('div');
  thinkEl.setAttribute('data-variant', 'think');
  thinkEl.setAttribute('data-state', 'running');

  const titleRow = document.createElement('div');
  titleRow.className = 'VJlF5q_row';
  thinkEl.appendChild(titleRow);

  const thinkBody = document.createElement('div');
  thinkBody.className = 'VJlF5q_thinkBody';

  // 模拟 Markdown 列表嵌套段落
  const li = document.createElement('li');
  const innerP = document.createElement('p');
  innerP.textContent = 'Nested list thought point';
  li.appendChild(innerP);
  thinkBody.appendChild(li);
  thinkEl.appendChild(thinkBody);
  document.body.appendChild(thinkEl);

  let cleanup = null;
  mod.apply({ effect: fn => { cleanup = fn(); } });

  // 验证：外层 li 拥有时间戳，内层 p 被防护逻辑跳过，避免双重时间戳！
  assert.ok(li.getAttribute('data-dsh-think-time'), 'Outer li must hold timestamp');
  assert.equal(innerP.getAttribute('data-dsh-think-time'), null, 'Inner p inside li must NOT duplicate timestamp');

  if (cleanup) cleanup();
});

test('Security 3: ReDoS Protection with 100,000-char Adversarial Input', async () => {
  const mod = await loadClient();
  const thinkEl = document.createElement('div');
  thinkEl.setAttribute('data-variant', 'think');
  thinkEl.setAttribute('data-state', 'ok');

  const titleRow = document.createElement('div');
  titleRow.className = 'VJlF5q_row';

  // 构造 100,000 字符的对抗性字符串
  const evilPadding = '思考中 '.repeat(20000) + '用时 999999999 秒';
  titleRow.textContent = evilPadding;
  thinkEl.appendChild(titleRow);
  document.body.appendChild(thinkEl);

  const t0 = performance.now();
  let cleanup = null;
  mod.apply({ effect: fn => { cleanup = fn(); } });
  const t1 = performance.now();

  const elapsedMs = t1 - t0;
  console.log(`ReDoS 100k-char test elapsed: ${elapsedMs.toFixed(2)} ms`);
  // 必须在 50ms 内完成匹配，杜绝灾难性回溯
  assert.ok(elapsedMs < 50, `Regex took too long: ${elapsedMs} ms`);

  const pill = titleRow.querySelector('.dsh-think-time-pill');
  assert.ok(pill);
  assert.match(pill.textContent, /\(耗时 \d+\.\d+s\)/);

  if (cleanup) cleanup();
});

test('Boundary 4: Clock Skew / Negative Time / Near-Zero Milliseconds Protection', async () => {
  const mod = await loadClient();
  const thinkEl = document.createElement('div');
  thinkEl.setAttribute('data-variant', 'think');
  thinkEl.setAttribute('data-state', 'running');

  const titleRow = document.createElement('div');
  titleRow.className = 'VJlF5q_row';
  thinkEl.appendChild(titleRow);
  document.body.appendChild(thinkEl);

  let cleanup = null;
  mod.apply({ effect: fn => { cleanup = fn(); } });

  // 模拟极短思考（例如 0ms 或时钟略微回拨）
  thinkEl.setAttribute('data-state', 'ok');
  await new Promise(r => setTimeout(r, 40));

  const pill = titleRow.querySelector('.dsh-think-time-pill');
  assert.ok(pill);
  // 耗时应为合法正数且 >= 0.1s，绝不输出负数或 NaN
  const match = pill.textContent.match(/\(耗时 (\d+\.\d+)s\)/);
  assert.ok(match, 'Must have valid duration');
  const duration = parseFloat(match[1]);
  assert.ok(duration >= 0.1, `Duration should be >= 0.1s, got ${duration}`);
  assert.ok(!isNaN(duration));

  if (cleanup) cleanup();
});

test('Security 5: External Malicious Attribute Tampering Resilience', async () => {
  const mod = await loadClient();
  const thinkEl = document.createElement('div');
  thinkEl.setAttribute('data-variant', 'think');
  thinkEl.setAttribute('data-state', 'ok');
  // 注入被篡改的恶意属性
  thinkEl.setAttribute('data-think-duration', 'NaN-injection-attack');
  thinkEl.setAttribute('data-think-start', '12:00:00');

  const titleRow = document.createElement('div');
  titleRow.className = 'VJlF5q_row';
  thinkEl.appendChild(titleRow);
  document.body.appendChild(thinkEl);

  let cleanup = null;
  mod.apply({ effect: fn => { cleanup = fn(); } });

  const pill = titleRow.querySelector('.dsh-think-time-pill');
  assert.ok(pill);
  // 验证非法耗时被过滤净化，绝不呈现 "NaNs"
  assert.ok(!pill.textContent.includes('NaN'));
  assert.match(pill.textContent, /⏱️ 12:00:00 \(耗时 \d+\.\d+s\)/);

  if (cleanup) cleanup();
});

test('Boundary 6: Severely Malformed DOM Tolerance (Missing Row, Body, etc.)', async () => {
  const mod = await loadClient();
  // 创建只有根标签的空节点，无任何子元素
  const malformedThink = document.createElement('div');
  malformedThink.setAttribute('data-variant', 'think');
  malformedThink.setAttribute('data-state', 'running');
  document.body.appendChild(malformedThink);

  let cleanup = null;
  // 验证不抛出任何 TypeError 或异常白屏
  assert.doesNotThrow(() => {
    mod.apply({ effect: fn => { cleanup = fn(); } });
  });

  if (cleanup) cleanup();
});

test('Performance 7: High-Frequency Mutation Flood (1,000 events)', async () => {
  const mod = await loadClient();
  const thinkEl = document.createElement('div');
  thinkEl.setAttribute('data-variant', 'think');
  thinkEl.setAttribute('data-state', 'running');

  const titleRow = document.createElement('div');
  titleRow.className = 'VJlF5q_row';
  thinkEl.appendChild(titleRow);
  document.body.appendChild(thinkEl);

  let cleanup = null;
  mod.apply({ effect: fn => { cleanup = fn(); } });

  const t0 = performance.now();
  // 瞬间触发 1,000 次 DOM 变动通知
  for (let i = 0; i < 1000; i++) {
    const dummy = document.createElement('div');
    document.body.appendChild(dummy);
    document.body.removeChild(dummy);
  }
  const t1 = performance.now();

  console.log(`Mutation Flood 1,000 events dispatched in ${(t1 - t0).toFixed(2)} ms`);
  // 给予 rAF 调度机会
  await new Promise(r => setTimeout(r, 50));

  const pill = titleRow.querySelector('.dsh-think-time-pill');
  assert.ok(pill);
  assert.equal(pill.getAttribute('data-state'), 'running');

  if (cleanup) cleanup();
});
