const { resolveActionLLM } = require('./ollama');

const mockParty = [
    { id: 1, name: "Thalion", class: "Fighter", current_hp: 45, max_hp: 45 },
    { id: 2, name: "Gnomey", class: "Wizard", current_hp: 20, max_hp: 20 }
];

async function test() {
    const description = "Thalion uses Longsword on Gnomey. Effect: Melee Weapon Attack: +5 to hit, reach 5ft., one target. Hit: 1d8+3 slashing damage.";
    console.log("Testing Action:", description);

    console.log("Calling LLM...");
    const result = await resolveActionLLM(description, mockParty);

    console.log("LLM Result:");
    console.log(JSON.stringify(result, null, 2));
}

test();
