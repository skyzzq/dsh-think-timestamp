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
        '  /* 折叠态标题行 overflow:hidden 且被 summary 占满，药丸必须自身不溢出 */',
        '  max-width: 42vw;',
        '  overflow: hidden;',
        '  text-overflow: ellipsis;',
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

    /**
     * 同一批补录段落的递增步长（毫秒）。
     * 切换会话再回来时，缺席期间的多段思考会在一次扫描里补齐，
     * 用固定步长把它们错开，避免全部显示成同一秒。
     */
    var PARA_STEP_MS = 1000;
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

    /**
     * 返回该思考块已记录的最后一段的毫秒时间，用于「补录」时推断后续段落的时间。
     * 切换会话再回来时，缺席期间累积的多段思考会在同一次扫描里一次性补齐；
     * 若每段都取 new Date()，它们会拿到完全相同的时刻。
     */
    function lastParagraphMs(stableKey) {
      var record = storeGet(stableKey);
      if (!record || !Array.isArray(record.paras) || record.paras.length === 0) {
        return typeof record?.startMs === 'number' ? record.startMs : 0;
      }
      for (var i = record.paras.length - 1; i >= 0; i--) {
        var entry = record.paras[i];
        if (entry && typeof entry[2] === 'number') return entry[2];
      }
      return typeof record.startMs === 'number' ? record.startMs : 0;
    }

    function rememberParagraphStamp(stableKey, paraKey, stamp, ms) {
      if (!stableKey || !paraKey || !stamp) return;
      var record = storeGet(stableKey) || { start: '', startMs: 0, duration: '', paras: [] };
      if (!Array.isArray(record.paras)) record.paras = [];
      for (var i = 0; i < record.paras.length; i++) {
        if (record.paras[i] && record.paras[i][0] === paraKey) {
          return; // 已记录，保持首次时间不变
        }
      }
      record.paras.push([paraKey, stamp, typeof ms === 'number' ? ms : 0]);
      storePut(stableKey, record);
      // 段落时间戳同样立即落盘：DOM 重建后只能靠它还原
      flushDurableStoreNow();
    }

    function paragraphStampMs(stableKey, paraKey) {
      if (!stableKey || !paraKey) return 0;
      var record = storeGet(stableKey);
      if (!record || !Array.isArray(record.paras)) return 0;
      for (var i = 0; i < record.paras.length; i++) {
        var entry = record.paras[i];
        if (entry && entry[0] === paraKey) {
          return typeof entry[2] === 'number' ? entry[2] : 0;
        }
      }
      return 0;
    }

    /**
     * 记录思考块的「最后活跃时刻」。
     *
     * 用户在思考中途切到别的会话时，思考会在后台继续并可能已经完成，
     * 而插件此刻不在页面上，观察不到 running -> ok 的转换。切回来时
     * 只有起点没有终点，耗时就会缺失。持续写下这个时刻，切回后即可
     * 据此推断真实耗时。
     *
     * 写入是节流的（最多每秒一次），避免心跳每轮都落盘。
     */
    function touchRunning(meta) {
      if (!meta || !meta.stableKey) return;
      var now = Date.now();
      if (meta.lastTouchMs && now - meta.lastTouchMs < 900) return;
      meta.lastTouchMs = now;

      var record = storeGet(meta.stableKey) || { start: '', startMs: 0, duration: '', paras: [] };
      record.lastSeenMs = now;
      storePut(meta.stableKey, record);
      // 同步落盘：用户可能下一秒就切走
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

    /**
     * 解析思考行的两段结构（与 DSH 原生 DisclosureRow 完全一致）：
     *
     *   div[data-disclosure-header]._header_*      ← display:flex，无 overflow
     *     div[data-disclosure-row]._row_*          ← flex:1 1 auto + overflow:hidden
     *       span.leading
     *       span.TextShimmer._root_* (width:max-content; max-width:100%)
     *         span.title / span.summary
     *     {headerAccessory}                        ← 官方留给附加元素的位置
     *
     * 关键：药丸绝对不能放进 _row_*，它带 overflow:hidden 且被 TextShimmer
     * 的 max-content 宽度占满，任何追加进去的元素都会被整块裁掉——这正是
     * 「除 agy 外所有模型的思考都看不到时间戳」的真正原因（agy 之所以可见，
     * 是它自动展开了思考行，用户看到的是 thinkBody 里的段落时间戳）。
     */
    function resolveHeaderParts(thinkEl) {
      var row = thinkEl.querySelector('[data-disclosure-row]') ||
                thinkEl.querySelector('[class*="row"]') ||
                thinkEl.firstElementChild;
      if (!row) return null;

      function isHeaderEl(node) {
        return Boolean(node && node.nodeType === 1 &&
          typeof node.getAttribute === 'function' &&
          node.getAttribute('data-disclosure-header') !== null);
      }

      // 优先落到 [data-disclosure-header]（官方 headerAccessory 槽位）
      var header = null;
      var parent = row.parentNode;
      if (isHeaderEl(parent)) {
        header = parent;
      } else if (parent && typeof parent.querySelector === 'function') {
        var found = parent.querySelector('[data-disclosure-header]');
        if (isHeaderEl(found)) header = found;
      }
      if (!header) {
        // 兜底：自己向上找最近一层 header
        var cur = parent;
        while (cur && cur !== thinkEl && cur.nodeType === 1) {
          if (isHeaderEl(cur)) { header = cur; break; }
          cur = cur.parentNode;
        }
      }
      // 老结构没有 header 包装时，退回 row 本身
      return { row: row, header: header || row };
    }

    function ensurePillElement(parts) {
      if (!parts || !parts.header) return null;
      var host = parts.header;

      var pill = host.querySelector('.dsh-think-time-pill');
      if (pill) return pill;

      // 药丸可能残留在旧位置（热重载前插进了 row），先迁移出来
      var stale = parts.row && parts.row !== host
        ? parts.row.querySelector('.dsh-think-time-pill')
        : null;

      if (stale) {
        pill = stale;
      } else {
        pill = document.createElement('span');
        pill.className = 'dsh-think-time-pill';
      }
      host.appendChild(pill);
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

        // 快速路径：已结算且无状态变动的旧节点，跳过标题栏与耗时计算。
        // 但不能整体 return —— 用户可能刚展开这个块，正文是首次出现，
        // 段落时间戳仍需补录。只跳过头部，正文照常处理。
        var headSettled = settledNodes.has(thinkEl) && state !== 'running';

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
            // 记录里没有耗时但有过活跃时刻：说明切走期间思考在后台完成，
            // 交给下面的结算分支用 lastSeenMs 推断，不能在这里标 settled。
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
            // 补录游标：保证同一次扫描内新增的多段思考时间戳严格递增
            lastAssignedMs: 0,
            pendingOrdinal: 0,
            lastTouchMs: 0,
            processedParagraphs: new WeakSet()
          };
          trackedThinkNodes.set(thinkEl, meta);

          // 立刻落盘起点，保证中途离开也能恢复。
          // 必须同步写：异步 flush 有 120ms 延迟，用户切走比它快就丢记录，
          // 回来时 startMs 退化成「现在」，耗时被兜底成 0.1s。
          storePut(stableKey, {
            start: startStamp,
            startMs: startMs,
            duration: elapsedSec,
            lastSeenMs: record && typeof record.lastSeenMs === 'number' ? record.lastSeenMs : 0,
            paras: record && Array.isArray(record.paras) ? record.paras : []
          });
          flushDurableStoreNow();
        }

        // 1. 查找思考栏标题区域（DisclosureRow）
        var headerParts = resolveHeaderParts(thinkEl);

        // 自愈：React 可能重建了 header/row 内部子树，把已注入的药丸一起销毁。
        // 若 headSettled 命中就直接跳过，药丸会永久丢失。这里先确认它仍在，
        // 不在就用已结算的 meta 立刻补回来。
        if (headerParts && headSettled && headerParts.header &&
            !headerParts.header.querySelector('.dsh-think-time-pill')) {
          var healed = ensurePillElement(headerParts);
          if (healed) {
            var healedText = meta.elapsedSec
              ? '⏱️ ' + meta.startStamp + ' (耗时 ' + meta.elapsedSec + 's)'
              : '⏱️ ' + meta.startStamp;
            updatePillText(healed, 'done', healedText);
          }
        }

        if (headerParts && !headSettled) {
          // 【顺序关键】必须在注入药丸之前抓取标题原文快照。
          // 一旦 pill 被 append 进去，textContent 就会混入
          // 我们自己写的时间戳文本，导致后续耗时嗅探读到自己而不是原生信息。
          var titleRowRawText = headerParts.row ? (headerParts.row.textContent || '') : '';
          var pill = ensurePillElement(headerParts);
          if (!pill) return;

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
            // 首次进入即打点：心跳要 1 秒后才启动，用户可能在那之前就切走
            touchRunning(meta);
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
                  // 2. 用户在思考中途切走、思考在后台完成的情况：
                  //    插件没看到 running -> ok 的转换，但心跳记下了最后活跃时刻。
                  //    用它推算真实耗时，比留空或编造都更接近事实。
                  var seenMs = record && typeof record.lastSeenMs === 'number' ? record.lastSeenMs : 0;
                  if (seenMs > 0 && meta.startMs && seenMs > meta.startMs) {
                    meta.elapsedSec = Math.max(0.1, (seenMs - meta.startMs) / 1000).toFixed(1);
                  } else {
                    // 3. 历史节点：优先嗅探原生标题行或已有药丸文本，绝不凭空计时
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
                lastSeenMs: prev && typeof prev.lastSeenMs === 'number' ? prev.lastSeenMs : 0,
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
          var pending = [];

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

            // 段落时间戳按「段落正文指纹」持久化：DOM 重建后段落是全新元素，
            // 以正文指纹为键，命中则复用最初记录的时间。
            var paraKey = fingerprint(rawText);
            var known = lookupParagraphStamp(meta.stableKey, paraKey);

            if (known) {
              p.setAttribute('data-dsh-think-time', known);
              var knownMs = paragraphStampMs(meta.stableKey, paraKey);
              if (knownMs > (meta.lastAssignedMs || 0)) meta.lastAssignedMs = knownMs;
            } else {
              pending.push({ el: p, key: paraKey, text: rawText });
            }
          }

          // 【关键修复】同一批补录的段落必须互相错开。
          //
          // 切换会话再回来时，缺席期间累积的多段思考会在同一次扫描里一次性补齐。
          // 若逐段取 new Date()，它们的毫秒差往往不足 1 秒，显示出来就是完全相同的
          // 时间戳。这里先收集、再统一分配：以「现在」为终点向前按固定步长铺开，
          // 保证每段相隔一个可辨识的步长；若窗口不够（例如刚切回就补齐），
          // 则改从已记录的最后一点向后铺开 —— 宁可略微越过 now，也不允许重复。
          if (pending.length > 0) {
            var nowMs = Date.now();
            var anchorMs = Math.max(
              lastParagraphMs(meta.stableKey) || 0,
              meta.lastAssignedMs || 0,
              meta.startMs || 0
            );
            var count = pending.length;

            // 确定可用的时间窗口。
            //
            // 已结算的块：它真实只存活了 startMs ~ startMs+duration 这段，
            // 段落必须落在这个窗口内。若拿 now 当基准（比如用户半小时后才展开
            // 一个历史块），所有段落都会被推到「现在」，看起来完全失真。
            // 正在思考的块：窗口到 now 为止。
            var windowEndMs;
            var durationSec = parseFloat(meta.elapsedSec);
            if (isFinite(durationSec) && durationSec > 0 && meta.startMs) {
              windowEndMs = meta.startMs + durationSec * 1000;
            } else {
              windowEndMs = nowMs;
            }
            if (windowEndMs <= anchorMs) {
              // 窗口退化（记录不完整或段落比耗时段落还多）：
              // 从 anchor 起按步长向后铺，宁可略超窗口也不允许重复。
              windowEndMs = anchorMs + count * PARA_STEP_MS;
            }

            var span = windowEndMs - anchorMs;
            // 步长取「窗口均分」与「最小可辨识步长」中的较大者：
            //   - 窗口宽裕（如 10 秒窗口补 3 段）：铺满窗口，各段落在真实时间范围内；
            //   - 窗口太窄（刚切回就补齐，常不足 1 秒）：宁可按 1 秒向未来延伸，
            //     也绝不让多段落在同一秒里显示成同一个时间戳。
            var step = span / count;
            if (step < PARA_STEP_MS) step = PARA_STEP_MS;

            var assignMs = [];
            for (var k = 0; k < count; k++) {
              assignMs.push(Math.round(anchorMs + step * (k + 1)));
            }

            for (var m = 0; m < count; m++) {
              var item = pending[m];
              var ms = assignMs[m];
              var stamp = getEast8Time(new Date(ms), false);
              meta.lastAssignedMs = ms;

              // 安全注入：设置 CSS 属性标记，由 ::before 伪元素渲染，不破坏 React DOM 节点
              item.el.setAttribute('data-dsh-think-time', stamp);
              rememberParagraphStamp(meta.stableKey, item.key, stamp, ms);

              // 控制台输出
              var logSnippet = item.text.length > 80 ? item.text.slice(0, 80) + '...' : item.text;
              console.log(
                '%c[' + getEast8Time(new Date(), true) + ']%c [DSH 思考输出] %s',
                'color: #06b6d4; font-weight: bold;',
                'color: #888;',
                logSnippet
              );
            }
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
                var headerParts = resolveHeaderParts(thinkEl);
                if (!headerParts || !headerParts.header) return;
                var pill = headerParts.header.querySelector('.dsh-think-time-pill');
                if (!pill) return;
                var liveSec = Math.max(0, Math.floor((Date.now() - meta.startMs) / 1000));
                var liveText = liveSec > 0
                  ? '⏱️ ' + meta.startStamp + ' (思考中 ' + liveSec + 's...)'
                  : '⏱️ ' + meta.startStamp + ' (思考中...)';
                updatePillText(pill, 'running', liveText);

                // 记录「最后观察到的活跃时刻」。
                // 用户在思考中途切走时，思考会在后台继续并完成，而插件此时
                // 不在页面上，观察不到 running -> ok 的转换。切回来时只有起点、
                // 没有终点，耗时就会缺失。持续写下这个时刻，切回后即可据此
                // 推算出真实耗时，而不是留空或编造。
                touchRunning(meta);
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
  // 必须与 bundle 名、cordis.patch 中的 name 完全一致。
  // DSH 的启动冻结检查按脚本里注册的 id 校验；注册多个 id 会被判定为
  // “不再注册原 id”，导致热重载被永久拒绝，页面一直跑旧脚本。
  window.__ModuleLoader__.load({
    id: 'dsh-thinking-timestamp',
    factory: createClientModule
  });
}
