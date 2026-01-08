import { IDBRepository } from "./IDBRepository";
import { promisifyIDBRequest, txDone } from "./utils";

describe("IDBRepository", () => {
  let idbRepository: IDBRepository;

  beforeEach(async () => {
    // Clear and reinitialize to -1 (matching the database schema)
    if (idbRepository) {
      const clearTx = idbRepository.transaction("clientState", "readwrite");
      const store = clearTx.objectStore("clientState");
      await promisifyIDBRequest(store.clear());
      await txDone(clearTx);
    }

    idbRepository = new IDBRepository();
    await idbRepository.open("logicalClockTest");
  });

  it("should initialize with -1 version", async () => {
    const tx = idbRepository.transaction(["clientState"], "readonly");
    const version = await idbRepository.getVersion(tx);
    await txDone(tx);

    expect(version).toEqual(-1);
  });

  it("should throw when version is undefined", async () => {
    // Clear the version to make it undefined
    const clearTx = idbRepository.transaction("clientState", "readwrite");
    await promisifyIDBRequest(clearTx.objectStore("clientState").delete("logicalClock"));
    await txDone(clearTx);

    const tx = idbRepository.transaction("clientState", "readonly");
    await expect(idbRepository.getVersion(tx)).rejects.toThrow(
      "Version should never be undefined since it's initialized to -1",
    );
    await txDone(tx);
  });

  it("should throw when version goes below -1", async () => {
    const tx = idbRepository.transaction("clientState", "readwrite");
    await idbRepository.setVersion(tx, -2);

    await expect(idbRepository.getVersion(tx)).rejects.toThrow(
      "Version could never be less than initialized value -1",
    );
    await txDone(tx);
  });
});
