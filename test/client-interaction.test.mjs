import assert from 'node:assert/strict';
import { test } from 'node:test';

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
  globalThis.window = {
    document,
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
