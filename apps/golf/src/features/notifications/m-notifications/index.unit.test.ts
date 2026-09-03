import { describe, expect, it, vi } from "vitest";
import "./index";

const club = (name: string) => ({
  name,
  clubType: "iron",
  shotTypes: [],
});

describe("m-notifications", () => {
  it("shows club save messages and hides them after four seconds", () => {
    vi.useFakeTimers();
    const notifications = document.createElement("m-notifications");
    document.body.append(notifications);

    document.dispatchEvent(new CustomEvent("club-saved", {
      detail: { club: club("7"), mode: "edit", trigger: "autosave" },
      bubbles: true,
      composed: true,
    }));

    const message = notifications.shadowRoot!.querySelector(".message") as HTMLElement;
    expect(message.textContent).toBe("Club 7 iron saved");
    expect(message.hidden).toBe(false);
    expect(message.getAttribute("aria-live")).toBe("polite");

    vi.advanceTimersByTime(3999);
    expect(message.hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(message.hidden).toBe(true);

    notifications.remove();
    vi.useRealTimers();
  });

  it("replaces the message and restarts the timer", () => {
    vi.useFakeTimers();
    const notifications = document.createElement("m-notifications");
    document.body.append(notifications);

    document.dispatchEvent(new CustomEvent("club-saved", {
      detail: { club: club("6"), mode: "add", trigger: "submit" },
    }));
    vi.advanceTimersByTime(3000);
    document.dispatchEvent(new CustomEvent("club-saved", {
      detail: { club: club("5"), mode: "edit", trigger: "autosave" },
    }));

    const message = notifications.shadowRoot!.querySelector(".message") as HTMLElement;
    expect(message.textContent).toBe("Club 5 iron saved");
    vi.advanceTimersByTime(1000);
    expect(message.hidden).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(message.hidden).toBe(true);

    notifications.remove();
    vi.useRealTimers();
  });
});
