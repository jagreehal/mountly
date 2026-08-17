<script setup lang="ts">
import type { DecisionState, ReleaseDecision, ReleaseReport } from "./types";

const props = withDefaults(
  defineProps<{
    report: ReleaseReport;
    decisionState?: DecisionState;
  }>(),
  { decisionState: "idle" },
);

const emit = defineEmits<{
  decide: [decision: ReleaseDecision];
}>();

function decide(decision: ReleaseDecision): void {
  if (props.decisionState === "saving") return;
  emit("decide", decision);
}
</script>

<template>
  <article class="release-docket" :data-recommendation="report.recommendation">
    <header class="docket-head">
      <div class="identity">
        <p class="eyebrow">Release docket · {{ report.environment }}</p>
        <h1>{{ report.service }}</h1>
        <p class="summary">{{ report.summary }}</p>
      </div>

      <div class="verdict" :aria-label="`${report.readiness}% ready`">
        <span class="verdict-label">Readiness</span>
        <strong>{{ report.readiness }}</strong>
        <span class="verdict-scale">/ 100</span>
      </div>
    </header>

    <dl class="release-meta">
      <div>
        <dt>Release</dt>
        <dd>{{ report.releaseId }}</dd>
      </div>
      <div>
        <dt>Commit</dt>
        <dd>{{ report.commit }}</dd>
      </div>
      <div>
        <dt>Owner</dt>
        <dd>{{ report.owner }}</dd>
      </div>
      <div>
        <dt>Window</dt>
        <dd>{{ report.window }}</dd>
      </div>
    </dl>

    <section class="checks" aria-labelledby="checks-heading">
      <div class="section-heading">
        <h2 id="checks-heading">Preflight</h2>
        <span
          >{{ report.checks.filter((check) => check.state === "pass").length }}/{{
            report.checks.length
          }}
          clear</span
        >
      </div>

      <ol>
        <li v-for="(check, index) in report.checks" :key="check.id" :data-state="check.state">
          <span class="check-index">{{ String(index + 1).padStart(2, "0") }}</span>
          <div class="check-copy">
            <div class="check-line">
              <h3>{{ check.label }}</h3>
              <strong>{{ check.value }}</strong>
            </div>
            <p>{{ check.detail }}</p>
          </div>
          <span class="state-mark" :aria-label="check.state" />
        </li>
      </ol>
    </section>

    <footer>
      <div class="recommendation">
        <span>Recommendation</span>
        <strong>{{
          report.recommendation === "ship" ? "Window is clear" : "Hold for review"
        }}</strong>
      </div>

      <div class="actions">
        <button
          class="secondary"
          type="button"
          :disabled="decisionState === 'saving'"
          @click="decide('hold')"
        >
          Hold release
        </button>
        <button
          class="primary"
          type="button"
          :disabled="decisionState === 'saving'"
          @click="decide('approve')"
        >
          {{ decisionState === "saving" ? "Recording…" : "Approve window" }}
        </button>
      </div>

      <p class="decision-note" role="status" aria-live="polite">
        <template v-if="decisionState === 'approved'">Approval recorded for this release.</template>
        <template v-else-if="decisionState === 'held'">Release placed on hold.</template>
        <template v-else-if="decisionState === 'error'"
          >Decision was not recorded. Try again.</template
        >
      </p>
    </footer>
  </article>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

.release-docket {
  --ink: oklch(93% 0.015 78);
  --ink-soft: oklch(72% 0.018 78);
  --ink-faint: oklch(56% 0.014 78);
  --paper: oklch(18% 0.014 72);
  --paper-raised: oklch(22% 0.016 72);
  --rule: oklch(38% 0.018 72);
  --amber: oklch(78% 0.15 75);
  --green: oklch(73% 0.13 150);
  --red: oklch(68% 0.17 32);
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 0.75rem;
  --space-lg: 1rem;
  --space-xl: 1.5rem;
  --space-2xl: 2rem;
  width: min(100%, 54rem);
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--rule);
  border-radius: 0.375rem;
  color: var(--ink);
  background: var(--paper);
  font-family: var(--font-sans, "Mona Sans", sans-serif);
  font-size: 0.9375rem;
  line-height: 1.5;
  container-type: inline-size;
}

.docket-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-xl);
  padding: var(--space-2xl);
  border-bottom: 1px solid var(--rule);
  background:
    linear-gradient(90deg, color-mix(in oklch, var(--amber) 7%, transparent), transparent 45%),
    var(--paper-raised);
}

.identity {
  min-width: 0;
}

