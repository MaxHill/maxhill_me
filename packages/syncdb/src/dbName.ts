export const DB_NAME_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
export const DB_NAME_ERROR = "Invalid dbName: must match ^[A-Za-z0-9_-]{1,64}$";

export function isValidDbName(dbName: string): boolean {
  return DB_NAME_REGEX.test(dbName);
}

export function assertValidDbName(dbName: string): void {
  if (!isValidDbName(dbName)) {
    throw new Error(DB_NAME_ERROR);
  }
}
