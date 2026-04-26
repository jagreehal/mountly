export interface TimingEvent {
  moduleId: string;
  phase: "preload_start" | "preload_end" | "activate_start" | "activate_end" | "mount_start" | "mount_end" | "unmount";
  timestamp: number;
  duration?: number;
  error?: string;
}

export type AnalyticsCallback = (event: TimingEvent) => void;

const subscribers = new Set<AnalyticsCallback>();
const eventLog: TimingEvent[] = [];

export function onAnalyticsEvent(callback: AnalyticsCallback): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function getAnalyticsLog(): ReadonlyArray<TimingEvent> {
  return [...eventLog];
}

export function clearAnalyticsLog(): void {
  eventLog.length = 0;
}

export function emitAnalyticsEvent(event: TimingEvent): void {
  eventLog.push(event);
  for (const callback of subscribers) {
    try {
      callback(event);
    } catch {
      // Subscriber errors should not break analytics
    }
  }
}

export interface FeatureTimingTracker {
  recordPhase(
    phase: TimingEvent["phase"],
    extra?: Partial<Omit<TimingEvent, "moduleId" | "phase" | "timestamp">>
  ): void;
  getTimings(): TimingEvent[];
  getAverageDuration(phase: TimingEvent["phase"]): number | null;
}

const moduleTimings = new Map<string, TimingEvent[]>();

export function createFeatureTimingTracker(
  moduleId: string
): FeatureTimingTracker {
  if (!moduleTimings.has(moduleId)) {
    moduleTimings.set(moduleId, []);
  }

  const timings = moduleTimings.get(moduleId)!;

  const phaseStarts = new Map<string, number>();

  const recordPhase = (
    phase: TimingEvent["phase"],
    extra?: Partial<Omit<TimingEvent, "moduleId" | "phase" | "timestamp">>
  ) => {
    const now = performance.now();
    let duration: number | undefined;

    if (phase.endsWith("_start")) {
      phaseStarts.set(phase, now);
    } else if (phase.endsWith("_end") || phase === "unmount") {
      const startPhase = phase.replace("_end", "_start");
      const start = phaseStarts.get(startPhase);
      if (start) {
        duration = now - start;
        phaseStarts.delete(startPhase);
      }
    }

    const event: TimingEvent = {
      moduleId,
      phase,
      timestamp: Date.now(),
      duration,
      ...extra,
    };

    timings.push(event);
    emitAnalyticsEvent(event);
  };

  const getTimings = (): TimingEvent[] => [...timings];

  const getAverageDuration = (
    phase: TimingEvent["phase"]
  ): number | null => {
    const withDuration = timings.filter(
      (e) => e.phase === phase && e.duration !== undefined
    );
    if (withDuration.length === 0) return null;
    const sum = withDuration.reduce((acc, e) => acc + (e.duration ?? 0), 0);
    return sum / withDuration.length;
  };

  return { recordPhase, getTimings, getAverageDuration };
}

export function getModuleTimings(
  moduleId: string
): ReadonlyArray<TimingEvent> {
  return moduleTimings.get(moduleId) ?? [];
}

export function getAllModuleTimings(): Map<string, ReadonlyArray<TimingEvent>> {
  return new Map(
    Array.from(moduleTimings.entries()).map(([k, v]) => [k, [...v]])
  );
}
