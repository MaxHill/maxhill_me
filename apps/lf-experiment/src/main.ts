import { registerAll } from "@maxhill/components/register-all";
import { CRDTDatabase, newDatabase, Table } from "@maxhill/idb-distribute";
import { ShotTypeRepository } from "./shot_type_repository";
registerAll();

type Club = { name: string };
type Shot = {
  timestamp: Date;
  club_id: string;
  shot_type_id: string;
  distancs: number;
};

export class ClubRepository {
  table: Table;
  constructor(private db: CRDTDatabase) {
    this.table = this.db.table("clubs");
  }

  async add_club(club: Club) {
    await this.table.setRow(crypto.randomUUID(), club);
  }
  async remove_club(id: string) {
    await this.table.deleteRow(id);
  }
}

export class ShotRepository {
  table: Table;
  constructor(private db: CRDTDatabase) {
    this.table = this.db.table("shots");
  }

  async addShot(club_id: string, shot_type_id: string, distance: number) {
    await this.table.setRow(crypto.randomUUID(), {
      timestamp: Date.now(),
      club_id,
      shot_type_id,
      distance,
    });
  }
}

async function main() {
  const db = newDatabase("user::testdb")
    .addTable("shot_types", {})
    .addTable("clubs", {})
    .addTable("shots", {})
    .build();

  await db
    .open();

  const shot_type_repository = new ShotTypeRepository(db);
  const club_repository = new ClubRepository(db);
  // const shot_repository = new ShowRepository(db);

  await render(shot_type_repository, club_repository);

  //  Shot type form
  //  ------------------------------------------------------------------------
  const add_shot_type_form = document.getElementById("add-shot-type-form") as HTMLFormElement;
  if (!add_shot_type_form) throw new Error("No form to add shot on page");

  add_shot_type_form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(add_shot_type_form);

    const name = formData.get("name")?.toString();
    const description = formData.get("description")?.toString();

    if (!name || !description) {
      return;
    }

    await shot_type_repository.addShotType({
      name,
      description,
    });

    await render(shot_type_repository, club_repository);

    add_shot_type_form.reset();
  });

  //  Club form
  //  ------------------------------------------------------------------------
  const add_club_form = document.getElementById("add-club-form") as HTMLFormElement;
  if (!add_shot_type_form) throw new Error("No form to add club on page");

  add_club_form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(add_club_form);

    const name = formData.get("name")?.toString();
    console.log("club", name, formData);

    if (!name) return;
    await club_repository.add_club({ name });

    await render(shot_type_repository, club_repository);

    add_club_form.reset();
  });
}

async function render(
  shot_type_repository: ShotTypeRepository,
  club_repository: ClubRepository,
) {
  //  Render shot types
  //  ------------------------------------------------------------------------
  const shots_container = document.getElementById("shots");
  if (!shots_container) return;
  shots_container.innerHTML = "";

  const shot_type_template = document.getElementById(
    "shot-list-item-template",
  ) as HTMLTemplateElement;
  if (!shot_type_template) return;

  for await (const shot_type of shot_type_repository.table.query()) {
    const clone = document.importNode(shot_type_template.content, true);

    const name = clone.querySelector(".name");
    if (name) name.textContent = shot_type.name;

    const description = clone.querySelector(".description");
    if (description) description.textContent = shot_type.description;

    shots_container?.appendChild(clone);
  }

  //  Render clubs
  //  ------------------------------------------------------------------------
  const club_container = document.getElementById("clubs");
  if (!club_container) return;
  club_container.innerHTML = "";

  const club_template = document.getElementById("club-template") as HTMLTemplateElement;
  if (!club_template) return;

  for await (const club of club_repository.table.query()) {
    const clone = document.importNode(shot_type_template.content, true);

    const name = clone.querySelector(".name");
    if (name) name.textContent = club.name;

    const description = clone.querySelector(".description");
    if (description) description.textContent = club.description;

    club_container?.appendChild(clone);
  }
}

main();
