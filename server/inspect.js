const db = require('./db');
const rows = db.prepare("SELECT data_json FROM characters WHERE data_json IS NOT NULL LIMIT 4").all();
console.log("Looking at modifiers");
if (rows.length) {
    rows.forEach((r, i) => {
        const data = JSON.parse(r.data_json);
        console.log(`\n--- Character ${i} (Level ${data.level || '?'}) ---`);
        const mods = data.modifiers || {};
        let allMods = [];
        Object.values(mods).forEach(arr => {
            if (Array.isArray(arr)) allMods = allMods.concat(arr);
        });

        console.log("Saving throw proficiencies/adv:");
        console.log(allMods.filter(m => m.subType && m.subType.includes('saving')));

        console.log("Advantage on stuff:");
        console.log(allMods.filter(m => m.type === 'advantage'));

        console.log("Proficiency on stuff:");
        console.log(allMods.filter(m => m.type === 'proficiency'));
    });
}
