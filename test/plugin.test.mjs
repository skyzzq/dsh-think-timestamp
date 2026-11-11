import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  name,
  inject,
  apply,
  extractReasoningDelta,
  formatTimestamp,
  createReasoningMonitor,
  decorateReasoningText
} from '../dist/index.js';

test('1. Metadata: No systemPrompt injection required', () => {
  assert.equal(name, 'dsh-thinking-timestamp');
  assert.deepEqual(inject, []);

  // 验证 apply 不注册任何 systemPrompt.section
  const mockCtx = {
    systemPrompt: {
      section() {
        assert.fail('Should not touch systemPrompt!');
      }
    }
  };
  apply(mockCtx);
});

test('2. extractReasoningDelta handles multiple stream protocols across languages', () => {
  // English reasoning
  assert.equal(extractReasoningDelta({ type: 'reasoning-delta', delta: 'Analyzing query...' }), 'Analyzing query...');
  // Chinese reasoning
  assert.equal(extractReasoningDelta({ choices: [{ delta: { reasoning_content: '分析用户输入...' } }] }), '分析用户输入...');
  // Non-reasoning chunk ignored
  assert.equal(extractReasoningDelta({ choices: [{ delta: { content: 'Normal reply' } }] }), null);
});

test('3. Stream monitor independently prints physical timestamps', () => {
  const logs = [];
  const steps = [];
  let summary = null;

  const mockCtx = {
    handlers: new Map(),
    on(event, handler) {
      this.handlers.set(event, handler);
      return () => this.handlers.delete(event);
    }
  };

  const monitor = createReasoningMonitor(mockCtx, {
    printToConsole: true,
    showMilliseconds: true,
    prefix: '[THINK]',
    logger: (msg) => logs.push(msg),
    onThinkingStep: (s) => steps.push(s),
    onThinkingComplete: (sum) => { summary = sum; }
  });

  monitor._processDelta('s1', 'Step 1: Check configurations\n');
  monitor._processDelta('s1', 'Step 2: Validate database connections\n');
  monitor._completeSession('s1');

  assert.equal(steps.length, 2);
  assert.equal(steps[0].text, 'Step 1: Check configurations');
  assert.equal(steps[1].text, 'Step 2: Validate database connections');
  assert.match(steps[0].timestamp, /\d{2}:\d{2}:\d{2}\.\d{3}$/);

  assert.equal(logs.length, 3);
  assert.match(logs[0], /\[THINK\].*Step 1/);
  assert.match(logs[1], /\[THINK\].*Step 2/);
  assert.match(logs[2], /Duration:/);

  assert.notEqual(summary, null);
  assert.equal(summary.stepsCount, 2);

  monitor.dispose();
});

test('4. decorateReasoningText decorates pure reasoning paragraphs with timestamps', () => {
  const rawText = 'First thought block\n\nSecond thought block';
  const decorated = decorateReasoningText(rawText);

  const parts = decorated.split('\n\n');
  assert.equal(parts.length, 2);
  assert.match(parts[0], /^`\[\d{2}:\d{2}:\d{2}\]` First thought block/);
  assert.match(parts[1], /^`\[\d{2}:\d{2}:\d{2}\]` Second thought block/);
});
