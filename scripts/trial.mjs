/**
 * `trial.mjs`:
 * 试用脚本 —— 模拟真实 AI 推理模型（如 DeepSeek-R1）流式输出思考内容的全过程，
 * 演示 dsh-thinking-timestamp 插件如何独立、高精度捕获并打印物理时间戳。
 */

import { createReasoningMonitor, decorateReasoningText } from '../dist/index.js';

console.log('\x1b[1m\x1b[35m=== DSH Thinking Timestamp 插件试用演示 ===\x1b[0m\n');
console.log('模式：【完全脱离 Prompt 提示词，独立流式监听与物理时间戳打印】\n');

// 模拟 DSH 宿主上下文
const handlers = new Map();
const mockCtx = {
  on(event, handler) {
    if (!handlers.has(event)) handlers.set(event, []);
    handlers.get(event).push(handler);
    return () => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      }
    };
  },
  emit(event, payload) {
    const list = handlers.get(event) || [];
    for (const h of list) h(payload);
  }
};

// 启动时间戳监控器
const monitor = createReasoningMonitor(mockCtx, {
  printToConsole: true,
  showMilliseconds: true,
  prefix: '[THINK]',
  timeZone: 'Asia/Shanghai'
});

const sessionId = 'test-session-001';
const mockPayload = (frame) => ({
  agent: { session: { id: sessionId } },
  frame
});

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 模拟思考步骤与流式片段
const simulatedSteps = [
  "正在分析用户提出的'给思考输出添加时间戳'的改造需求...",
  "检查系统提示词：确保完全脱离 Prompt，不占用任何上下文 Token，无语言限制。",
  "调用底层 agent/assistant-stream 监听器，按思考断句与换行实时切分。",
  "使用本地系统的真实高精度物理时钟（精确至毫秒）生成时间戳标签。",
  "思考结束，推导演算通过，准备切换至正式正文回复。"
];

async function runLiveTrial() {
  console.log('\x1b[33m>>> [1/2] 终端实时流式捕获演示（模拟模型边思考边吐字）...\x1b[0m\n');

  // 1. 发送流式开始帧
  mockCtx.emit('agent/assistant-stream', mockPayload({
    type: 'start',
    turn: 1,
    step: 1
  }));

  // 2. 模拟逐步流式输出思考内容
  for (let i = 0; i < simulatedSteps.length; i++) {
    const sentence = simulatedSteps[i];
    // 模拟字符分块流式传输
    const chunks = sentence.match(/.{1,8}/g) || [sentence];
    for (const chunk of chunks) {
      mockCtx.emit('agent/assistant-stream', mockPayload({
        type: 'chunk',
        chunk: {
          type: 'reasoning-delta',
          delta: chunk
        }
      }));
      await sleep(40); // 模拟打字流式间隔
    }
    // 句子结束，输出换行触发打印
    mockCtx.emit('agent/assistant-stream', mockPayload({
      type: 'chunk',
      chunk: {
        type: 'reasoning-delta',
        delta: '\n'
      }
    }));
    await sleep(350); // 步骤之间的停顿推导
  }

  // 3. 模拟正文开始（思考流自动终结）
  mockCtx.emit('agent/assistant-stream', mockPayload({
    type: 'chunk',
    chunk: {
      type: 'text-delta',
      delta: '你好！我已经梳理好时间戳功能的试用流程：\n'
    }
  }));

  // 4. 发送流式结束帧
  mockCtx.emit('agent/assistant-stream', mockPayload({
    type: 'end'
  }));

  await sleep(200);

  console.log('\n\x1b[33m>>> [2/2] 前端 UI 界面独立段落装饰渲染效果：\x1b[0m\n');
  const fullReasoningText = simulatedSteps.join('\n\n');
  const decoratedMarkdown = decorateReasoningText(fullReasoningText, { style: 'badge' });
  console.log(decoratedMarkdown);
  console.log('\n\x1b[1m\x1b[32m=== 试用演示完成 ===\x1b[0m');

  monitor.dispose();
}

runLiveTrial();
