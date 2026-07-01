import type { ManagedServiceState, ServiceKind, ServiceStatus } from "../shared/types.js";

export function createInitialState(kind: ServiceKind): ManagedServiceState {
  return {
    kind,
    status: "idle",
    port: null,
    pid: null,
    lastError: null,
    startedAt: null,
    ocrProxy: kind === "java-backend" ? null : undefined,
  };
}

/** Reject duplicate start while starting or already healthy. */
export function assertCanStart(state: ManagedServiceState): void {
  if (state.status === "starting") {
    throw new Error(`${state.kind} startup already in progress`);
  }
  if (state.status === "healthy") {
    throw new Error(`${state.kind} already running`);
  }
}

export function patchState(
  state: ManagedServiceState,
  patch: Partial<Omit<ManagedServiceState, "kind">>,
): ManagedServiceState {
  return { ...state, ...patch };
}

export function transitionTo(
  state: ManagedServiceState,
  status: ServiceStatus,
  extra: Partial<Omit<ManagedServiceState, "kind" | "status">> = {},
): ManagedServiceState {
  return patchState(state, { status, ...extra });
}

export function isActiveStatus(status: ServiceStatus): boolean {
  return status === "starting" || status === "healthy";
}
