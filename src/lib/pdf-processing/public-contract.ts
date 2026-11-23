import {
  PDF_OMISSION_CODES,
  type DecisionState,
  type ImportStatus,
  type OmissionCode,
  type PublicDecisionReference,
} from "./contracts.ts";
import { SpendingControlError } from "./import-state.ts";
import type { ImportChannel, ProductTerminalOutcome, TerminalOutcome } from "./persistence.ts";

export interface PublicImportOutcome {
  saved: number;
  alreadySaved: number;
  pending: number;
  kept?: number;
  discarded?: number;
  decisions?: PublicDecisionReference[];
}

export interface PublicTerminalOutcome extends PublicImportOutcome {
  status: ImportStatus;
}

const IMPORT_STATUSES = new Set<ImportStatus>(["created", "processing", "ready", "committed", "failed", "cancelled"]);
const DECISION_STATES = new Set<DecisionState>(["pending", "kept", "discarded"]);
const OMISSION_CODES = new Set<OmissionCode>(PDF_OMISSION_CODES);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(): never {
  throw new SpendingControlError("import-read-failed");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}

function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail();
  return Number(value);
}

export function publicDecisionReference(value: unknown): PublicDecisionReference {
  const item = record(value);
  const sourceStart = record(item.sourceStart);
  if (typeof item.decisionId !== "string" || !UUID_PATTERN.test(item.decisionId)) fail();
  if (!Number.isSafeInteger(sourceStart.page) || Number(sourceStart.page) < 1) fail();
  if (!Number.isSafeInteger(sourceStart.itemIndex) || Number(sourceStart.itemIndex) < 0) fail();
  if (typeof item.state !== "string" || !DECISION_STATES.has(item.state as DecisionState)) fail();
  if (!Array.isArray(item.missingReasonCodes)) fail();
  const missingReasonCodes = item.missingReasonCodes.map((code) => {
    if (typeof code !== "string" || !OMISSION_CODES.has(code as OmissionCode)) fail();
    return code as OmissionCode;
  });
  return {
    decisionId: item.decisionId,
    sourceStart: { page: Number(sourceStart.page), itemIndex: Number(sourceStart.itemIndex) },
    state: item.state as DecisionState,
    missingReasonCodes,
  };
}

export function publicImportOutcome(value: unknown, channel: ImportChannel): PublicImportOutcome {
  const item = record(value);
  const shared: PublicImportOutcome = {
    saved: count(item.saved),
    alreadySaved: count(item.alreadySaved),
    pending: count(item.pending),
  };
  if (channel !== "product") return shared;
  if (!Array.isArray(item.decisions)) fail();
  return {
    ...shared,
    kept: count(item.kept),
    discarded: count(item.discarded),
    decisions: item.decisions.map(publicDecisionReference),
  };
}

export function publicTerminalOutcome(
  value: TerminalOutcome | ProductTerminalOutcome,
  channel: ImportChannel,
): PublicTerminalOutcome {
  if (!IMPORT_STATUSES.has(value.status as ImportStatus)) fail();
  return { status: value.status as ImportStatus, ...publicImportOutcome(value, channel) };
}

export function publicImportStatus(
  value: unknown,
  channel: ImportChannel,
): {
  status: ImportStatus;
  outcome: PublicImportOutcome | null;
} {
  const item = record(value);
  if (typeof item.status !== "string" || !IMPORT_STATUSES.has(item.status as ImportStatus)) fail();
  return {
    status: item.status as ImportStatus,
    outcome: item.outcome === null ? null : publicImportOutcome(item.outcome, channel),
  };
}