.eyebrow,
.verdict-label,
dt,
.section-heading span,
.recommendation span {
  margin: 0;
  color: var(--ink-faint);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

h1 {
  margin: var(--space-sm) 0 0;
  font-family: var(--font-display, "Hubot Sans", "Mona Sans", sans-serif);
  font-size: 2rem;
  font-stretch: condensed;
  font-weight: 760;
  letter-spacing: -0.035em;
  line-height: 1;
}

.summary {
  max-width: 58ch;
  margin: var(--space-md) 0 0;
  color: var(--ink-soft);
}

.verdict {
  display: grid;
  grid-template-columns: auto auto;
  align-content: start;
  min-width: 6.5rem;
  padding-left: var(--space-xl);
  border-left: 1px solid var(--rule);
  font-variant-numeric: tabular-nums;
}

.verdict-label {
  grid-column: 1 / -1;
}

.verdict strong {
  margin-top: var(--space-sm);
  color: var(--amber);
  font-family: var(--font-display, "Hubot Sans", "Mona Sans", sans-serif);
  font-size: 2.75rem;
  line-height: 0.9;
}

.verdict-scale {
  align-self: end;
  padding-bottom: 0.15rem;
  color: var(--ink-faint);
  font-size: 0.75rem;
}

.release-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  border-bottom: 1px solid var(--rule);
}

.release-meta div {
  min-width: 0;
  padding: var(--space-lg) var(--space-xl);
  border-right: 1px solid var(--rule);
}

.release-meta div:last-child {
  border-right: 0;
}

dd {
  overflow: hidden;
  margin: var(--space-xs) 0 0;
  color: var(--ink-soft);
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.checks {
  padding: var(--space-xl) var(--space-2xl) var(--space-2xl);
}

.section-heading,
.check-line,
footer,
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
}

.section-heading {
  margin-bottom: var(--space-md);
}

h2,
h3,
p {
  margin: 0;
}

h2 {
  font-size: 0.875rem;
  font-weight: 720;
  letter-spacing: 0.02em;
}

ol {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--rule);
  list-style: none;
}

li {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) auto;
  gap: var(--space-md);
  align-items: start;
  padding: var(--space-lg) 0;
  border-bottom: 1px solid var(--rule);
}

.check-index {
  padding-top: 0.1rem;
  color: var(--ink-faint);
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-size: 0.6875rem;
}

.check-copy {
  min-width: 0;
}

.check-line {
  align-items: baseline;
}

h3,
.check-line strong {
  font-size: 0.8125rem;
}

.check-line strong {
  flex: none;
  color: var(--ink-soft);
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-weight: 500;
}

.check-copy p {
  max-width: 62ch;
  margin-top: var(--space-xs);
  color: var(--ink-faint);
  font-size: 0.75rem;
}

.state-mark {
  width: 0.625rem;
  height: 0.625rem;
  margin-top: 0.3rem;
  border: 1px solid currentColor;
  border-radius: 50%;
  color: var(--amber);
  background: currentColor;
  box-shadow: inset 0 0 0 2px var(--paper);
}

li[data-state="pass"] .state-mark {
  color: var(--green);
}

li[data-state="block"] .state-mark {
  color: var(--red);
}

footer {
  position: relative;
  flex-wrap: wrap;
  padding: var(--space-xl) var(--space-2xl);
  border-top: 1px solid var(--rule);
  background: var(--paper-raised);
}

.recommendation {
  display: grid;
  gap: var(--space-xs);
}

.recommendation strong {
  color: var(--amber);
  font-size: 0.875rem;
}

button {
  min-height: 2.5rem;
  padding: 0 var(--space-lg);
  border: 1px solid var(--rule);
  border-radius: 0.25rem;
  color: var(--ink);
  background: transparent;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    color 160ms ease-out,
    background 160ms ease-out,
    border-color 160ms ease-out,
    transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

button:hover:not(:disabled) {
  border-color: var(--ink-faint);
  transform: translateY(-1px);
}

button:focus-visible {
  outline: 2px solid var(--amber);
  outline-offset: 3px;
}

button:disabled {
  cursor: wait;
  opacity: 0.55;
}

button.primary {
  border-color: var(--amber);
  color: var(--paper);
  background: var(--amber);
}

.decision-note {
  flex-basis: 100%;
  min-height: 1.2em;
  color: var(--ink-soft);
  font-size: 0.75rem;
  text-align: right;
}

@container (max-width: 38rem) {
  .docket-head {
    grid-template-columns: 1fr;
    padding: var(--space-xl);
  }

  .verdict {
    grid-template-columns: auto 1fr auto;
    align-items: baseline;
    padding: var(--space-lg) 0 0;
    border-top: 1px solid var(--rule);
    border-left: 0;
  }

  .verdict-label {
    grid-column: auto;
  }

  .verdict strong {
    margin: 0;
    font-size: 1.75rem;
    text-align: right;
  }

  .release-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .release-meta div:nth-child(2) {
    border-right: 0;
  }

  .release-meta div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--rule);
  }

  .checks,
  footer {
    padding-right: var(--space-xl);
    padding-left: var(--space-xl);
  }

  .check-line {
    display: grid;
    justify-content: start;
    gap: var(--space-xs);
  }

  footer,
  .actions {
    align-items: stretch;
  }

  footer {
    display: grid;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .decision-note {
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
}
</style>
