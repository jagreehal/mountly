import {
  defineMountlyFeature,
  registerCustomElement,
  createDevtoolsPanel,
  onAnalyticsEvent,
  createPredictivePrefetcher,
  createScrollPrefetcher,
  registerBuiltInPlugins,
  createPluginTrigger,
  getAnalyticsLog,
  recordInteraction,
} from "mountly";
import { paymentBreakdown } from "payment-breakdown";
import { imageLightbox } from "image-lightbox";

const triggerEl = document.getElementById("payment-trigger")!;
const popoverEl = document.getElementById("payment-popover")!;
const stateBadge = document.getElementById("feature-state")!;
const analyticsLog = document.getElementById("analytics-log")!;
const analyticsCount = document.getElementById("analytics-count")!;

function syncStateBadge() {
  const state = paymentBreakdown.getState();
  stateBadge.textContent = state;
  stateBadge.className = `status-badge status-${state}`;
}

// Reflect state changes triggered anywhere in the app.
onAnalyticsEvent(syncStateBadge);
syncStateBadge();

// ── 1. Canonical use case: feature.attach() ────────────────────────────
// One call wires hover-preload + click-mount + click-again-unmount.
paymentBreakdown.attach({
  trigger: triggerEl,
  mount: popoverEl,
  context: { paymentId: "pay_123" },
  onMount: () => recordInteraction(paymentBreakdown.id),
  onError: (err) => console.error("[demo] payment feature failed:", err),
});

// ── 1b. Multi-instance: same feature, different contexts ───────────────
// Each trigger has its own paymentId; data cache keys keep them separate.
const multiTrigger1 = document.querySelector<HTMLElement>(
  '[data-testid="multi-trigger-1"]'
)!;
const multiPopover1 = document.querySelector<HTMLElement>(
  '[data-testid="multi-popover-1"]'
)!;
const multiTrigger2 = document.querySelector<HTMLElement>(
  '[data-testid="multi-trigger-2"]'
)!;
const multiPopover2 = document.querySelector<HTMLElement>(
  '[data-testid="multi-popover-2"]'
)!;

paymentBreakdown.attach({
  trigger: multiTrigger1,
  mount: multiPopover1,
  context: { paymentId: "pay_123" },
});
paymentBreakdown.attach({
  trigger: multiTrigger2,
  mount: multiPopover2,
  context: { paymentId: "pay_456" },
});

// ── 1c. Host-reserved space + host-owned skeleton ─────────────────────
const skeletonTrigger = document.querySelector<HTMLElement>(
  '[data-testid="skeleton-trigger"]'
)!;
const skeletonPopover = document.querySelector<HTMLElement>(
  '[data-testid="skeleton-popover"]'
)!;
paymentBreakdown.attach({
  trigger: skeletonTrigger,
  mount: skeletonPopover,
  context: { paymentId: "pay_123" },
});

// ── 1d. Imperative live-update via feature.update() ────────────────────
const updatePopover = document.querySelector<HTMLElement>(
  '[data-testid="update-popover"]'
)!;
const updateMountBtn = document.querySelector<HTMLButtonElement>(
  '[data-testid="update-mount-btn"]'
)!;
const updateChangeBtn = document.querySelector<HTMLButtonElement>(
  '[data-testid="update-change-btn"]'
)!;
const updateUnmountBtn = document.querySelector<HTMLButtonElement>(
  '[data-testid="update-unmount-btn"]'
)!;

let updateCounter = 0;
const initialUpdateProps = {
  data: {
    total: 10,
    currency: "USD",
    items: [{ description: "Seat", amount: 10, currency: "USD" }],
  },
};
let updateMountHandle: { unmount: () => void } | null = null;

