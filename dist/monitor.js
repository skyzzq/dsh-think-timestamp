/**
 * `ReasoningTimestampMonitor`:
 * 独立的思考流物理时间戳监控引擎。
 * 完全脱离 System Prompt，严格锁定东八区（UTC+8 / 北京时间）。
 * 直接监听底层流式思考输出（agent/assistant-stream），依据系统真实物理时钟实时打印时间戳。
 */

/**
 * 格式化东八区时间戳 (UTC+8 / 北京时间)
 * 纯数学绝对 UTC+8 偏移计算，确保无论宿主运行在何种海外或本地时区，均严格锁定东八区
 */
export function formatEast8Timestamp(date = new Date(), showMilliseconds = true, includeDate = false, includeZoneLabel = false) {
    const east8Ms = date.getTime() + (8 * 3600 * 1000);
    const d8 = new Date(east8Ms);

    const pad = (n) => String(n).padStart(2, '0');
    const pad3 = (n) => String(n).padStart(3, '0');

    const y = d8.getUTCFullYear();
    const mo = pad(d8.getUTCMonth() + 1);
    const d = pad(d8.getUTCDate());

    const h = pad(d8.getUTCHours());
    const m = pad(d8.getUTCMinutes());
    const s = pad(d8.getUTCSeconds());
    const ms = pad3(d8.getUTCMilliseconds());

    const timePart = showMilliseconds ? `${h}:${m}:${s}.${ms}` : `${h}:${m}:${s}`;
    const datePart = includeDate ? `${y}-${mo}-${d} ` : '';
    const zonePart = includeZoneLabel ? ' UTC+8' : '';

    return `${datePart}${timePart}${zonePart}`;
}

export function formatTimestamp(date = new Date(), timeZone = 'Asia/Shanghai', showMilliseconds = true) {
    return formatEast8Timestamp(date, showMilliseconds, false, true);
}

/**
 * 从原始 Stream Chunk 中抽取 reasoning/思考增量文本
 */
export function extractReasoningDelta(chunk) {
    if (!chunk || typeof chunk !== 'object') return null;

    if (chunk.type === 'reasoning-delta' || chunk.type === 'reasoning-chunk') {
        return typeof chunk.delta === 'string' ? chunk.delta : (typeof chunk.text === 'string' ? chunk.text : null);
    }

    if (chunk.choices && Array.isArray(chunk.choices) && chunk.choices[0]?.delta) {
        const delta = chunk.choices[0].delta;
        if (typeof delta.reasoning_content === 'string') return delta.reasoning_content;
        if (typeof delta.thinking === 'string') return delta.thinking;
    }

    if (chunk.type === 'thinking_delta' && typeof chunk.thinking === 'string') {
        return chunk.thinking;
    }

    if (typeof chunk.reasoning_content === 'string') return chunk.reasoning_content;
    if (typeof chunk.reasoningContent === 'string') return chunk.reasoningContent;

    return null;
}

/**
 * 创建并绑定思考时间戳监控器
 */
