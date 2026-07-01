import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { TASK_EVENTS } from "../../shared/ipcChannels.js";
import type { TaskEventEnvelope } from "../../shared/types.js";
import { TaskEventBus } from "./taskEvents.js";

describe("TaskEventBus", () => {
  it("emitDemoSequence publishes PRD task events in order", async () => {
    const sent: TaskEventEnvelope[] = [];
    const bus = new TaskEventBus();
    bus.bindSender((_channel, envelope) => {
      sent.push(envelope);
    });

    await bus.emitDemoSequence({
      taskId: "demo-task-42",
      stepMs: 0,
      pageCount: 2,
    });

    assert.equal(sent.length, 6);
    assert.equal(sent[0]?.event, TASK_EVENTS.start);
    assert.equal(sent[0]?.data.task_id, "demo-task-42");

    assert.equal(sent[1]?.event, TASK_EVENTS.progress);
    assert.equal(sent[1]?.data.page, 1);

    assert.equal(sent[2]?.event, TASK_EVENTS.pageDone);
    assert.equal(sent[2]?.data.page, 1);

    assert.equal(sent[3]?.event, TASK_EVENTS.progress);
    assert.equal(sent[3]?.data.page, 2);

    assert.equal(sent[4]?.event, TASK_EVENTS.pageDone);
    assert.equal(sent[4]?.data.page, 2);

    assert.equal(sent[5]?.event, TASK_EVENTS.complete);
    assert.equal(sent[5]?.data.status, "completed");
    assert.equal(sent[5]?.data.progress, 100);
  });

  it("emit wraps payload in envelope", () => {
    const sent: TaskEventEnvelope[] = [];
    const bus = new TaskEventBus();
    bus.bindSender((_channel, envelope) => {
      sent.push(envelope);
    });

    bus.emit(TASK_EVENTS.failed, {
      task_id: "t-1",
      status: "failed",
      message: "page error",
    });

    assert.deepEqual(sent[0], {
      event: TASK_EVENTS.failed,
      data: {
        task_id: "t-1",
        status: "failed",
        message: "page error",
      },
    });
  });
});
