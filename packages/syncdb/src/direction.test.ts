import { describe, expect, it } from "vitest";
import { asc, desc, resolveQueryArgs } from "./direction.ts";

describe("direction", () => {
  it("desc constant resolves to prev", () => {
    const result = resolveQueryArgs(desc);
    expect(result.idbDirection).toBe("prev");
    expect(result.condition).toEqual({ type: "all" });
  });

  it("asc constant resolves to next", () => {
    const result = resolveQueryArgs(asc);
    expect(result.idbDirection).toBe("next");
  });

  it("condition + desc resolves to prev", () => {
    const result = resolveQueryArgs({ type: "all" }, desc);
    expect(result.idbDirection).toBe("prev");
  });

  it("condition alone defaults to next", () => {
    const result = resolveQueryArgs({ type: "all" });
    expect(result.idbDirection).toBe("next");
  });
});
