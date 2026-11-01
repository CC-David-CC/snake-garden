import { Rng } from "./rng.js";

export const DEFAULT_GRID_COLS = 16;
export const DEFAULT_GRID_ROWS = 16;

export type DirectionName = "up" | "down" | "left" | "right";
export type Speed = 1 | 2 | 3;
export type Mode = "campaign" | "classic";

export interface Cell {
  x: number;
  y: number;
}

export const DIRECTIONS: Readonly<Record<DirectionName, Cell>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** One logical move per tick; fixed speeds never depend on display rate. */
export const SPEED_TICK_MS: Readonly<Record<Speed, number>> = {
  1: 220,
  2: 160,
  3: 110,
};

export interface GardenConfig {
  rocks: Cell[];
  goal: number;
}

const GARDENS: readonly GardenConfig[] = [
  { rocks: [], goal: 5 },
  {
    rocks: [
      { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 },
      { x: 8, y: 8 }, { x: 8, y: 9 }, { x: 8, y: 10 },
    ],
    goal: 8,
  },
  {
    rocks: [
      { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 3, y: 5 },
      { x: 12, y: 10 }, { x: 12, y: 11 }, { x: 12, y: 12 },
      { x: 7, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 8 }, { x: 7, y: 8 },
    ],
    goal: 12,
  },
  {
    rocks: [
      { x: 4, y: 4 }, { x: 11, y: 4 },
      { x: 4, y: 11 }, { x: 11, y: 11 },
      { x: 7, y: 6 }, { x: 8, y: 6 }, { x: 7, y: 9 }, { x: 8, y: 9 },
    ],
    goal: 15,
  },
  {
    rocks: [
      { x: 2, y: 7 }, { x: 3, y: 7 }, { x: 4, y: 7 },
      { x: 11, y: 8 }, { x: 12, y: 8 }, { x: 13, y: 8 },
      { x: 7, y: 2 }, { x: 8, y: 2 },
      { x: 7, y: 13 }, { x: 8, y: 13 },
    ],
    goal: 20,
  },
  {
    rocks: [
      { x: 6, y: 4 }, { x: 7, y: 4 }, { x: 8, y: 4 }, { x: 9, y: 4 },
      { x: 6, y: 11 }, { x: 7, y: 11 }, { x: 8, y: 11 }, { x: 9, y: 11 },
      { x: 4, y: 6 }, { x: 4, y: 7 }, { x: 4, y: 8 }, { x: 4, y: 9 },
      { x: 11, y: 6 }, { x: 11, y: 7 }, { x: 11, y: 8 }, { x: 11, y: 9 },
    ],
    goal: 25,
  },
];

export function gardenConfig(gardenId: number): GardenConfig {
  const garden = GARDENS[gardenId];
  if (garden === undefined) throw new Error(`unknown garden ${gardenId}`);
  return { rocks: garden.rocks.map((rock) => ({ ...rock })), goal: garden.goal };
}

function opposite(name: DirectionName): DirectionName {
  switch (name) {
    case "up": return "down";
    case "down": return "up";
    case "left": return "right";
    case "right": return "left";
  }
}

export interface SnakeSnapshot {
  mode: Mode;
  gardenId: number;
  speed: Speed;
  gridCols: number;
  gridRows: number;
  snake: Cell[];
  direction: DirectionName;
  queuedTurn: DirectionName | null;
  food: Cell | null;
  score: number;
  growth: number;
  tickAccumMs: number;
  rngState: number;
  paused: boolean;
  over: boolean;
  won: boolean;
}

export interface TickEvent {
  ate: boolean;
  score: number;
  won: boolean;
  over: boolean;
}

export class SnakeSession {
  readonly rng: Rng;
  mode: Mode = "classic";
  gardenId = 0;
  speed: Speed = 2;
  gridCols = DEFAULT_GRID_COLS;
  gridRows = DEFAULT_GRID_ROWS;
  snake: Cell[] = [];
  direction: DirectionName = "right";
  queuedTurn: DirectionName | null = null;
  food: Cell | null = null;
  score = 0;
  growth = 0;
  tickAccumMs = 0;
  paused = false;
  over = false;
  won = false;

  constructor(
    seed: string | number,
    mode: Mode = "classic",
    gardenId = 0,
    snapshot?: SnakeSnapshot,
  ) {
    this.rng = new Rng(seed);
    if (snapshot !== undefined) {
      this.applySnapshot(snapshot);
      return;
    }
    this.mode = mode;
    this.gardenId = gardenId;
    const centerX = Math.floor(this.gridCols / 2);
    const centerY = Math.floor(this.gridRows / 2);
    this.snake = [
      { x: centerX, y: centerY },
      { x: centerX - 1, y: centerY },
      { x: centerX - 2, y: centerY },
    ];
    this.direction = "right";
    this.spawnFood();
  }

  get tickMs(): number {
    return SPEED_TICK_MS[this.speed];
  }

