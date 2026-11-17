/**
 * `dsh-thinking-timestamp` - Client half
 * 纯前端交互插件：
 * 1. 独立于任何具体模型，当 DSH 前端输出思考内容（[data-variant="think"]）时自动触发；
 * 2. 严格按东八区（UTC+8）高精度物理时间计算并打印时间戳；
 * 3. 运行中提供秒级动态流逝心跳与呼吸状态视觉提示；
 * 4. 思考完成后完整保留思考时间戳与耗时，样式平滑切换为完成色；
 * 5. 采用 CSS 伪元素与属性标记注入段落时间戳，彻底避免干扰 React Virtual DOM；
 * 6. 全生命周期内存防泄漏：WeakSet 短路已完成节点、isConnected 实时剪枝 Detached DOM、心跳自停歇、0 内存残留。
 */

function createClientModule(require) {
    var module = { exports: {} };
    var exports = module.exports;

    // ── 东八区时间计算辅助函数 ──────────────────────────────────────────
    function pad2(n) {
      return (n < 10 ? '0' : '') + n;
    }

    function pad3(n) {
      return (n < 10 ? '00' : n < 100 ? '0' : '') + n;
    }

    function getEast8Time(date, withMs) {
      var d = date || new Date();
      // 基于 UTC 时间绝对偏移 8 小时计算东八区
      var east8Ms = d.getTime() + 8 * 3600 * 1000;
      var d8 = new Date(east8Ms);

      var h = pad2(d8.getUTCHours());
      var m = pad2(d8.getUTCMinutes());
      var s = pad2(d8.getUTCSeconds());

      if (withMs) {
        return h + ':' + m + ':' + s + '.' + pad3(d8.getUTCMilliseconds());
      }
      return h + ':' + m + ':' + s;
    }

    // ── 注入前端原生样式 ──────────────────────────────────────────────
    var STYLE_ID = 'dsh-thinking-timestamp-style';
    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return;
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = [
        '@keyframes dsh-think-pulse {',
        '  0%, 100% {',
        '    opacity: 0.9;',
        '    box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.35);',
        '  }',
        '  50% {',
        '    opacity: 1;',
        '    box-shadow: 0 0 0 4px rgba(6, 182, 212, 0);',
        '  }',
        '}',
        '/* 思考标题栏时间戳药丸 */',
        '.dsh-think-time-pill {',
        '  display: inline-flex;',
        '  align-items: center;',
        '  font-size: 11px;',
        '  font-weight: 500;',
        '  font-variant-numeric: tabular-nums;',
        '  padding: 1px 7px;',
        '  border-radius: 12px;',
        '  margin-left: 8px;',
        '  vertical-align: middle;',
        '  line-height: 16px;',
        '  white-space: nowrap;',
        '  user-select: none;',
        '  pointer-events: none; /* 防止遮挡折叠点击 */',
        '  flex-shrink: 0;',
        '  transition: background 0.25s ease, border-color 0.25s ease, color 0.25s ease, box-shadow 0.25s ease;',
        '}',
        '/* 思考中（运行态）：青色呼吸高亮 */',
        '.dsh-think-time-pill[data-state="running"] {',
        '  background: rgba(6, 182, 212, 0.12);',
        '  color: #06b6d4;',
        '  border: 1px solid rgba(6, 182, 212, 0.32);',
        '  animation: dsh-think-pulse 2s infinite ease-in-out;',
        '}',
        '/* 思考完成（完成态）：完整保留时间戳，平滑切换为完成绿 */',
        '.dsh-think-time-pill[data-state="done"] {',
        '  background: rgba(16, 185, 129, 0.10);',
        '  color: #10b981;',
        '  border: 1px solid rgba(16, 185, 129, 0.25);',
        '  animation: none;',
        '}',
        '/* 思考正文段落时间戳（通过 CSS 伪元素展示，完全避免改动 React 虚拟 DOM 子节点） */',
        '[data-variant="think"] [class*="thinkBody"] p[data-dsh-think-time]::before,',
        '[data-variant="think"] [class*="thinkBody"] li[data-dsh-think-time]::before {',
        '  content: attr(data-dsh-think-time);',
        '  display: inline-block;',
        '  font-size: 10px;',
        '  font-weight: 600;',
        '  font-variant-numeric: tabular-nums;',
        '  padding: 0 4px;',
        '  border-radius: 4px;',
        '  margin-right: 6px;',
        '  user-select: none;',
        '  vertical-align: baseline;',
        '  transition: color 0.25s ease, background 0.25s ease, border-color 0.25s ease;',
        '}',
        '/* 思考中（运行态）：段落时间戳呈青色 */',
        '[data-variant="think"][data-state="running"] [class*="thinkBody"] p[data-dsh-think-time]::before,',
        '[data-variant="think"][data-state="running"] [class*="thinkBody"] li[data-dsh-think-time]::before {',
        '  color: #06b6d4;',
        '  background: rgba(6, 182, 212, 0.10);',
        '  border: 1px solid rgba(6, 182, 212, 0.25);',
        '}',
        '/* 思考完成（完成态）：段落时间戳完整保留，只切换为稳重完成色 */',
        '[data-variant="think"]:not([data-state="running"]) [class*="thinkBody"] p[data-dsh-think-time]::before,',
        '[data-variant="think"]:not([data-state="running"]) [class*="thinkBody"] li[data-dsh-think-time]::before {',
        '  color: #10b981;',
        '  background: rgba(16, 185, 129, 0.08);',
        '  border: 1px solid rgba(16, 185, 129, 0.20);',
        '}',
        '/* 嵌套安全保护：列表内部段落不产生重复时间戳 */',
        '[data-variant="think"] [class*="thinkBody"] li[data-dsh-think-time] p::before,',
        '[data-variant="think"] [class*="thinkBody"] p[data-dsh-think-time] p::before {',
        '  display: none !important;',
        '}'
      ].join('\n');
      document.head.appendChild(style);
    }

    // ── 耗时提取与数值净化辅助函数 ────────────────────────────────────
    function sanitizeDuration(val) {
      if (!val) return '';
      var n = parseFloat(val);
      if (isNaN(n) || !isFinite(n) || n < 0) return '';
      return n.toFixed(1);
    }

    function extractDurationText(text) {
      if (!text || typeof text !== 'string') return '';
      // 1. 优先匹配自身药丸运行中的秒数，如 "(思考中 8s...)"
      var mRunning = text.match(/思考中\s*(\d+(?:\.\d+)?)\s*s/i);
      if (mRunning) return sanitizeDuration(mRunning[1]);
      // 2. 匹配已有耗时格式，如 "(耗时 8.2s)"
      var mDuration = text.match(/耗时\s*(\d+(?:\.\d+)?)\s*s/i);
      if (mDuration) return sanitizeDuration(mDuration[1]);
      // 3. 匹配原生组件中的思考用时，如 "8 秒"、"8.2s"、"8s"、"用时 8 秒"
      var mGeneric = text.match(/(?:用时|深度思考|thought for|took)?\s*(\d+(?:\.\d+)?)\s*(?:秒|s(?:econds?)?)(?!\w)/i);
      if (mGeneric) return sanitizeDuration(mGeneric[1]);
      return '';
    }

    // ── 持久化存储：以「消息节点标识」为键，跨 DOM 卸载/重挂载存活 ──────
    // 关键：React 在离开会话再返回时会销毁并重建整个 DOM 子树，
    // 以 DOM 元素为键的 WeakMap 会全部丢失，导致时间戳被重新打成「当前时间」。
    // 因此必须把时间戳记录在由稳定 flow key 索引的持久表里。
    var STORE_LS_KEY = 'dsh-think-ts:v1';
    var STORE_CAP = 800;
    var durableStore = null;
    var durableOrder = [];

    function loadDurableStore() {
      if (durableStore) return durableStore;
      durableStore = Object.create(null);
      try {
        var raw = window.localStorage.getItem(STORE_LS_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            durableStore = parsed.records || Object.create(null);
            durableOrder = Array.isArray(parsed.order) ? parsed.order.slice() : Object.keys(durableStore);
          }
        }
      } catch (e) {
        durableStore = Object.create(null);
        durableOrder = [];
      }
      return durableStore;
    }

    var saveScheduled = false;

    function flushDurableStore() {
      saveScheduled = false;
      try {
        // 超出容量时按写入顺序淘汰最旧记录，避免 localStorage 无限膨胀
        while (durableOrder.length > STORE_CAP) {
          var victim = durableOrder.shift();
          if (victim && durableStore[victim]) delete durableStore[victim];
        }
        window.localStorage.setItem(
          STORE_LS_KEY,
          JSON.stringify({ records: durableStore, order: durableOrder })
        );
      } catch (e) {
        /* 配额不足或隐私模式：静默降级为内存内存储 */
      }
    }

    /**
     * 同步落盘。用于「思考结算」这类必须立即持久化的关键节点：
     * 若延迟写入，用户结算后马上离开页面，记录就会丢失，
     * 再次进入时又被打上「当前时间」。
     */
    function flushDurableStoreNow() {
      flushDurableStore();
    }

    function saveDurableStore() {
      if (saveScheduled) return;
      saveScheduled = true;
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(flushDurableStore, { timeout: 800 });
      } else {
        setTimeout(flushDurableStore, 120);
      }
    }

    function storeGet(key) {
      if (!key) return null;
      return loadDurableStore()[key] || null;
    }

    function storePut(key, record) {
      if (!key || !record) return;
      var db = loadDurableStore();
      var isNew = !db[key];
      db[key] = record;
      if (isNew) durableOrder.push(key);
      saveDurableStore();
    }

    /**
     * 解析思考节点的稳定身份键。
     * 优先使用 DSH 原生为每条消息流分配的 data-chat-node-key / data-chat-flow-key，
     * 它由会话事件键派生，在同一会话重新挂载后保持一致。
     */
    /**
     * 解析思考节点的稳定身份键。
     * 优先使用 DSH 原生为每条消息流分配的 data-chat-flow-key（最精确，分组回答
     * 时带 groupPart），其次 data-chat-node-key / data-chat-anchor-key。
     * 这些 key 由会话事件键派生，在同一会话重新挂载后保持一致。
     */
    var prefixCache = new WeakMap();

    function resolveKeyPrefix(thinkEl) {
      var cached = prefixCache.get(thinkEl);
      if (cached !== undefined) return cached;

      var cur = thinkEl;
      var depth = 0;
      var prefix = null;
      while (cur && depth < 12) {
        if (cur.getAttribute) {
          var flowKey = cur.getAttribute('data-chat-flow-key');
          if (flowKey) { prefix = 'f:' + flowKey; break; }
          var nodeKey = cur.getAttribute('data-chat-node-key');
          if (nodeKey) { prefix = 'k:' + nodeKey; break; }
          var anchorKey = cur.getAttribute('data-chat-anchor-key');
          if (anchorKey) { prefix = 'a:' + anchorKey; break; }
        }
        cur = cur.parentNode;
        depth++;
      }
      prefixCache.set(thinkEl, prefix);
      return prefix;
    }

    function resolveStableKey(thinkEl) {
      var prefix = resolveKeyPrefix(thinkEl);

      if (!prefix) {
        // 兜底：使用本轮 turn 编号 + 该 turn 内的出现次序
        var turnHost = thinkEl.closest ? thinkEl.closest('[data-chat-turn]') : null;
        if (turnHost) {
          var turn = turnHost.getAttribute('data-chat-turn');
          var siblings = turnHost.querySelectorAll('[data-variant="think"]');
          var idx = Array.prototype.indexOf.call(siblings, thinkEl);
          if (idx >= 0) return 't:' + turn + ':' + idx;
        }
        return null;
      }

      // 【消歧关键】同一条消息里可能存在多个思考块（多段推理、工具调用之间各一段）。
      // 若原生 flow key 已能区分则不会走到这里；一旦共享同一前缀，必须追加
      // 文档序上的出现位置，否则这些块会互相覆盖持久记录，时间戳串台。
      var ordinal = 0;
      if (typeof document !== 'undefined' && document.querySelectorAll) {
        var all = document.querySelectorAll('[data-variant="think"]');
        for (var i = 0; i < all.length; i++) {
          if (all[i] === thinkEl) break;
          if (resolveKeyPrefix(all[i]) === prefix) ordinal++;
        }
      }
      return prefix + '#' + ordinal;
    }

    /**
     * 从原生时间元素读取真实消息时间（DSH 在 turn 头部渲染 <time datetime="...">）。
     * 用于历史会话首次载入时还原真实时间，而不是打上「当前时间」。
     */
    function readNativeTimeStamp(thinkEl) {
      var cur = thinkEl;
      var depth = 0;
      while (cur && depth < 14) {
        if (cur.querySelector) {
          var timeEl = cur.querySelector('time[datetime]');
          if (timeEl) {
            var iso = timeEl.getAttribute('datetime');
            if (iso) {
              var parsed = new Date(iso);
              if (!isNaN(parsed.getTime())) {
                return { stamp: getEast8Time(parsed, false), ms: parsed.getTime() };
              }
            }
          }
        }
        cur = cur.parentNode;
        depth++;
      }
      return null;
    }

    // ── 段落时间戳持久化 ────────────────────────────────────────────────
    /**
     * 段落正文指纹：去掉首尾空白与重复空白后取哈希。
     * 同一段思考文字在 DOM 重建前后内容不变，因此指纹稳定，
     * 可在不依赖任何 DOM 引用的前提下把时间戳映射回原段落。
     */
    function fingerprint(text) {
      var normalized = text.replace(/\s+/g, ' ').trim();
      var hash = 0x811c9dc5;
      for (var i = 0; i < normalized.length; i++) {
        hash ^= normalized.charCodeAt(i);
        hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
      }
      return (hash >>> 0).toString(36) + ':' + normalized.length.toString(36);
    }

    function lookupParagraphStamp(stableKey, paraKey) {
      if (!stableKey || !paraKey) return '';
      var record = storeGet(stableKey);
      if (!record || !record.paras) return '';
      for (var i = 0; i < record.paras.length; i++) {
        var entry = record.paras[i];
        if (entry && entry[0] === paraKey) return entry[1] || '';
      }
      return '';
    }

    function rememberParagraphStamp(stableKey, paraKey, stamp) {
      if (!stableKey || !paraKey || !stamp) return;
      var record = storeGet(stableKey) || { start: '', startMs: 0, duration: '', paras: [] };
      if (!Array.isArray(record.paras)) record.paras = [];
      for (var i = 0; i < record.paras.length; i++) {
        if (record.paras[i] && record.paras[i][0] === paraKey) {
          return; // 已记录，保持首次时间不变
        }
      }
      record.paras.push([paraKey, stamp]);
      storePut(stableKey, record);
      // 段落时间戳同样立即落盘：DOM 重建后只能靠它还原
      flushDurableStoreNow();
    }

    // ── 节点追踪与缓存设计（弱引用保证 GC 零驻留）───────────────────────
    var trackedThinkNodes = new WeakMap();
    var settledNodes = new WeakSet();

    function hasOwnTimestampClass(el) {
      if (!el || el.nodeType !== 1 || typeof el.className !== 'string') return false;
      return (
        el.className.indexOf('dsh-think-time-pill') !== -1 ||
        el.className.indexOf('dsh-think-step-chip') !== -1
      );
    }

    function isOwnTimestampTarget(node) {
      var cur = node;
      while (cur) {
        if (hasOwnTimestampClass(cur)) return true;
        cur = cur.parentNode || null;
      }
      return false;
    }

    function isOwnMutationRecord(m) {
      if (!m) return true;
      if (isOwnTimestampTarget(m.target)) return true;
      if (m.type === 'attributes') {
        if (
          m.attributeName === 'data-dsh-think-time' ||
          m.attributeName === 'data-think-start' ||
          m.attributeName === 'data-think-duration'
        ) {
          return true;
        }
      }
      if (m.type === 'childList') {
        var added = m.addedNodes;
        var removed = m.removedNodes;
        var hasExternal = false;
        if (added) {
          for (var i = 0; i < added.length; i++) {
            if (!hasOwnTimestampClass(added[i])) {
              hasExternal = true;
              break;
            }
          }
        }
        if (!hasExternal && removed) {
          for (var j = 0; j < removed.length; j++) {
            if (!hasOwnTimestampClass(removed[j])) {
              hasExternal = true;
              break;
            }
          }
        }
        if (!hasExternal && ((added && added.length > 0) || (removed && removed.length > 0))) {
          return true;
        }
      }
      return false;
    }

    function ensurePillElement(titleRow) {
      var pill = titleRow.querySelector('.dsh-think-time-pill');
      if (pill) return pill;

      pill = document.createElement('span');
      pill.className = 'dsh-think-time-pill';

      // 优化插入位置：优先放置于标题文字元素后方（Chevron 展开箭头之前）
      var titleEl = titleRow.querySelector('[class*="title"]') || titleRow.firstElementChild;
      if (titleEl && titleEl.parentNode === titleRow) {
        if (titleEl.nextSibling) {
          titleRow.insertBefore(pill, titleEl.nextSibling);
        } else {
          titleRow.appendChild(pill);
        }
      } else {
        titleRow.appendChild(pill);
      }
      return pill;
    }

    function updatePillText(pill, state, text) {
      if (!pill) return;
      if (pill.getAttribute('data-state') !== state) {
        pill.setAttribute('data-state', state);
      }
      if (pill.textContent !== text) {
        pill.textContent = text;
      }
    }

    // ── 插件入口 apply ────────────────────────────────────────────────
    function apply(ctx) {
      ensureStyle();

      var disposed = false;
      var isUpdating = false;
      var rafId = null;
      var timerId = null;
      var liveTickerId = null;
      var observer = null;
      var runningNodes = new Set(); // 局限于当前激活生命周期中

      function isNodeConnected(node) {
        if (!node) return false;
        if (typeof node.isConnected === 'boolean') {
          return node.isConnected;
        }
        // 兜底 DOM 检查
        var cur = node;
        while (cur) {
          if (cur === document.body || cur === document.documentElement) return true;
          cur = cur.parentNode;
        }
        return false;
      }

      function pruneRunningNodes() {
        if (runningNodes.size === 0) return;
        runningNodes.forEach(function (el) {
          if (!isNodeConnected(el) || el.getAttribute('data-state') !== 'running') {
            runningNodes.delete(el);
          }
        });
        if (runningNodes.size === 0 && liveTickerId !== null) {
          clearInterval(liveTickerId);
          liveTickerId = null;
        }
      }

      function processThinkNode(thinkEl) {
        if (!thinkEl || typeof thinkEl.querySelector !== 'function') return;

        // 若节点已脱离主文档，直接忽略
        if (!isNodeConnected(thinkEl)) {
          runningNodes.delete(thinkEl);
          return;
        }

        var state = thinkEl.getAttribute('data-state'); // "running" | "ok" | null

        // 快速路径：已结算且无状态变动的旧节点跳过深入遍历
        if (settledNodes.has(thinkEl) && state !== 'running') {
          return;
        }

        var meta = trackedThinkNodes.get(thinkEl);
        if (!meta) {
          var stableKey = resolveStableKey(thinkEl);
          var record = storeGet(stableKey);
          var startTime = new Date();
          var startStamp;
          var startMs;
          var elapsedSec = '';
          var isLiveTracked = false;
          var settled = false;

          if (record) {
            // 【关键修复】命中持久记录：无论 DOM 被销毁重建多少次，
            // 一律沿用最初记录的时间与耗时，绝不重新打「当前时间」。
            startStamp = record.start;
            startMs = typeof record.startMs === 'number' ? record.startMs : startTime.getTime();
            elapsedSec = sanitizeDuration(record.duration);
            settled = Boolean(elapsedSec);
            isLiveTracked = false;
          } else if (state === 'running') {
            // 全新会话且正在思考：以此刻为起点
            startStamp = getEast8Time(startTime, false);
            startMs = startTime.getTime();
            isLiveTracked = true;
          } else {
            // 历史节点首次载入：优先读取 DSH 原生 <time datetime> 的真实消息时间
            var native = readNativeTimeStamp(thinkEl);
            if (native) {
              startStamp = native.stamp;
              startMs = native.ms;
            } else {
              startStamp = getEast8Time(startTime, false);
              startMs = startTime.getTime();
            }
            settled = false; // 交由下方结算逻辑补全耗时
          }

          // 【第三来源】节点自带的既有属性（插件重载后同一次渲染内的残留标记）。
          // 它优先于「当前时间」，避免在没有持久记录时把旧时间戳抹成现在。
          var attrStart = thinkEl.getAttribute('data-think-start');
          var attrDuration = sanitizeDuration(thinkEl.getAttribute('data-think-duration'));
          if (!record && attrStart) {
            startStamp = attrStart;
            if (attrDuration) {
              elapsedSec = attrDuration;
              settled = true;
            }
          }

          meta = {
            stableKey: stableKey,
            startTime: startTime,
            startStamp: startStamp,
            startMs: startMs,
            hasLoggedStart: false,
            isLiveTracked: isLiveTracked,
            settled: settled,
            elapsedSec: elapsedSec,
            processedParagraphs: new WeakSet()
          };
          trackedThinkNodes.set(thinkEl, meta);

          // 立刻落盘起点，保证中途离开也能恢复
          storePut(stableKey, {
            start: startStamp,
            startMs: startMs,
            duration: elapsedSec,
            paras: record && Array.isArray(record.paras) ? record.paras : []
          });
        }

        // 1. 查找思考栏标题区域（DisclosureRow）
        var titleRow = thinkEl.querySelector('[class*="row"]') || thinkEl.firstElementChild;
        if (titleRow) {
          // 【顺序关键】必须在注入药丸之前抓取标题原文快照。
          // 一旦 pill 被 append 进 titleRow，titleRow.textContent 就会混入
          // 我们自己写的时间戳文本，导致后续耗时嗅探读到自己而不是原生信息。
          var titleRowRawText = titleRow.textContent || '';
          var pill = ensurePillElement(titleRow);

          if (state === 'running') {
            meta.settled = false;
            meta.isLiveTracked = true;
            runningNodes.add(thinkEl);

            var liveSec = Math.max(0, Math.floor((Date.now() - meta.startMs) / 1000));
            var runningText = liveSec > 0
              ? '⏱️ ' + meta.startStamp + ' (思考中 ' + liveSec + 's...)'
              : '⏱️ ' + meta.startStamp + ' (思考中...)';
            updatePillText(pill, 'running', runningText);
            // 持久化起始时间戳到 DOM
            thinkEl.setAttribute('data-think-start', meta.startStamp);
          } else {
            // 思考完成：必须完整保留时间戳与思考耗时，样式切换为 done
            runningNodes.delete(thinkEl);

            if (!meta.settled || !meta.elapsedSec) {
              meta.settled = true;

              if (!meta.elapsedSec) {
                // 1. 若为实时捕获的会话，严格优先以本地高精度物理时钟毫秒实测（杜绝整秒四舍五入偏差）
                if (meta.startMs && meta.isLiveTracked) {
                  var diffSec = Math.max(0.1, (Date.now() - meta.startMs) / 1000);
                  meta.elapsedSec = diffSec.toFixed(1);
                } else {
                  // 2. 历史节点：优先嗅探原生标题行或已有药丸文本，绝不凭空计时
                  var probed = extractDurationText(titleRowRawText) ||
                               extractDurationText(pill.textContent);
                  if (probed) {
                    meta.elapsedSec = probed;
                  } else {
                    // 既无记录也无原生耗时：说明这是插件安装前的旧消息。
                    // 此时绝不能用「消息时间 → 现在」当耗时（会得出数小时甚至数天），
                    // 统一留空，药丸只显示起始时间戳。
                    meta.elapsedSec = '';
                  }
                }
              }

              thinkEl.setAttribute('data-think-start', meta.startStamp);
              thinkEl.setAttribute('data-think-duration', meta.elapsedSec);

              // 【关键修复】结算结果写入持久表，跨会话往返永久保持。
              // 这里必须同步落盘：用户结算后立刻离开页面，延迟写入会丢记录。
              var prev = storeGet(meta.stableKey);
              storePut(meta.stableKey, {
                start: meta.startStamp,
                startMs: meta.startMs,
                duration: meta.elapsedSec,
                paras: prev && Array.isArray(prev.paras) ? prev.paras : []
              });
              flushDurableStoreNow();
            }

            // 【关键修复】无论走哪条分支，都必须把时间戳回填到当前 DOM 元素。
            // 之前这两行写在结算块内部，导致命中持久记录时新元素拿不到属性，
            // 任何后续读取都只能退回「当前时间」。
            thinkEl.setAttribute('data-think-start', meta.startStamp);
            thinkEl.setAttribute('data-think-duration', meta.elapsedSec || '');

            // 无论任何情况，思考完成后均保留时间戳；有耗时则一并显示
            var doneText = meta.elapsedSec
              ? '⏱️ ' + meta.startStamp + ' (耗时 ' + meta.elapsedSec + 's)'
              : '⏱️ ' + meta.startStamp;
            updatePillText(pill, 'done', doneText);
            settledNodes.add(thinkEl);
          }
        }

        // 2. 检查展开的思考正文（thinkBody）
        var thinkBody = thinkEl.querySelector('[class*="thinkBody"]');
        if (thinkBody) {
          var paragraphs = thinkBody.querySelectorAll('p, li');
          for (var i = 0; i < paragraphs.length; i++) {
            var p = paragraphs[i];
            if (meta.processedParagraphs.has(p)) continue;

            // 列表嵌套防御：若 p 位于 li 内部，跳过该 p，由外层 li 统一持有时间戳标签，杜绝双重时间戳
            if (p.nodeName === 'P' || p.tagName === 'P') {
              var parent = p.parentNode;
              var isNestedInLi = false;
              while (parent && parent !== thinkBody) {
                if (parent.nodeName === 'LI' || parent.tagName === 'LI') {
                  isNestedInLi = true;
                  break;
                }
                parent = parent.parentNode;
              }
              if (isNestedInLi) {
                meta.processedParagraphs.add(p);
                continue;
              }
            }

            // 若已通过属性标记过，跳过
            if (p.getAttribute('data-dsh-think-time')) {
              meta.processedParagraphs.add(p);
              continue;
            }

            var rawText = (p.textContent || '').trim();
            if (!rawText) continue;

            meta.processedParagraphs.add(p);

            // 【关键修复】段落时间戳按「段落正文指纹」持久化。
            // DOM 重建后段落是全新元素，若直接打当前时间就会全部变成同一时刻；
            // 因此以正文内容的稳定指纹为键，命中则复用最初记录的时间。
            var paraKey = fingerprint(rawText);
            var paraStamp = lookupParagraphStamp(meta.stableKey, paraKey);

            if (!paraStamp) {
              // 仅当该段落确实尚未记录时才取当前时间
              paraStamp = getEast8Time(new Date(), false);
              rememberParagraphStamp(meta.stableKey, paraKey, paraStamp);
            }

            // 安全注入：设置 CSS 属性标记，由 ::before 伪元素渲染，不破坏 React DOM 节点
            // 思考完成后伪元素时间戳持续保留，仅在 CSS 中响应状态颜色转换
            p.setAttribute('data-dsh-think-time', paraStamp);

            // 控制台输出
            var logSnippet = rawText.length > 80 ? rawText.slice(0, 80) + '...' : rawText;
            console.log(
              '%c[' + getEast8Time(new Date(), true) + ']%c [DSH 思考输出] %s',
              'color: #06b6d4; font-weight: bold;',
              'color: #888;',
              logSnippet
            );
          }
        }

        // 3. 初始思考触发时，在控制台打印启动日志
        if (state === 'running' && !meta.hasLoggedStart) {
          meta.hasLoggedStart = true;
          console.log(
            '%c[' + getEast8Time(meta.startTime, true) + ']%c [DSH 思考输出:开始] 捕获到前端思考流触发',
            'color: #10b981; font-weight: bold;',
            'color: #888;'
          );
        }
      }

      function scanAllThinkNodes() {
        pruneRunningNodes();
        var thinkNodes = document.querySelectorAll('[data-variant="think"]');
        for (var i = 0; i < thinkNodes.length; i++) {
          processThinkNode(thinkNodes[i]);
        }
      }

      function checkLiveTicker() {
        if (runningNodes.size > 0) {
          if (!liveTickerId) {
            liveTickerId = setInterval(function () {
              if (disposed) return;
              if (runningNodes.size === 0) {
                clearInterval(liveTickerId);
                liveTickerId = null;
                return;
              }
              runningNodes.forEach(function (thinkEl) {
                if (!isNodeConnected(thinkEl) || thinkEl.getAttribute('data-state') !== 'running') {
                  runningNodes.delete(thinkEl);
                  return;
                }
                var meta = trackedThinkNodes.get(thinkEl);
                if (!meta) {
                  runningNodes.delete(thinkEl);
                  return;
                }
                var titleRow = thinkEl.querySelector('[class*="row"]') || thinkEl.firstElementChild;
                if (!titleRow) return;
                var pill = titleRow.querySelector('.dsh-think-time-pill');
                if (!pill) return;
                var liveSec = Math.max(0, Math.floor((Date.now() - meta.startMs) / 1000));
                var liveText = liveSec > 0
                  ? '⏱️ ' + meta.startStamp + ' (思考中 ' + liveSec + 's...)'
                  : '⏱️ ' + meta.startStamp + ' (思考中...)';
                updatePillText(pill, 'running', liveText);
              });
              if (runningNodes.size === 0 && liveTickerId !== null) {
                clearInterval(liveTickerId);
                liveTickerId = null;
              }
            }, 1000);
          }
        } else if (liveTickerId !== null) {
          clearInterval(liveTickerId);
          liveTickerId = null;
        }
      }

      function runScan() {
        rafId = null;
        timerId = null;
        if (disposed || isUpdating) return;
        isUpdating = true;
        try {
          scanAllThinkNodes();
          checkLiveTicker();
        } finally {
          isUpdating = false;
          if (observer && typeof observer.takeRecords === 'function') {
            observer.takeRecords();
          }
        }
      }

      function scheduleScan() {
        if (disposed || rafId !== null || timerId !== null) return;
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          rafId = window.requestAnimationFrame(runScan);
        } else {
          timerId = setTimeout(runScan, 32);
        }
      }

      runScan();

      // 使用 MutationObserver 监听外部前端界面变化，精准排查过滤
      observer = new MutationObserver(function (mutations) {
        if (disposed || isUpdating) return;
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.type !== 'childList' && m.type !== 'characterData' && m.type !== 'attributes') continue;
          if (!isOwnMutationRecord(m)) {
            scheduleScan();
            return;
          }
        }
      });

      var observeTarget = document.body || document.documentElement;
      if (observeTarget) {
        observer.observe(observeTarget, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['data-state', 'data-expanded', 'data-variant']
        });
      }

      // 注册卸载销毁器
      if (ctx && typeof ctx.effect === 'function') {
        ctx.effect(function () {
          return function () {
            disposed = true;
            if (rafId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
              window.cancelAnimationFrame(rafId);
              rafId = null;
            }
            if (timerId !== null) {
              clearTimeout(timerId);
              timerId = null;
            }
            if (liveTickerId !== null) {
              clearInterval(liveTickerId);
              liveTickerId = null;
            }
            if (observer) observer.disconnect();
            runningNodes.clear();
            var el = document.getElementById(STYLE_ID);
            if (el && el.parentNode) el.parentNode.removeChild(el);
          };
        }, 'dsh-thinking-timestamp: frontend reasoning dom observer');
      }
    }

    exports.name = 'dsh-thinking-timestamp';
    exports.apply = apply;
    return module.exports;
}

if (typeof window !== 'undefined' && window.__ModuleLoader__ && typeof window.__ModuleLoader__.load === 'function') {
  window.__ModuleLoader__.load({
    id: 'dsh-think-timestamp',
    factory: createClientModule
  });
  window.__ModuleLoader__.load({
    id: 'dsh-thinking-timestamp',
    factory: createClientModule
  });
}
