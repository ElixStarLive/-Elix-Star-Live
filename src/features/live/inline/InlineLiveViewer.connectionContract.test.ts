import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("InlineLiveViewer connection ownership contract", () => {
  const src = readFileSync(
    resolve(__dirname, "./InlineLiveViewer.tsx"),
    "utf8",
  );

  it("uses generation-based attempt invalidation", () => {
    expect(src).toContain("const connectGenerationRef = useRef(0)");
    expect(src).toContain("const attemptId = ++connectGenerationRef.current");
    expect(src).toContain("const isCurrentAttempt = () =>");
    expect(src).toContain("connectGenerationRef.current === attemptId");
  });

  it("guards stale attempts before room/websocket ownership commit", () => {
    expect(src).toContain("if (!isCurrentAttempt()) {");
    expect(src).toContain("session?.disconnect();");
    expect(src).toContain("websocket.connect(streamKey, authToken, {");
    expect(src).toContain("ownerId: wsOwnerIdRef.current");
  });

  it("cleanup disconnects by owner token instead of room id only", () => {
    expect(src).toContain("websocket.disconnectIfOwner(wsOwnerIdRef.current)");
    expect(src).not.toContain("websocket.disconnectIfRoom(streamKey)");
  });
});

