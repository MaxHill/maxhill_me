import { expect } from "@open-wc/testing";
import {
  reconcileDatabaseOwnership,
  type OwnershipReconciliationOutcome,
} from "./db-ownership";

type TestContext = {
  owner: string | null;
  claims: string[];
  resets: string[];
};

describe("reconcileDatabaseOwnership", () => {
  it("keeps authenticated ownership unchanged during guest sessions", async () => {
    const context: TestContext = { owner: "user-a", claims: [], resets: [] };

    const result = await reconcileDatabaseOwnership({
      context,
      currentUserID: null,
      getStoredOwnerUserID: async (ctx) => ctx.owner,
      claimOwnerUserID: async (ctx, userID) => {
        ctx.owner = userID;
        ctx.claims.push(userID);
      },
      resetForNewOwner: async (ctx, userID) => {
        ctx.resets.push(userID);
        return ctx;
      },
    });

    expectOutcome(result.outcome, "guest-noop");
    expect(context.owner).to.equal("user-a");
    expect(context.claims).to.deep.equal([]);
    expect(context.resets).to.deep.equal([]);
  });

  it("claims ownership for first authenticated login", async () => {
    const context: TestContext = { owner: null, claims: [], resets: [] };

    const result = await reconcileDatabaseOwnership({
      context,
      currentUserID: "user-a",
      getStoredOwnerUserID: async (ctx) => ctx.owner,
      claimOwnerUserID: async (ctx, userID) => {
        ctx.owner = userID;
        ctx.claims.push(userID);
      },
      resetForNewOwner: async (ctx, userID) => {
        ctx.resets.push(userID);
        return ctx;
      },
    });

    expectOutcome(result.outcome, "claimed");
    expect(context.owner).to.equal("user-a");
    expect(context.claims).to.deep.equal(["user-a"]);
    expect(context.resets).to.deep.equal([]);
  });

  it("does nothing for repeated startup of the same authenticated user", async () => {
    const context: TestContext = { owner: "user-a", claims: [], resets: [] };

    const result = await reconcileDatabaseOwnership({
      context,
      currentUserID: "user-a",
      getStoredOwnerUserID: async (ctx) => ctx.owner,
      claimOwnerUserID: async (ctx, userID) => {
        ctx.owner = userID;
        ctx.claims.push(userID);
      },
      resetForNewOwner: async (ctx, userID) => {
        ctx.resets.push(userID);
        return ctx;
      },
    });

    expectOutcome(result.outcome, "authenticated-match");
    expect(context.claims).to.deep.equal([]);
    expect(context.resets).to.deep.equal([]);
  });

  it("resets and reclaims ownership when authenticated user changes", async () => {
    const context: TestContext = { owner: "user-a", claims: [], resets: [] };

    const result = await reconcileDatabaseOwnership({
      context,
      currentUserID: "user-b",
      getStoredOwnerUserID: async (ctx) => ctx.owner,
      claimOwnerUserID: async (ctx, userID) => {
        ctx.owner = userID;
        ctx.claims.push(userID);
      },
      resetForNewOwner: async (ctx, userID) => {
        ctx.resets.push(userID);
        return { ...ctx, owner: userID };
      },
    });

    expectOutcome(result.outcome, "authenticated-mismatch-reset");
    expect(result.context.owner).to.equal("user-b");
    expect(context.claims).to.deep.equal([]);
    expect(context.resets).to.deep.equal(["user-b"]);
  });

  it("fails closed when reset cannot complete", async () => {
    const context: TestContext = { owner: "user-a", claims: [], resets: [] };

    let caught: unknown;
    try {
      await reconcileDatabaseOwnership({
        context,
        currentUserID: "user-b",
        getStoredOwnerUserID: async (ctx) => ctx.owner,
        claimOwnerUserID: async () => {
        },
        resetForNewOwner: async () => {
          throw new Error("delete blocked");
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(Error);
    expect((caught as Error).message).to.equal("delete blocked");
  });
});

function expectOutcome(
  actual: OwnershipReconciliationOutcome,
  expected: OwnershipReconciliationOutcome,
): void {
  expect(actual).to.equal(expected);
}
