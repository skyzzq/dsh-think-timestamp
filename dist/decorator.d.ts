export interface DecorateOptions {
    style?: 'badge' | 'markdown';
    includeZoneLabel?: boolean;
    timestampMap?: Map<number, Date | string>;
}

export declare function decorateReasoningText(rawText: string, options?: DecorateOptions): string;
export declare function registerReasoningSlot(ctx: any, options?: DecorateOptions): void;
