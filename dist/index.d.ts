import type { MonitorConfig } from './monitor.js';
import type { DecorateOptions } from './decorator.js';

export * from './monitor.js';
export * from './decorator.js';

export declare const name = "dsh-thinking-timestamp";
export declare const inject: never[];

export interface PluginOptions {
    enabled?: boolean;
    enableStreamMonitor?: boolean;
    monitor?: MonitorConfig;
    enableClientSlot?: boolean;
    decorator?: DecorateOptions;
}

export declare function apply(ctx: any, config?: PluginOptions): void;
