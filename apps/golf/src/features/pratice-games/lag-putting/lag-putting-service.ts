import { SubscriptionCallbackHandler, Table } from "@maxhill/idb-distribute";
import { DBInterface } from "../../../db";
import { PracticeGameMetadata } from "../practice-game";

export const LagPuttingGameMetadata: PracticeGameMetadata = {
  source: "https://tournytt.se/landslaget/ovningar-tester",
  description:
    "Ett tävlingslikt test av längdkänsla på 8-22 meter med olika puttar hela tiden. Testet går också bra att använda på banan under till exempel ett inspelsvarv.",
  instructions:
    "18 puttar från 8 till 22 m. En putt per läge. Varje putt skall vara unik och slumpmässigt vald.Mått från mitten av hål till mitten av bollen. Görs testet vid inspel eller träningsspel, en putt per hål",
  purpose: "Scoretest för lagputt",
  equipment: "Putter, boll, måttband, tejp på putter vid 50 cm",
  pointSystem: `Hålad - 2 poäng (eagle)
0-0,5m -1 poäng (birdie)
0,5-1m 0 poäng (par)
1-2m 1 poäng (bogey)
2-3m 2 poäng (dubbelbogey)
+ 3m 3 poäng (trippelbogey)`,

  scoreComparison: `Snittscore herrar/pojkar
WORLD CLASS: -5,5
EUROPEAN TOUR: -2,9
CHALLENGE TOUR: -1,5
HCP +2: +0,2
HCP SCRATCH: +2,0
HCP 5: +6,3
HCP 10: +10,7

Snittscore damer/flickor
WORLD CLASS: +1,0
LET: +3,6
HCP +2: +5,8
HCP SCRATCH: +7,6
HCP 5: +11,9
HCP 10: +16,3

MAXSCORE: -36

REKORD: HERRAR -15 POÄNG JOHAN EDFORS 2011-12-01
DAMER -6 POÄNG, CHRISTINE HALLSTRÖM 2011-07-25
*SNITTSCORE FÖR TEST GJORDE PÅ BANA ÄR 4,5 POÄNG SÄMRE`,
};

type GameKey = string;

type ComparisonResultMen =
  | "WORLD CLASS: -5,5"
  | "EUROPEAN TOUR: -2,9"
  | "CHALLENGE TOUR: -1,5"
  | "HCP +2: +0,2"
  | "HCP SCRATCH: +2,0"
  | "HCP 5: +6,3"
  | "HCP 10: +10,7";

type ComparisonResultWomen =
  | "WORLD CLASS: +1,0"
  | "LET: +3,6"
  | "HCP +2: +5,8"
  | "HCP SCRATCH: +7,6"
  | "HCP 5: +11,9"
  | "HCP 10: +16,3";

export type PuttDistance = 8 | 10 | 12 | 14 | 18 | 22;
export type PuttOutcome = "holed" | "0-0.5m" | "0.5-1m" | "1-2m" | "2-3m" | "+3m";
export type PuttResult =
  | { outcome: "holed" }
  | { outcome: "0-0.5m" | "0.5-1m" | "1-2m" | "2-3m" | "+3m"; leave: "short" | "long" };

const FIXED_PUTT_SEQUENCE: readonly PuttDistance[] = [
  22,
  12,
  18,
  10,
  14,
  8, // First 6
  22,
  12,
  18, // 7-9 (halfway)
  10,
  14,
  8, // 10-12
  22,
  12,
  18,
  10,
  14,
  8, // Last 6
] as const;

function createPuttSequence(): Array<{ distance: PuttDistance; result: PuttResult | null }> {
  return FIXED_PUTT_SEQUENCE.map((distance) => ({
    distance,
    result: null,
  }));
}

export interface CreateLagPuttingGameInput {
  playerName: string;
  courseName: string;
  practiceAreaName: string;
}

export interface LagPuttingGame extends CreateLagPuttingGameInput {
  _key: GameKey;
  createdAt?: string;
  putts: Array<{ distance: PuttDistance; result: PuttResult | null }>;
}

const OUTCOME_POINTS: Record<PuttOutcome, number> = {
  "holed": -2,
  "0-0.5m": -1,
  "0.5-1m": 0,
  "1-2m": 1,
  "2-3m": 2,
  "+3m": 3,
};

export class LagPuttingGameService {
  table: Table;

  constructor(private db: DBInterface) {
    this.table = this.db.table("lag_putting_games");
  }

  subscribe(handler: SubscriptionCallbackHandler): () => void {
    return this.table.subscribe(handler);
  }

  // Data access
  async createGame(input: CreateLagPuttingGameInput): Promise<LagPuttingGame> {
    const game: LagPuttingGame = {
      ...input,
      _key: crypto.randomUUID(),
      createdAt: new Date().toString(),
      putts: createPuttSequence(),
    };

    // Validate
    if (game.putts.length !== 18) {
      throw new Error("Invalid putt sequence: must have exactly 18 putts");
    }

    await this.table.setRow(game._key, game);
    return game;
  }

  async listGames(): Promise<LagPuttingGame[]> {
    const games: LagPuttingGame[] = [];
    for await (const row of this.table.query()) {
      games.push(row as LagPuttingGame);
    }
    return games;
  }

  async getGame(gameKey: GameKey): Promise<LagPuttingGame | null> {
    const game = await this.table.get(gameKey);
    return game ? (game as LagPuttingGame) : null;
  }

  async updateGame(game: LagPuttingGame): Promise<void> {
    await this.table.setRow(game._key, game);
  }

  async recordPuttResult(
    gameKey: GameKey,
    puttIndex: number,
    result: PuttResult,
  ): Promise<void> {
    // Validation
    if (puttIndex < 0 || puttIndex >= 18) {
      throw new Error(`Invalid putt index: ${puttIndex}. Must be 0-17`);
    }

    const game = await this.getGame(gameKey);
    if (!game) {
      throw new Error(`Game not found: ${gameKey}`);
    }

    game.putts[puttIndex].result = result;
    await this.updateGame(game);
  }

  // Calculations
  getSkillLevel(
    _game: LagPuttingGame,
    _comparisonGroup: "men" | "women",
  ): ComparisonResultMen | ComparisonResultWomen | null {
    // TODO: Implement skill level comparison logic
    return null;
  }

  calculateOutScore(putts: Array<{ distance: PuttDistance; result: PuttResult | null }>): number {
    return this.calculateScore(putts.slice(0, 9));
  }

  calculateInScore(putts: Array<{ distance: PuttDistance; result: PuttResult | null }>): number {
    return this.calculateScore(putts.slice(9, 18));
  }

  calculateTotalScore(putts: Array<{ distance: PuttDistance; result: PuttResult | null }>): number {
    return this.calculateScore(putts);
  }

  calculateHoleScore(putts: { distance: PuttDistance; result: PuttResult | null }): number {
    return this.calculateScore([putts]);
  }

  // Utils
  private calculateScore(
    putts: Array<{ distance: PuttDistance; result: PuttResult | null }>,
  ): number {
    return putts.reduce((score, putt) => {
      if (putt.result === null) return score;
      return score + OUTCOME_POINTS[putt.result.outcome];
    }, 0);
  }
}
