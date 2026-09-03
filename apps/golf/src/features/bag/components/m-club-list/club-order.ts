const CLUB_TYPE_ORDER = ["driver", "wood", "hybrid", "iron", "wedge", "putter"];

export interface ClubOrderable {
  name: string;
  clubType: string;
}

function clubTypeRank(clubType: string): number {
  const rank = CLUB_TYPE_ORDER.indexOf(clubType);
  return rank === -1 ? CLUB_TYPE_ORDER.length : rank;
}

export function sortClubs<T extends ClubOrderable>(clubs: T[]): T[] {
  return [...clubs].sort((a, b) => {
    const typeOrder = clubTypeRank(a.clubType) - clubTypeRank(b.clubType);

    if (typeOrder !== 0) return typeOrder;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}
