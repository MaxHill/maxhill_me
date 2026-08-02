import { expect } from "@open-wc/testing";
import { UserSettingsService } from "./user-settings-service";

describe("UserSettingsService database owner marker", () => {
  it("returns null when owner marker is missing", async () => {
    const service = new UserSettingsService(fakeDb());
    const owner = await service.getDatabaseOwnerUserID();
    expect(owner).to.equal(null);
  });

  it("persists and returns owner userID", async () => {
    const service = new UserSettingsService(fakeDb());

    await service.setDatabaseOwnerUserID("user-a");
    const owner = await service.getDatabaseOwnerUserID();

    expect(owner).to.equal("user-a");
  });

  it("clears owner marker when set to null", async () => {
    const service = new UserSettingsService(fakeDb());
    await service.setDatabaseOwnerUserID("user-a");

    await service.setDatabaseOwnerUserID(null);
    const owner = await service.getDatabaseOwnerUserID();

    expect(owner).to.equal(null);
  });
});

function fakeDb() {
  const rows = new Map<string, { value: unknown }>();
  return {
    table: () => ({
      get: async (key: string) => rows.get(key),
      setRow: async (key: string, value: { value: unknown }) => {
        rows.set(key, value);
      },
      deleteRow: async (key: string) => {
        rows.delete(key);
      },
    }),
  } as any;
}
