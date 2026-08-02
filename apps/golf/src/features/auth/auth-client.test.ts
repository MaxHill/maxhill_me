import { expect } from "@open-wc/testing";
import { AuthClient } from "./auth-client";

describe("AuthClient.getUserSubjects", () => {
  it("returns null when not authenticated", async () => {
    const client = new AuthClient();
    (client as unknown as { getToken: () => Promise<string | null> }).getToken = async () => null;

    const subjects = await client.getUserSubjects();
    expect(subjects).to.equal(null);
  });

  it("returns userID when verify returns user subject", async () => {
    const client = new AuthClient({
      verify: async () => ({
        subject: { type: "user", properties: { userID: "user-a" } },
      }),
    } as any);
    (client as unknown as { getToken: () => Promise<string | null> }).getToken = async () => "token";

    const subjects = await client.getUserSubjects();
    expect(subjects).to.deep.equal({ userID: "user-a" });
  });

  it("returns null for malformed subject payload", async () => {
    const client = new AuthClient({
      verify: async () => ({
        subject: { type: "user", properties: { sub: "abc" } },
      }),
    } as any);
    (client as unknown as { getToken: () => Promise<string | null> }).getToken = async () => "token";

    const subjects = await client.getUserSubjects();
    expect(subjects).to.equal(null);
  });
});
