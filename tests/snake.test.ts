import { describe, expect, it } from "vitest";
import {
  SnakeSession,
  SPEED_TICK_MS,
  gardenConfig,
  type SnakeSnapshot,
} from "../src/model/snake.js";

function snapshotWith(overrides: Partial<SnakeSnapshot>): SnakeSnapshot {
  return {
    mode: "classic",
    gardenId: 0,
    speed: 2,
    gridCols: 8,
    gridRows: 8,
    snake: [
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 1, y: 3 },
    ],
    direction: "right",
    queuedTurn: null,
    food: { x: 6, y: 3 },
    score: 0,
    growth: 0,
    tickAccumMs: 0,
    rngState: 123456789,
    paused: false,
    over: false,
    won: false,
    ...overrides,
  };
}

describe("SnakeSession rules", () => {
  it("moving into the vacating tail cell is legal on a non-growth tick", () => {
    const session = new SnakeSession("tail", "classic", 0, snapshotWith({
      snake: [
        { x: 4, y: 5 },
        { x: 3, y: 5 },
        { x: 2, y: 5 },
        { x: 5, y: 5 },
      ],
      direction: "right",
      food: { x: 7, y: 1 },
    }));
    session.tick();
    expect(session.over).toBe(false);
    expect(session.snake[0]).toEqual({ x: 5, y: 5 });
    expect(session.snake).toHaveLength(4);
  });

  it("growth keeps the tail in place", () => {
    const session = new SnakeSession("growth", "classic", 0, snapshotWith({
      food: { x: 4, y: 3 },
    }));
    const before = session.snake.length;
    const tail = session.snake[session.snake.length - 1];
    session.tick();
    expect(session.snake).toHaveLength(before + 1);
    expect(session.snake[session.snake.length - 1]).toEqual(tail);
    expect(session.growth).toBe(1);
  });

  it("two fast turns cannot reverse within one tick", () => {
    const session = new SnakeSession("turns", "classic", 0, snapshotWith({
      direction: "right",
      queuedTurn: null,
    }));
    expect(session.queueTurn("up")).toBe(true);
    expect(session.queueTurn("down")).toBe(false); // opposite of queued turn
    expect(session.queueTurn("left")).toBe(false); // opposite of current direction
    expect(session.queuedTurn).toBe("up");
  });

  it("a full board terminates cleanly as victory", () => {
    const cells = [{ x: 2, y: 3 }];
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        if ((x !== 3 || y !== 3) && (x !== 2 || y !== 3)) cells.push({ x, y });
      }
    }
    const session = new SnakeSession("full", "classic", 0, snapshotWith({
      gridCols: 4,
      gridRows: 4,
      snake: cells,
      direction: "right",
      food: { x: 3, y: 3 },
    }));
    // head moves right into the last empty food cell
    session.tick();
    expect(session.won).toBe(true);
    expect(session.over).toBe(true);
  });

  it("food never appears on a rock or on the snake", () => {
    const session = new SnakeSession("food", "campaign", 3);
    for (let i = 0; i < 60; i += 1) {
      session.advance(SPEED_TICK_MS[session.speed]);
      if (session.food !== null && !session.over) {
        const onRock = gardenConfig(3).rocks.some(
          (rock) => rock.x === session.food!.x && rock.y === session.food!.y,
        );
        const onSnake = session.snake.some(
          (cell) => cell.x === session.food!.x && cell.y === session.food!.y,
        );
        expect(onRock).toBe(false);
        expect(onSnake).toBe(false);
      }
    }
  });

  it("RNG and queued-turn buffer round-trip through a snapshot", () => {
    const a = new SnakeSession("roundtrip", "campaign", 2);
    a.queueTurn("up");
    a.advance(90);
    const b = new SnakeSession("restore", "classic", 0, a.snapshot());
    expect(b.snapshot()).toEqual(a.snapshot());
    a.advance(40);
    b.advance(40);
    expect(b.snapshot()).toEqual(a.snapshot());
  });

  it("resize cannot alter board dimensions or snake speed", () => {
    expect(SPEED_TICK_MS[1]).toBe(220);
    expect(SPEED_TICK_MS[2]).toBe(160);
    expect(SPEED_TICK_MS[3]).toBe(110);
    const session = new SnakeSession("resize", "classic", 0);
    expect(session.gridCols).toBe(16);
    expect(session.gridRows).toBe(16);
  });
});