  get rocks(): readonly Cell[] {
    return gardenConfig(this.gardenId).rocks;
  }

  private inBounds(cell: Cell): boolean {
    return cell.x >= 0 && cell.y >= 0 && cell.x < this.gridCols && cell.y < this.gridRows;
  }

  private cellKey(cell: Cell): string {
    return `${cell.x},${cell.y}`;
  }

  private isRock(cell: Cell): boolean {
    return this.rocks.some((rock) => rock.x === cell.x && rock.y === cell.y);
  }

  private occupiedCells(excludeTail: boolean): Set<string> {
    const cells = excludeTail ? this.snake.slice(0, -1) : this.snake;
    return new Set(cells.map((cell) => this.cellKey(cell)));
  }

  /** At most one queued turn; a turn that reverses the current or queued direction is invalid. */
  queueTurn(name: DirectionName): boolean {
    if (this.paused || this.over) return false;
    if (name === this.direction || name === opposite(this.direction)) return false;
    if (this.queuedTurn !== null && (name === this.queuedTurn || name === opposite(this.queuedTurn))) {
      return false;
    }
    this.queuedTurn = name;
    return true;
  }

  advance(deltaMs: number): void {
    if (this.paused || this.over) return;
    const step = Math.min(Math.max(0, deltaMs), 250);
    this.tickAccumMs += step;
    while (this.tickAccumMs >= this.tickMs && !this.over) {
      this.tickAccumMs -= this.tickMs;
      this.tick();
    }
  }

  tick(): TickEvent {
    if (this.paused || this.over) {
      return { ate: false, score: this.score, won: this.won, over: this.over };
    }
    if (this.queuedTurn !== null) {
      this.direction = this.queuedTurn;
      this.queuedTurn = null;
    }
    const delta = DIRECTIONS[this.direction];
    const head = this.snake[0];
    const next = { x: head.x + delta.x, y: head.y + delta.y };
    const ate = this.food !== null && this.food.x === next.x && this.food.y === next.y;
    const occupied = this.occupiedCells(!ate);
    if (!this.inBounds(next) || this.isRock(next) || occupied.has(this.cellKey(next))) {
      this.over = true;
      return { ate: false, score: this.score, won: this.won, over: true };
    }
    this.snake.unshift(next);
    if (!ate) this.snake.pop();
    if (ate) {
      this.score += 10;
      this.growth += 1;
      this.spawnFood();
      if (this.mode === "campaign" && this.growth >= gardenConfig(this.gardenId).goal) {
        this.won = true;
        this.over = true;
      }
    }
    return { ate, score: this.score, won: this.won, over: this.over };
  }

  private spawnFood(): void {
    const occupied = this.occupiedCells(false);
    const empties: Cell[] = [];
    for (let y = 0; y < this.gridRows; y += 1) {
      for (let x = 0; x < this.gridCols; x += 1) {
        const cell = { x, y };
        if (!this.isRock(cell) && !occupied.has(this.cellKey(cell))) empties.push(cell);
      }
    }
    if (empties.length === 0) {
      this.food = null;
      this.won = true;
      this.over = true;
      return;
    }
    this.food = empties[this.rng.int(empties.length)];
  }

  restart(seed: string | number, mode: Mode, gardenId: number): void {
    const fresh = new SnakeSession(seed, mode, gardenId);
    const snapshot = fresh.snapshot();
    this.rng.setState(snapshot.rngState);
    this.applySnapshot(snapshot);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.over) this.paused = false;
  }

  snapshot(): SnakeSnapshot {
    return {
      mode: this.mode,
      gardenId: this.gardenId,
      speed: this.speed,
      gridCols: this.gridCols,
      gridRows: this.gridRows,
      snake: this.snake.map((cell) => ({ ...cell })),
      direction: this.direction,
      queuedTurn: this.queuedTurn,
      food: this.food === null ? null : { ...this.food },
      score: this.score,
      growth: this.growth,
      tickAccumMs: this.tickAccumMs,
      rngState: this.rng.getState(),
      paused: this.paused,
      over: this.over,
      won: this.won,
    };
  }

  applySnapshot(snapshot: SnakeSnapshot): void {
    this.mode = snapshot.mode;
    this.gardenId = snapshot.gardenId;
    this.speed = snapshot.speed;
    this.gridCols = snapshot.gridCols;
    this.gridRows = snapshot.gridRows;
    this.snake = snapshot.snake.map((cell) => ({ ...cell }));
    this.direction = snapshot.direction;
    this.queuedTurn = snapshot.queuedTurn;
    this.food = snapshot.food === null ? null : { ...snapshot.food };
    this.score = snapshot.score;
    this.growth = snapshot.growth;
    this.tickAccumMs = snapshot.tickAccumMs;
    this.rng.setState(snapshot.rngState);
    this.paused = snapshot.paused;
    this.over = snapshot.over;
    this.won = snapshot.won;
  }
}
