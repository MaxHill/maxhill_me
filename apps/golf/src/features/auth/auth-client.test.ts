import { expect } from "@open-wc/testing";
import { AuthClient } from "./auth-client";

describe("AuthClient.getCurrentUserID", () => {
  it("returns null when not authenticated", async () => {
    const client = new AuthClient();
    (client as unknown as { getToken: () => Promise<string | null> }).getToken = async () => null;

    const userID = await client.getCurrentUserID();
    expect(userID).to.equal(null);
  });

  it("returns userID claim when token payload contains userID", async () => {
    const client = new AuthClient();
    (client as unknown as { getToken: () => Promise<string | null> }).getToken = async () =>
      buildJwt({ userID: "user-a" });

    const userID = await client.getCurrentUserID();
    expect(userID).to.equal("user-a");
  });

  it("returns null for malformed or missing userID claim", async () => {
    const client = new AuthClient();
    (client as unknown as { getToken: () => Promise<string | null> }).getToken = async () =>
      buildJwt({ sub: "abc" });

    const userID = await client.getCurrentUserID();
    expect(userID).to.equal(null);
  });
});

function buildJwt(payload: Record<string, unknown>): string {
  const encodedHeader = toBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  return `${encodedHeader}.${encodedPayload}.`;
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
