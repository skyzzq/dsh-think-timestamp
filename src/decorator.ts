/**
 * `ReasoningTimestampDecorator`:
 * 客户端 UI 独立思考时间戳装饰器。
 * 直接对纯净思考文本进行段落分割并附加东八区（UTC+8）时间戳，不依赖任何模型提示词。
 */

import { formatEast8Timestamp } from './monitor.js';

export interface DecorateOptions {
  /**
   * 格式化方式：
   * - 'badge': 徽章标签 `[03:00:15 UTC+8]`
   * - 'markdown': 引用格式 `> ⏱️ 03:00:15 UTC+8`
   * @default 'badge'
   */
  style?: 'badge' | 'markdown';

  /**
   * 是否显示时区标识 (UTC+8)
   * @default false
   */
  includeZoneLabel?: boolean;

  /**
   * 显式时间戳映射表
   */
  timestampMap?: Map<number, Date | string>;
}

/**
 * 为纯净的思考内容按段落独立添加东八区时间戳
 */
export function decorateReasoningText(rawText: string, options: DecorateOptions = {}): string {
  if (!rawText || !rawText.trim()) return rawText;

  const {
    style = 'badge',
    includeZoneLabel = false,
    timestampMap,
  } = options;

  const paragraphs = rawText.split(/\r?\n\r?\n+/);
  const baseTime = new Date();

  return paragraphs.map((para, index) => {
    const trimmed = para.trim();
    if (!trimmed) return para;

    let stamp: string;
    if (timestampMap && timestampMap.has(index)) {
      const val = timestampMap.get(index)!;
      stamp = typeof val === 'string' ? val : formatEast8Timestamp(val, false, false, includeZoneLabel);
    } else {
      const stepDate = new Date(baseTime.getTime() + index * 1000);
      stamp = formatEast8Timestamp(stepDate, false, false, includeZoneLabel);
    }

    if (style === 'markdown') {
      return `> ⏱️ **${stamp}**\n\n${trimmed}`;
    }

    return `\`[${stamp}]\` ${trimmed}`;
  }).join('\n\n');
}

/**
 * 注册客户端插槽（拦截 `conversation.chat.reasoning.body`）
 */
export function registerReasoningSlot(ctx: any, options: DecorateOptions = {}) {
  if (!ctx?.slots?.inject) return;

  ctx.slots.inject('conversation.chat.reasoning.body', () =>
    ctx.slots.register({
      name: 'conversation.chat.reasoning.body',
      priority: 200,
    }, function TimestampedReasoningBody({ text, running, renderFactorySlot }: any) {
      const enrichedText = decorateReasoningText(text, options);
      return renderFactorySlot('conversation.chat.reasoning.content', {
        text: enrichedText,
        running,
      });
    })
  );
}
