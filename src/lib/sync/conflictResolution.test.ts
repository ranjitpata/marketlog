import { describe, expect, it } from "vitest";
import { resolveRow, serverIsNewer } from "./conflictResolution";

const local = { id: "e1", updated_at: "2026-05-01T10:00:00.000Z", deleted_at: null };

describe("resolveRow", () => {
  it("server row unknown locally → take-server (new device restore)", () => {
    expect(resolveRow(undefined, true, false, false)).toBe("take-server");
  });

  it("append-only rows: local copy always stands once present", () => {
    expect(resolveRow(local, true, false, true)).toBe("keep-local");
    expect(resolveRow(local, false, false, true)).toBe("keep-local");
  });

  it("unsynced local changes always win (they will be pushed later)", () => {
    expect(resolveRow(local, true, true, false)).toBe("keep-local");
  });

  it("clean local row + newer server copy → take-server (LWW)", () => {
    expect(resolveRow(local, true, false, false)).toBe("take-server");
  });

  it("clean local row + older/equal server copy → skip", () => {
    expect(resolveRow(local, false, false, false)).toBe("skip");
  });

  it("never returns a hard-delete outcome", () => {
    for (const appendOnly of [true, false]) {
      for (const pending of [true, false]) {
        const decision = resolveRow(local, true, pending, appendOnly);
        expect(["keep-local", "take-server", "skip"]).toContain(decision);
      }
    }
  });
});

describe("serverIsNewer", () => {
  it("ISO strings compare correctly", () => {
    expect(serverIsNewer("2026-05-02T00:00:00Z", "2026-05-01T00:00:00Z")).toBe(true);
    expect(serverIsNewer("2026-05-01T00:00:00Z", "2026-05-02T00:00:00Z")).toBe(false);
  });
});