updateMountBtn.addEventListener("click", async () => {
  if (updateMountHandle) return;
  updateMountHandle = await paymentBreakdown.mount(
    updatePopover,
    {},
    initialUpdateProps
  );
});
updateChangeBtn.addEventListener("click", () => {
  updateCounter += 1;
  const total = 10 + updateCounter * 5;
  paymentBreakdown.update(updatePopover, {
    data: {
      total,
      currency: "USD",
      items: [
        { description: `Seat ×${1 + updateCounter}`, amount: total, currency: "USD" },
      ],
    },
  });
});
updateUnmountBtn.addEventListener("click", () => {
  updateMountHandle?.unmount();
  updateMountHandle = null;
});

// ── 5b. Image lightbox — second widget, inverted aesthetic ────────────
const lightboxTrigger = document.querySelector<HTMLElement>(
  '[data-testid="lightbox-trigger"]'
)!;
const lightboxMount = document.querySelector<HTMLElement>(
  '[data-testid="lightbox-mount"]'
)!;
const SAMPLE_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'>
       <defs>
         <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
           <stop offset='0' stop-color='#c2410c'/>
           <stop offset='1' stop-color='#7c2d12'/>
         </linearGradient>
       </defs>
       <rect width='1200' height='800' fill='url(#g)'/>
       <text x='50%' y='50%' font-family='system-ui,sans-serif' font-size='72'
             fill='#fef3c7' text-anchor='middle' dy='.3em' letter-spacing='8'>
         SAMPLE IMAGE
       </text>
     </svg>`
  );
imageLightbox.attach({
  trigger: lightboxTrigger,
  mount: lightboxMount,
  activateOn: "click",
  preloadOn: "hover",
  props: {
    data: {
      src: SAMPLE_SVG,
      alt: "A warm gradient placeholder",
      caption:
        "A placeholder image, rendered inside a lightbox with its own dark theme. Widgets don't have to share aesthetics — they share infrastructure.",
      index: 3,
      total: 12,
    },
  },
});

// ── 2. Custom element ─────────────────────────────────────────────────
// Register the feature BEFORE defining the element, so the upgrade can
// resolve `module-id` synchronously when connectedCallback fires.
registerCustomElement("payment-breakdown", () => paymentBreakdown);
registerCustomElement("image-lightbox", () => imageLightbox);
defineMountlyFeature();

// ── 2b. Reactive props on the custom element ──────────────────────────
const ceFeature = document.getElementById("custom-element-feature")!;
const ceChangeBtn = document.querySelector<HTMLButtonElement>(
  '[data-testid="ce-change-props-btn"]'
)!;
ceChangeBtn.addEventListener("click", () => {
  ceFeature.setAttribute(
    "props",
    JSON.stringify({
      data: {
        total: 250,
        currency: "GBP",
        items: [
          { description: "Updated plan", amount: 250, currency: "GBP" },
        ],
      },
    })
  );
});

// ── 3. Predictive prefetch (idle) ─────────────────────────────────────
const prefetcher = createPredictivePrefetcher({
  features: [
    { feature: paymentBreakdown, weight: 3, triggers: ["hover", "click"] },
  ],
  strategy: "staggered",
  staggerDelay: 300,
});

const prefetchStatus = document.getElementById("prefetch-status")!;
const startPrefetchBtn = document.getElementById("start-prefetch")!;

startPrefetchBtn.addEventListener("click", () => {
  prefetcher.start();
  prefetchStatus.textContent = "Prefetching...";
  prefetchStatus.className = "status-badge status-preloading";

  const checkInterval = setInterval(() => {
    if (!prefetcher.isActive()) {
      clearInterval(checkInterval);
      prefetchStatus.textContent = "Complete";
      prefetchStatus.className = "status-badge status-preloaded";
      syncStateBadge();
    }
  }, 200);
});

// ── 4. Scroll-based prefetch ──────────────────────────────────────────
const scrollTarget = document.getElementById("scroll-prefetch-target")!;
const scrollStatus = document.getElementById("scroll-prefetch-status")!;

createScrollPrefetcher({
  feature: paymentBreakdown,
  element: scrollTarget,
  preloadDistance: 100,
});

const scrollObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        scrollStatus.textContent = "In viewport — preloaded";
        scrollStatus.className = "status-badge status-preloaded";
        syncStateBadge();
      }
    }
  },
  { threshold: 0.5 }
);
scrollObserver.observe(scrollTarget);

// ── 5. Trigger plugins ────────────────────────────────────────────────
registerBuiltInPlugins();

const swipeTarget = document.getElementById("swipe-trigger")!;
const swipeStatus = document.getElementById("swipe-status")!;
createPluginTrigger(
  "swipe",
  swipeTarget,
  () => {
    swipeStatus.textContent = "Swipe detected!";
    swipeStatus.className = "status-badge status-mounted";
    setTimeout(() => {
      swipeStatus.textContent = "Ready";
      swipeStatus.className = "status-badge status-idle";
    }, 1500);
  },
  { direction: "right", threshold: 30 }
);

const longpressTarget = document.getElementById("longpress-trigger")!;
const longpressStatus = document.getElementById("longpress-status")!;
createPluginTrigger(
  "longpress",
  longpressTarget,
  () => {
    longpressStatus.textContent = "Long press detected!";
    longpressStatus.className = "status-badge status-mounted";
    setTimeout(() => {
      longpressStatus.textContent = "Ready";
      longpressStatus.className = "status-badge status-idle";
    }, 1500);
  },
  { duration: 800 }
);

const keyboardTarget = document.getElementById("keyboard-trigger")!;
const keyboardStatus = document.getElementById("keyboard-status")!;
createPluginTrigger(
  "keyboard",
  keyboardTarget,
  () => {
    keyboardStatus.textContent = "Key detected!";
    keyboardStatus.className = "status-badge status-mounted";
    setTimeout(() => {
      keyboardStatus.textContent = "Ready";
      keyboardStatus.className = "status-badge status-idle";
    }, 1500);
  },
  { key: "Enter" }
);

// ── 6. Analytics panel ────────────────────────────────────────────────
let eventCount = 0;
onAnalyticsEvent((event) => {
  eventCount++;
  if (analyticsCount) analyticsCount.textContent = String(eventCount);
  if (!analyticsLog) return;

  const entry = document.createElement("div");
  entry.className = "analytics-entry";
  entry.innerHTML = `<span class="analytics-time">${new Date(event.timestamp).toLocaleTimeString()}</span> <span class="analytics-module">${event.moduleId}</span> <span class="analytics-phase">${event.phase}</span> ${event.duration ? `<span class="analytics-duration">${event.duration.toFixed(0)}ms</span>` : ""}`;
  analyticsLog.prepend(entry);

  const entries = analyticsLog.querySelectorAll(".analytics-entry");
  if (entries.length > 20) {
    entries[entries.length - 1]?.remove();
  }
});

// ── 7. Devtools ───────────────────────────────────────────────────────
// Open by default in the demo so first-time visitors immediately see the
// cache + lifecycle story. Click the panel header to collapse.
createDevtoolsPanel({ position: "bottom-right", collapsed: false });

// ── Log modal ─────────────────────────────────────────────────────────
const viewLogBtn = document.getElementById("view-log")!;
const logModal = document.getElementById("log-modal")!;
const logContent = document.getElementById("log-content")!;
const closeLogBtn = document.getElementById("close-log")!;

viewLogBtn.addEventListener("click", () => {
  const logs = getAnalyticsLog();
  logContent.innerHTML = logs
    .map(
      (e) =>
        `<div class="log-entry"><span>${new Date(e.timestamp).toLocaleTimeString()}</span> <strong>${e.moduleId}</strong> ${e.phase}${e.duration ? ` <em>${e.duration.toFixed(0)}ms</em>` : ""}</div>`
    )
    .join("");
  logModal.style.display = "flex";
});

closeLogBtn.addEventListener("click", () => {
  logModal.style.display = "none";
});

logModal.addEventListener("click", (e) => {
  if (e.target === logModal) logModal.style.display = "none";
});
