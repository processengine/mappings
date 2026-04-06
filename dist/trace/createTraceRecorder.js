import { maybeRedact, redactValue } from './redact.js';

export function createTraceRecorder({ artifactId, level, redact }) {
  const events = [];

  function recordLegacyEntry(entry, index) {
    const outcome = entry.outputCreated ? 'applied' : 'skipped';
    const baseEvent = {
      kind: 'mapping.rule',
      artifactType: 'mapping',
      artifactId,
      step: entry.target,
      at: new Date().toISOString(),
      outcome,
      target: entry.target,
      details: {
        operator: entry.op,
        resolved: entry.resolved,
        reason: entry.reason,
        selectedIndex: entry.selectedIndex,
        selectedKind: entry.selectedKind,
        fallbackApplied: entry.fallbackApplied,
        fallbackKind: entry.fallbackKind,
        matched: entry.matched,
        sequence: index,
      },
    };

    if (level === 'verbose') {
      baseEvent.input = {
        from: entry.from,
        literal: maybeRedact(entry.literal, level, redact),
        expected: maybeRedact(entry.expected, level, redact),
        inputValue: maybeRedact(entry.inputValue, level, redact),
        candidates: maybeRedact(entry.candidates, level, redact),
        steps: maybeRedact(entry.steps, level, redact),
      };
      if (entry.outputCreated) {
        baseEvent.output = redactValue(entry.outputValue, redact);
      }
    }

    events.push(baseEvent);
  }

  return {
    recordLegacyEntries(entries) {
      entries.forEach((entry, index) => recordLegacyEntry(entry, index));
    },
    finalize() {
      return events;
    },
  };
}
