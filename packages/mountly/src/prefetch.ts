import type { OnDemandFeature } from "./feature.js";

export interface PrefetchHeuristicOptions {
  features: Array<{
    feature: OnDemandFeature;
    weight?: number;
    triggers?: string[];
  }>;
  strategy?: "sequential" | "parallel" | "staggered";
  staggerDelay?: number;
  maxConcurrent?: number;
  idleTimeout?: number;
}

interface ScoredFeature {
  feature: OnDemandFeature;
  score: number;
  triggers: string[];
}

const interactionHistory = new Map<string, number>();
let lastInteractionTime = 0;

export function recordInteraction(featureId: string): void {
  const count = interactionHistory.get(featureId) ?? 0;
  interactionHistory.set(featureId, count + 1);
  lastInteractionTime = Date.now();
}

export function getInteractionHistory(): ReadonlyMap<string, number> {
  return new Map(interactionHistory);
}

export function resetInteractionHistory(): void {
  interactionHistory.clear();
  lastInteractionTime = 0;
}

export function createPredictivePrefetcher(
  options: PrefetchHeuristicOptions
) {
  const {
    features,
    strategy = "staggered",
    staggerDelay = 200,
    maxConcurrent = 2,
    idleTimeout = 1000,
  } = options;

  let active = false;
  let aborted = false;
  let rafId: number | null = null;

  const scoredFeatures: ScoredFeature[] = features.map((f) => ({
    feature: f.feature,
    score: f.weight ?? 1,
    triggers: f.triggers ?? [],
  }));

  const calculateDynamicScores = (): ScoredFeature[] => {
    return scoredFeatures.map((sf) => {
      let score = sf.score;

      const interactionCount = interactionHistory.get(sf.feature.id) ?? 0;
      score += interactionCount * 0.5;

      const timeSinceLastInteraction = Date.now() - lastInteractionTime;
      if (timeSinceLastInteraction < 5000) {
        score += 2;
      }

      return { ...sf, score };
    });
  };

  const sortByScore = (a: ScoredFeature, b: ScoredFeature): number => {
    return b.score - a.score;
  };

  const prefetchSequential = async () => {
    const sorted = calculateDynamicScores().sort(sortByScore);

    for (const sf of sorted) {
      if (aborted) return;
      await sf.feature.preload().catch(() => {});
      await new Promise((r) => setTimeout(r, staggerDelay));
    }
  };

  const prefetchParallel = async () => {
    const sorted = calculateDynamicScores().sort(sortByScore);
    const batches: ScoredFeature[][] = [];

    for (let i = 0; i < sorted.length; i += maxConcurrent) {
      batches.push(sorted.slice(i, i + maxConcurrent));
    }

    for (const batch of batches) {
      if (aborted) return;
      await Promise.all(
        batch.map((sf) => sf.feature.preload().catch(() => {}))
      );
      await new Promise((r) => setTimeout(r, staggerDelay));
    }
  };

  const prefetchStaggered = async () => {
    const sorted = calculateDynamicScores().sort(sortByScore);

    const prefetchNext = async (index: number) => {
      if (aborted || index >= sorted.length) return;

      const sf = sorted[index]!;
      await sf.feature.preload().catch(() => {});

      if (index + 1 < sorted.length) {
        rafId = requestAnimationFrame(() => {
          prefetchNext(index + 1);
        });
      }
    };

    await prefetchNext(0);
  };

  const start = () => {
    if (active) return;
    active = true;
    aborted = false;

    const idleCallback = () => {
      switch (strategy) {
        case "sequential":
          prefetchSequential().finally(() => {
            active = false;
          });
          break;
        case "parallel":
          prefetchParallel().finally(() => {
            active = false;
          });
          break;
        case "staggered":
          prefetchStaggered().finally(() => {
            active = false;
          });
          break;
      }
    };

    if ("requestIdleCallback" in window) {
      requestIdleCallback(idleCallback, { timeout: idleTimeout });
    } else {
      setTimeout(idleCallback, 0);
    }
  };

  const abort = () => {
    aborted = true;
    active = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const isActive = () => active;

  const getQueue = (): ScoredFeature[] => {
    return calculateDynamicScores().sort(sortByScore);
  };

  return { start, abort, isActive, getQueue };
}

export interface ScrollBasedPrefetchOptions {
  feature: OnDemandFeature;
  element: HTMLElement;
  threshold?: number;
  preloadDistance?: number;
}

export function createScrollPrefetcher(
  options: ScrollBasedPrefetchOptions
): () => void {
  const {
    feature,
    element,
    threshold = 0.1,
    preloadDistance = 200,
  } = options;

  let preloaded = false;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !preloaded) {
          preloaded = true;
          feature.preload().catch(() => {});
          observer.disconnect();
        }
      }
    },
    {
      rootMargin: `${preloadDistance}px`,
      threshold,
    }
  );

  observer.observe(element);

  return () => {
    observer.disconnect();
  };
}

export interface MouseTrailPrefetchOptions {
  feature: OnDemandFeature;
  element: HTMLElement;
  proximityThreshold?: number;
  delay?: number;
}

export function createMouseTrailPrefetcher(
  options: MouseTrailPrefetchOptions
): () => void {
  const {
    feature,
    element,
    proximityThreshold = 50,
    delay = 150,
  } = options;

  let preloaded = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const handler = (e: MouseEvent) => {
    if (preloaded) return;

    const rect = element.getBoundingClientRect();
    const distance = Math.sqrt(
      Math.pow(e.clientX - rect.left, 2) + Math.pow(e.clientY - rect.top, 2)
    );

    if (distance < proximityThreshold) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        preloaded = true;
        feature.preload().catch(() => {});
      }, delay);
    }
  };

  document.addEventListener("mousemove", handler);

  return () => {
    document.removeEventListener("mousemove", handler);
    if (timer) clearTimeout(timer);
  };
}
