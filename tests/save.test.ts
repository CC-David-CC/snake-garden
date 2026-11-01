import { describe, expect, it } from "vitest";
import {
  decodeSave,
  encodeSave,
  SaveError,
  sessionFromSave,
} from "../src/model/save.js";
import { SnakeSession } from "../src/model/snake.js";

describe("Snake Garden save codec", () => {
  it("round-trips the full logical snapshot", () => {
    const session = new SnakeSession("roundtrip", "campaign", 4);
    session.queueTurn("up");
    session.advance(77);
    const restored = sessionFromSave(decodeSave(encodeSave(session)));
    expect(restored.snapshot()).toEqual(session.snapshot());
  });

  it("rejects wrong-app and structurally invalid documents", () => {
    const text = encodeSave(new SnakeSession("reject", "classic", 0));
    const wrongApp = JSON.parse(text) as Record<string, unknown>;
    wrongApp.appId = "falling-blocks";
    expect(() => decodeSave(JSON.stringify(wrongApp))).toThrow(SaveError);

    const badSpeed = JSON.parse(text) as { payload: { speed: unknown } };
    badSpeed.payload.speed = 9;
    expect(() => decodeSave(JSON.stringify(badSpeed))).toThrow(SaveError);
  });
});
