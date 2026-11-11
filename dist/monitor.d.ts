export interface MonitorConfig {
    printToConsole?: boolean;
    timeZone?: string;
    showMilliseconds?: boolean;
    includeZoneLabel?: boolean;
    includeDate?: boolean;
    prefix?: string;
    logger?: (message: string) => void;
    onThinkingStep?: (step: ThinkingStepEvent) => void;
    onThinkingComplete?: (summary: ThinkingSummaryEvent) => void;
}

export interface ThinkingStepEvent {
    turn?: number;
    step?: number;
    timestamp: string;
    timeMs: number;
    elapsedMs: number;
    text: string;
}

export interface ThinkingSummaryEvent {
    turn?: number;
    step?: number;
    startTime: string;
    endTime: string;
    durationMs: number;
    totalChars: number;
    stepsCount: number;
}

export declare function formatEast8Timestamp(date?: Date, showMilliseconds?: boolean, includeDate?: boolean, includeZoneLabel?: boolean): string;
export declare function formatTimestamp(date?: Date, timeZone?: string, showMilliseconds?: boolean): string;
export declare function extractReasoningDelta(chunk: any): string | null;
export declare function createReasoningMonitor(ctx: any, config?: MonitorConfig): {
    dispose: () => void;
    _processDelta: (sessionId: string, delta: string) => void;
    _completeSession: (sessionId: string) => void;
};