export function createReasoningMonitor(ctx, config = {}) {
    const {
        printToConsole = true,
        showMilliseconds = true,
        includeZoneLabel = false,
        includeDate = false,
        prefix = '[THINK]',
        logger = console.log,
        onThinkingStep,
        onThinkingComplete,
    } = config;

    const sessions = new Map();

    function getSessionId(payload) {
        const session = payload?.agent?.session;
        return typeof session?.id === 'string' ? session.id : 'default';
    }

    function flushStep(state, text) {
        const trimmed = text.trim();
        if (!trimmed) return;

        state.stepCount += 1;
        state.totalChars += trimmed.length;
        const now = new Date();
        const stamp = formatEast8Timestamp(now, showMilliseconds, includeDate, includeZoneLabel);
        const elapsedMs = Date.now() - state.startMs;

        if (printToConsole) {
            logger(`\x1b[36m[${stamp}]\x1b[0m \x1b[90m${prefix}\x1b[0m ${trimmed}`);
        }

        if (onThinkingStep) {
            onThinkingStep({
                turn: state.turn,
                step: state.step,
                timestamp: stamp,
                timeMs: now.getTime(),
                elapsedMs,
                text: trimmed,
            });
        }
    }

    function completeThinking(state) {
        if (!state.isThinking) return;
        state.isThinking = false;

        if (state.buffer.trim()) {
            flushStep(state, state.buffer);
            state.buffer = '';
        }

        const endNow = new Date();
        const durationMs = endNow.getTime() - state.startMs;
        const durationSec = (durationMs / 1000).toFixed(2);
        const endStamp = formatEast8Timestamp(endNow, showMilliseconds, includeDate, includeZoneLabel);
        const startStamp = formatEast8Timestamp(state.startDate, showMilliseconds, includeDate, includeZoneLabel);

        if (printToConsole && state.stepCount > 0) {
            logger(
                `\x1b[32m[${endStamp}]\x1b[0m \x1b[90m${prefix}:DONE\x1b[0m ` +
                `Duration: ${durationSec}s | Steps: ${state.stepCount} | Chars: ${state.totalChars}`
            );
        }

        if (onThinkingComplete) {
            onThinkingComplete({
                turn: state.turn,
                step: state.step,
                startTime: startStamp,
                endTime: endStamp,
                durationMs,
                totalChars: state.totalChars,
                stepsCount: state.stepCount,
            });
        }
    }

    const unbindStream = ctx?.on ? ctx.on('agent/assistant-stream', (payload) => {
        const frame = payload?.frame;
        if (!frame) return;

        const sessionId = getSessionId(payload);
        const type = frame.type;

        if (type === 'start') {
            const startNow = new Date();
            sessions.set(sessionId, {
                turn: frame.turn,
                step: frame.step,
                startMs: startNow.getTime(),
                startDate: startNow,
                buffer: '',
                totalChars: 0,
                stepCount: 0,
                isThinking: true,
            });
            return;
        }

        if (type === 'end') {
            const state = sessions.get(sessionId);
            if (state) {
                completeThinking(state);
                sessions.delete(sessionId);
            }
            return;
        }

        if (type === 'chunk') {
            let state = sessions.get(sessionId);
            if (!state) {
                const startNow = new Date();
                state = {
                    startMs: startNow.getTime(),
                    startDate: startNow,
                    buffer: '',
                    totalChars: 0,
                    stepCount: 0,
                    isThinking: true,
                };
                sessions.set(sessionId, state);
            }

            const delta = extractReasoningDelta(frame.chunk);
            if (delta) {
                state.buffer += delta;

                if (state.buffer.includes('\n')) {
                    const lines = state.buffer.split('\n');
                    state.buffer = lines.pop() || '';
                    for (const line of lines) {
                        flushStep(state, line);
                    }
                }
            } else {
                if (state.isThinking && state.buffer.length > 0) {
                    completeThinking(state);
                }
            }
        }
    }) : () => {};

    return {
        dispose: () => {
            unbindStream?.();
            sessions.clear();
        },
        _processDelta: (sessionId, delta) => {
            let state = sessions.get(sessionId);
            if (!state) {
                const startNow = new Date();
                state = {
                    startMs: startNow.getTime(),
                    startDate: startNow,
                    buffer: '',
                    totalChars: 0,
                    stepCount: 0,
                    isThinking: true,
                };
                sessions.set(sessionId, state);
            }
            state.buffer += delta;
            if (state.buffer.includes('\n')) {
                const lines = state.buffer.split('\n');
                state.buffer = lines.pop() || '';
                for (const line of lines) {
                    flushStep(state, line);
                }
            }
        },
        _completeSession: (sessionId) => {
            const state = sessions.get(sessionId);
            if (state) completeThinking(state);
        }
    };
}
