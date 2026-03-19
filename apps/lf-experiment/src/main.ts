import { registerAll } from "@maxhill/components/register-all";
import { CRDTDatabase, Table, newDatabase } from "@maxhill/idb-distribute";
registerAll();

type ShotType = {
    club: string,
    name: string,
    description: string,
}

export class ShotTypeRepository {
    table: Table;
    constructor(private db: CRDTDatabase) {
        this.table = this.db.table("shot_types");
    }

    async addShotType(shot_type: ShotType) {
        await this.table.setRow(crypto.randomUUID(), shot_type);
    }
}

async function main() {
    const db = await newDatabase("user::testdb")
        .addTable("shot_types", {})
        .build()
        .open()

    const shot_type_repository = new ShotTypeRepository(db);


    await render(shot_type_repository);

    const add_shot_type_form = document.getElementById("add-shot-type-form") as HTMLFormElement;
    if (!add_shot_type_form) throw new Error("No form to add shot on page");

    add_shot_type_form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(add_shot_type_form);

        const name = formData.get("name")?.toString();
        const club = formData.get("club")?.toString();
        const description = formData.get("description")?.toString();

        if (!name || !club || !description) {
            return;
        }

        await shot_type_repository.addShotType({
            name, club, description
        });


        await render(shot_type_repository);

        add_shot_type_form.reset()
    })
}

async function render(shot_type_repository: ShotTypeRepository) {
    const shots_container = document.getElementById("shots");
    if (!shots_container) return;
    shots_container.innerHTML = "";

    const template = document.getElementById("shot-list-item-template");
    if (!template) return;

    for await (const shot_type of shot_type_repository.table.query()) {
        const clone = document.importNode(template.content, true);

        const name = clone.querySelector(".name");
        if (name) name.textContent = shot_type.name;

        const club = clone.querySelector(".club");
        if (club) club.textContent = shot_type.club;

        const description = clone.querySelector(".description");
        if (description) description.textContent = shot_type.description;

        shots_container?.appendChild(clone);
    }
}

main();
