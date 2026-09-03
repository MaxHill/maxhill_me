import { describe, expect, it } from "vitest";
import { ClubSavedEvent } from "./events";

const club = {
  name: "7 iron",
  clubType: "iron" as const,
  shotTypes: [{ _key: "stock", name: "Stock", description: "Full shot" }],
};

describe("ClubSavedEvent", () => {
  it("exposes the save mode and trigger to listeners", () => {
    const event = new ClubSavedEvent({
      key: "club-key",
      club,
      mode: "edit",
      trigger: "autosave",
    });

    expect(event.type).toBe("club-saved");
    expect(event.detail).toEqual({
      key: "club-key",
      club,
      mode: "edit",
      trigger: "autosave",
    });
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });
});
