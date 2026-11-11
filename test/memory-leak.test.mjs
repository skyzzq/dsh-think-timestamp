import assert from 'node:assert/strict';
import { test } from 'node:test';

class LeakTestNode {
  constructor(nodeType, nodeName) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.className = '';
    this.textContent = '';
    this._isConnected = false;
  }

  get isConnected() {
    if (!this.parentNode) return this._isConnected;
    return this.parentNode.isConnected;
  }

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
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
    return newChild;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
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

function setupEnvironment() {
  const root = new LeakTestNode(1, 'HTML');
  root._isConnected = true;
  const body = new LeakTestNode(1, 'BODY');
  root.appendChild(body);
  const head = new LeakTestNode(1, 'HEAD');
  root.appendChild(head);

  const document = {
    head,
    body,
    getElementById(id) {
      if (head.id === id) return head;
      return null;
    },
    createElement(tag) {
      return new LeakTestNode(1, tag.toUpperCase());
    },
    querySelectorAll(selector) {
      return body.querySelectorAll(selector);
    }
  };

  class MockMutationObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    takeRecords() { return []; }
    disconnect() {}
  }

  globalThis.document = document;
  globalThis.MutationObserver = MockMutationObserver;
  globalThis.window = {
    document,
    requestAnimationFrame(fn) { return setTimeout(fn, 0); },
    cancelAnimationFrame(id) { clearTimeout(id); }
  };
}

test('Memory Leak Test: 2,000 cycles with abnormal interrupts & GC validation', async () => {
  setupEnvironment();

  let registeredModule = null;
  globalThis.window.__ModuleLoader__ = {
    load(def) {
      registeredModule = def.factory();
    }
  };

  await import('../lib/client.js?leak_test=' + Date.now());

  let cleanup = null;
  registeredModule.apply({
    effect(fn) {
      cleanup = fn();
    }
  });

  if (globalThis.gc) {
    globalThis.gc();
  }
  const initialMem = process.memoryUsage().heapUsed;

  // 使用 WeakRef 追踪被销毁节点的回收情况
  const weakRefs = [];

  for (let i = 0; i < 2000; i++) {
    const thinkEl = document.createElement('div');
    thinkEl.setAttribute('data-variant', 'think');
    thinkEl.setAttribute('data-state', 'running');

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
    p.textContent = '思考步骤分析中 #' + i;
    body.appendChild(p);
    thinkEl.appendChild(body);

    document.body.appendChild(thinkEl);

    // 触发单次扫描
    globalThis.window.requestAnimationFrame = (fn) => fn();

    // 追踪前 100 个节点
    if (i < 100) {
      weakRefs.push(new WeakRef(thinkEl));
    }

    if (i % 2 === 0) {
      // 正常完成并移除
      thinkEl.setAttribute('data-state', 'ok');
      document.body.removeChild(thinkEl);
    } else {
      // 异常中断：在 running 状态直接被移除（变为 detached DOM）
      document.body.removeChild(thinkEl);
    }
  }

  // 触发全局扫描与运行节点修剪
  await new Promise(r => setTimeout(r, 50));

  if (globalThis.gc) {
    globalThis.gc();
  }

  const finalMem = process.memoryUsage().heapUsed;
  const growthKB = (finalMem - initialMem) / 1024;

  console.log(`Initial Heap: ${(initialMem / 1024 / 1024).toFixed(3)} MB`);
  console.log(`Final Heap:   ${(finalMem / 1024 / 1024).toFixed(3)} MB`);
  console.log(`Heap Growth:  ${growthKB.toFixed(2)} KB`);

  // 检查 WeakRefs，绝大多数 detached 节点应该被成功垃圾回收
  let activeCount = 0;
  for (const ref of weakRefs) {
    if (ref.deref() !== undefined) {
      activeCount++;
    }
  }
  console.log(`Active retained nodes from sample of ${weakRefs.length}: ${activeCount}`);

  // 验证无不可控内存增长（2000 次操作堆增长应小于 2MB）
  assert.ok(growthKB < 2048, `Heap growth too high: ${growthKB} KB`);
  // 采样节点不应被强引用阻碍回收（全部或绝大部分应为 undefined）
  assert.equal(activeCount, 0, 'Detached nodes must be collected by GC!');

  if (cleanup) cleanup();
});
