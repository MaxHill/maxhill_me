export type OwnershipReconciliationOutcome =
  | "guest-noop"
  | "claimed"
  | "authenticated-match"
  | "authenticated-mismatch-reset";

export type OwnershipReconciliationContext<TContext> = {
  context: TContext;
  currentUserID: string | null;
  storedOwnerUserID: string | null;
  claimOwnerUserID: (context: TContext, userID: string) => Promise<void>;
  resetForNewOwner: (context: TContext, userID: string) => Promise<TContext>;
};

/**
 * Applies golf local DB ownership policy for the current app identity.
 *
 * Policy:
 * - Guest identity (`null`) never overwrites existing authenticated ownership.
 * - First authenticated identity claims ownership when no owner is stored.
 * - Same authenticated identity keeps the current DB.
 * - Different authenticated identity triggers reset before use.
 */
export async function reconcileDatabaseOwnership<TContext>(
  params: OwnershipReconciliationContext<TContext>,
): Promise<{ context: TContext; outcome: OwnershipReconciliationOutcome }> {
  const {
    context,
    currentUserID,
    storedOwnerUserID,
    claimOwnerUserID,
    resetForNewOwner,
  } = params;

  const normalizedStoredOwnerUserID = normalizeOwner(storedOwnerUserID);

  if (currentUserID === null) {
    return { context, outcome: "guest-noop" };
  }

  if (normalizedStoredOwnerUserID === null) {
    await claimOwnerUserID(context, currentUserID);
    return { context, outcome: "claimed" };
  }

  if (normalizedStoredOwnerUserID === currentUserID) {
    return { context, outcome: "authenticated-match" };
  }

  const resetContext = await resetForNewOwner(context, currentUserID);
  return { context: resetContext, outcome: "authenticated-mismatch-reset" };
}

function normalizeOwner(owner: string | null | undefined): string | null {
  if (typeof owner !== "string") return null;
  return owner.length > 0 ? owner : null;
}
