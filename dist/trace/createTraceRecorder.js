import { maybeRedact, redactValue } from './redact.js';

function truncateSample(value) {
  if (Array.isArray(value)) return value.slice(0, 3);
  return value;
}

export function createTraceRecorder({ artifactId, level, redact }) {
  const events = [];

  function normalizeCommon(entry) {
    return {
      kind: entry.kind,
      artifactType: 'mapping',
      artifactId,
      step: entry.target,
      at: new Date().toISOString(),
      outcome: entry.outcome,
      target: entry.target,
    };
  }

  function recordLegacyEntry(entry, index) {
    const baseEvent = {
      ...normalizeCommon({ ...entry, kind: 'mapping.rule' }),
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

  function recordCompiledEntry(entry, index) {
    const baseEvent = {
      ...normalizeCommon(entry),
      details: {
        operator: entry.operator,
        sequence: index,
      },
    };

    if (entry.kind === 'mapping.aggregate') {
      baseEvent.details.from = entry.from;
      baseEvent.details.selectedCount = entry.selectedCount;
      baseEvent.details.resultType = entry.resultType;
      if (typeof entry.resultValue !== 'undefined') baseEvent.details.resultValue = entry.resultValue;
      if (typeof entry.resultLength !== 'undefined') baseEvent.details.resultLength = entry.resultLength;
      if (typeof entry.droppedCount !== 'undefined') baseEvent.details.droppedCount = entry.droppedCount;
      if (typeof entry.droppedFieldCount !== 'undefined') baseEvent.details.droppedFieldCount = entry.droppedFieldCount;
      if (typeof entry.partialObjectCount !== 'undefined') baseEvent.details.partialObjectCount = entry.partialObjectCount;
      if (typeof entry.picked !== 'undefined') baseEvent.details.picked = entry.picked;
      if (entry.details) Object.assign(baseEvent.details, entry.details);
      if (level === 'verbose') {
        baseEvent.input = {
          from: entry.from,
          selectedCount: entry.selectedCount,
          sample: maybeRedact(truncateSample(entry.sample), level, redact),
        };
        if (typeof entry.outputValue !== 'undefined') {
          baseEvent.output = redactValue(truncateSample(entry.outputValue), redact);
        }
      }
    } else if (entry.kind === 'mapping.rule') {
      if (entry.details) Object.assign(baseEvent.details, entry.details);
      if (level === 'verbose') {
        baseEvent.input = maybeRedact(entry.input, level, redact);
        if (typeof entry.output !== 'undefined') baseEvent.output = redactValue(entry.output, redact);
      }
    }

    events.push(baseEvent);
  }

  return {
    recordLegacyEntries(entries) {
      entries.forEach((entry, index) => recordLegacyEntry(entry, index));
    },
    recordCompiledEntries(entries) {
      entries.forEach((entry, index) => recordCompiledEntry(entry, index));
    },
    finalize() {
      return events;
    },
  };
}
