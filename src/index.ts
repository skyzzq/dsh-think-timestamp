/**
 * `dsh-thinking-timestamp`:
 * 纯粹的思考流物理时间戳打印与装饰插件。
 *
 * 特性：
 * 1. 【零提示词 / 零 Token 消耗】：完全不修改或注入任何 System Prompt 提示词，无任何语言限制。
 * 2. 【独立物理时钟】：直接在底层监听流式思考输出，依据本地系统硬件时钟打印毫秒级时间戳。
 * 3. 【双端支持】：支持控制台/终端实时打印，以及前端 UI 插槽时间戳装饰。
 */

import { MonitorConfig, createReasoningMonitor } from './monitor.js';
import { DecorateOptions, registerReasoningSlot, decorateReasoningText } from './decorator.js';

export * from './monitor.js';
export * from './decorator.js';

export const name = 'dsh-thinking-timestamp';
// 纯事件与插槽插件，不依赖 systemPrompt
export const inject = [];

export interface PluginOptions {
  /**
   * 是否启用插件
   * @default true
   */
  enabled?: boolean;

  /**
   * 是否启用底层流式思考监听与控制台打印
   * @default true
   */
  enableStreamMonitor?: boolean;

  /**
   * 监控与打印配置
   */
  monitor?: MonitorConfig;

  /**
   * 是否启用前端 UI 插槽时间戳渲染
   * @default true
   */
  enableClientSlot?: boolean;

  /**
   * 客户端时间戳装饰配置
   */
  decorator?: DecorateOptions;
}

/**
 * 插件激活函数
 */
export function apply(ctx: any, config: PluginOptions = {}): void {
  if (config.enabled === false) return;

  // 1. 独立监听底层思考流并打印物理时间戳
  if (config.enableStreamMonitor !== false) {
    createReasoningMonitor(ctx, config.monitor);
  }

  // 2. 独立装饰前端思考 UI 槽位
  if (config.enableClientSlot !== false && ctx.slots?.inject) {
    registerReasoningSlot(ctx, config.decorator);
  }
}
