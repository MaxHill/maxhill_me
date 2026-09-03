import { describe, expect, it } from "vitest";
import { sortClubs } from "./club-order";

describe("sortClubs", () => {
  it("orders clubs by type and then naturally by name", () => {
    const clubs = [
      { name: "Putter", clubType: "putter" },
      { name: "7", clubType: "iron" },
      { name: "Driver", clubType: "driver" },
      { name: "5", clubType: "iron" },
      { name: "3 wood", clubType: "wood" },
      { name: "60", clubType: "wedge" },
      { name: "4 hybrid", clubType: "hybrid" },
      { name: "10", clubType: "iron" },
    ];

    expect(sortClubs(clubs).map((club) => `${club.name} ${club.clubType}`)).toEqual([
      "Driver driver",
      "3 wood wood",
      "4 hybrid hybrid",
      "5 iron",
      "7 iron",
      "10 iron",
      "60 wedge",
      "Putter putter",
    ]);
  });
});
