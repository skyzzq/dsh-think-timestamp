/**
 * `dsh-thinking-timestamp`:
 * 纯粹的思考流物理时间戳打印与装饰插件。
 *
 * 特性：
 * 1. 【零提示词 / 零 Token 消耗】：完全不修改或注入任何 System Prompt 提示词，无任何语言限制。
 * 2. 【独立物理时钟】：直接在底层监听流式思考输出，依据本地系统硬件时钟打印毫秒级时间戳。
 * 3. 【双端支持】：支持控制台/终端实时打印，以及前端 UI 插槽时间戳装饰。
 */

import { createReasoningMonitor } from './monitor.js';
import { registerReasoningSlot } from './decorator.js';

export * from './monitor.js';
export * from './decorator.js';

export const name = 'dsh-thinking-timestamp';
export const inject = [];

/**
 * 插件激活函数
 */
export function apply(ctx, config = {}) {
    if (config.enabled === false) return;

    if (config.enableStreamMonitor !== false) {
        createReasoningMonitor(ctx, config.monitor);
    }

    if (config.enableClientSlot !== false && ctx.slots?.inject) {
        registerReasoningSlot(ctx, config.decorator);
    }
}
