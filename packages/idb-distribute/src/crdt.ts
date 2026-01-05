interface TombstoneEntry {
  type: "tombstone";
  timestamp: number;
}

interface ActiveEntry<V> {
  type: "active";
  value: V;
  timestamp: number;
}

export type ORMapEntry<V> = ActiveEntry<V> | TombstoneEntry;

export interface ORMap<V> {
  entries: { [key: string]: ORMapEntry<V> };
}

export function ORMapMerge<V>(map1: ORMap<V>, map2: ORMap<V>): ORMap<V> {
  const entries: { [key: string]: ORMapEntry<V> } = {};

  // Merge entries from both maps
  for (const [key, value1] of Object.entries(map1.entries)) {
    const value2 = map2.entries[key];

    if (!value2) {
      entries[key] = value1;
      continue;
    }

    if (value1.timestamp > value2.timestamp) {
      entries[key] = value1;
    } else {
      entries[key] = value2;
    }
  }

  // Add entries only in map2
  for (const [key, value2] of Object.entries(map2.entries)) {
    if (!(key in map1.entries)) {
      entries[key] = value2;
    }
  }

  return { entries };
}
