import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assertCanStart,
  createInitialState,
  isActiveStatus,
  transitionTo,
} from "./serviceState.js";

describe("serviceState", () => {
  it("creates idle initial state", () => {
    const state = createInitialState("java-backend");
    assert.equal(state.kind, "java-backend");
    assert.equal(state.status, "idle");
    assert.equal(state.port, null);
  });

  it("rejects start while starting or healthy", () => {
    const starting = transitionTo(createInitialState("java-backend"), "starting");
    assert.throws(() => assertCanStart(starting), /startup already in progress/);

    const healthy = transitionTo(createInitialState("java-backend"), "healthy", {
      port: 8080,
    });
    assert.throws(() => assertCanStart(healthy), /already running/);
  });

  it("tracks active statuses", () => {
    assert.equal(isActiveStatus("starting"), true);
    assert.equal(isActiveStatus("healthy"), true);
    assert.equal(isActiveStatus("idle"), false);
  });
});
