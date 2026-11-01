import { SnakeSession, type SnakeSnapshot } from "./snake.js";
import type { Cell, DirectionName, Mode, Speed } from "./snake.js";

export const SAVE_FORMAT = "ksu.game.save";
export const SAVE_SCHEMA_VERSION = 1;
export const SAVE_APP_ID = "snake-garden";
export const DEFAULT_MAX_SAVE_BYTES = 8 * 1024 * 1024;

export interface SnakeSaveEnvelope {
  format: typeof SAVE_FORMAT;
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  appId: typeof SAVE_APP_ID;
  kind: "logical-snapshot";
  gameBuild: string;
  contentVersion: string;
  payload: SnakeSnapshot;
}

export class SaveError extends Error {
  constructor(readonly reason: string) {
    super(`snake-garden save rejected: ${reason}`);
    this.name = "SaveError";
  }
}

function fail(reason: string): never {
  throw new SaveError(reason);
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDirection(value: unknown): value is DirectionName {
  return value === "up" || value === "down" || value === "left" || value === "right";
}

function isCell(value: unknown): value is Cell {
  return (
    typeof value === "object" &&
    value !== null &&
    isIntegerIn((value as Cell).x, 0, 255) &&
    isIntegerIn((value as Cell).y, 0, 255)
  );
}

export function validateSnapshot(value: unknown): asserts value is SnakeSnapshot {
  if (typeof value !== "object" || value === null) fail("payload is not an object");
  const s = value as Record<string, unknown>;
  if (s.mode !== "campaign" && s.mode !== "classic") fail("invalid mode");
  if (!isIntegerIn(s.gardenId, 0, 5)) fail("invalid gardenId");
  if (s.speed !== 1 && s.speed !== 2 && s.speed !== 3) fail("invalid speed");
  if (!isIntegerIn(s.gridCols, 4, 16) || !isIntegerIn(s.gridRows, 4, 16)) fail("invalid grid size");
  if (!Array.isArray(s.snake) || s.snake.length < 1 || s.snake.length > s.gridCols * s.gridRows || !s.snake.every(isCell)) fail("invalid snake");
  const within = (cell: Cell) => cell.x < (s.gridCols as number) && cell.y < (s.gridRows as number);
  if (!s.snake.every(within) || new Set(s.snake.map((cell: Cell) => `${cell.x},${cell.y}`)).size !== s.snake.length) fail("invalid snake cells");
  if (!isDirection(s.direction)) fail("invalid direction");
  if (s.queuedTurn !== null && !isDirection(s.queuedTurn)) fail("invalid queued turn");
  if (s.food !== null && (!isCell(s.food) || !within(s.food) || s.snake.some((cell: Cell) => cell.x === (s.food as Cell).x && cell.y === (s.food as Cell).y))) fail("invalid food");
  if (!isFiniteNumber(s.score) || !isFiniteNumber(s.growth) || !isFiniteNumber(s.tickAccumMs)) {
    fail("invalid counters");
  }
  if (!isIntegerIn(s.rngState, 0, 0xffffffff)) fail("invalid rngState");
  if ((s.score as number) < 0 || (s.growth as number) < 0 || (s.tickAccumMs as number) < 0 || (s.tickAccumMs as number) > 500) fail("invalid counters");
  for (const key of ["paused", "over", "won"]) {
    if (typeof s[key] !== "boolean") fail(`invalid ${key}`);
  }
}

export function encodeSave(session: SnakeSession): string {
  const envelope: SnakeSaveEnvelope = {
    format: SAVE_FORMAT,
    schemaVersion: SAVE_SCHEMA_VERSION,
    appId: SAVE_APP_ID,
    kind: "logical-snapshot",
    gameBuild: "unbound",
    contentVersion: "1",
    payload: session.snapshot(),
  };
  return JSON.stringify(envelope);
}

export function decodeSave(
  text: string,
  maxBytes: number = DEFAULT_MAX_SAVE_BYTES,
): SnakeSaveEnvelope {
  if (text.length > maxBytes) fail("document exceeds the size limit");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("document is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) fail("document is not an object");
  const envelope = parsed as Record<string, unknown>;
  if (envelope.format !== SAVE_FORMAT) fail("unknown format");
  if (envelope.schemaVersion !== SAVE_SCHEMA_VERSION) fail("unsupported schema version");
  if (envelope.appId !== SAVE_APP_ID) fail("wrong app id");
  if (envelope.kind !== "logical-snapshot") fail("unexpected kind");
  validateSnapshot(envelope.payload);
  return envelope as unknown as SnakeSaveEnvelope;
}

export function sessionFromSave(envelope: SnakeSaveEnvelope): SnakeSession {
  return new SnakeSession("restore", envelope.payload.mode, envelope.payload.gardenId, envelope.payload);
}
