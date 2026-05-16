console.log("DBE | Script file loaded!");

let dbeScrollTop = 0;

// Pairs: changing one auto-sets the other to 20 - value
const AFFINITY_PAIRS = {
  "affinity_blood":    "affinity_stone",
  "affinity_stone":    "affinity_blood",
  "affinity_wood":     "affinity_iron",
  "affinity_iron":     "affinity_wood",
  "affinity_bone":     "affinity_fire",
  "affinity_fire":     "affinity_bone",
  "affinity_darkness": "affinity_light",
  "affinity_light":    "affinity_darkness",
  "affinity_chaos":    "affinity_order",
  "affinity_order":    "affinity_chaos",
};

Hooks.on("renderDoDCharacterSheet", (app, html, data) => {
  if (app.actor?.type !== "character") return;

  const actor = app.actor;
  const f = actor.getFlag("dragonbane-extra-fields", "custom") || {};

  const $html = html instanceof jQuery ? html : $(html);
  const $skillsTab = $html.find('div.tab[data-tab="skills"]').first();

  if (dbeScrollTop > 0) {
    $skillsTab.scrollTop(dbeScrollTop);
  }

  if ($skillsTab.find(".dbe-way-affinities").length) return;

  const affinities = [
    "Blood", "Wood", "Bone", "Iron", "Fire",
    "Stone", "Darkness", "Light", "Chaos", "Order"
  ];

  async function rollAffinity(name, value) {
    const selectOpts = [0,1,2,3,4,5,6]
      .map(n => `<option value="${n}">${n}</option>`)
      .join("");

    let boons = 0;
    let banes = 0;

    const confirmed = await foundry.applications.api.DialogV2.wait({
      window: { title: `${name} Way Affinity` },
      content: `
        <form class="standard-form">
          <div class="form-group">
            <label>Boons</label>
            <select id="dbe-boons">${selectOpts}</select>
          </div>
          <div class="form-group">
            <label>Banes</label>
            <select id="dbe-banes">${selectOpts}</select>
          </div>
        </form>
      `,
      buttons: [
        {
          action: "roll",
          label: "Roll",
          icon: "fas fa-dice-d20",
          default: true,
          callback: (event, button, dialog) => {
            boons = parseInt(dialog.querySelector("#dbe-boons").value) || 0;
            banes = parseInt(dialog.querySelector("#dbe-banes").value) || 0;
            return true;
          }
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: "fas fa-times"
        }
      ]
    });

    if (!confirmed || confirmed === "cancel") return;

    const net = boons - banes;
    let formula;
    if (net > 0)      formula = `${net + 1}d20kl`;
    else if (net < 0) formula = `${Math.abs(net) + 1}d20kh`;
    else              formula = "1d20";

    const roll    = await new Roll(formula).evaluate();
    const result  = roll.total;
    const dragon  = result === 1;
    const demon   = result === 20;
    const success = result <= value && !demon;

    let outcome;
    if (dragon)       outcome = "🐉 Dragon Roll! Critical Success!";
    else if (demon)   outcome = "😈 Demon Roll! Critical Failure!";
    else if (success) outcome = "✅ Success";
    else              outcome = "❌ Failure";

    let flavorExtra = "";
    if (net > 0)      flavorExtra = ` &mdash; ${boons} Boon${boons !== 1 ? "s" : ""}`;
    else if (net < 0) flavorExtra = ` &mdash; ${banes} Bane${banes !== 1 ? "s" : ""}`;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<strong>${name} Way Affinity</strong> (${value})${flavorExtra}<br>${outcome}`
    });
  }

  const rowsHTML = affinities.map(name => {
    const valueKey = `affinity_${name.toLowerCase()}`;
    const checkKey = `affinity_check_${name.toLowerCase()}`;
    // Default to 10 visually — only persisted once the player changes a value
    const value   = f[valueKey] ?? 10;
    const checked = f[checkKey] ? "checked" : "";
    return `
      <tr class="sheet-table-data">
        <td class="checkbox-data icon-data">
          <input
            type="checkbox"
            class="dbe-affinity-check"
            data-flag="${checkKey}"
            ${checked}
          />
        </td>
        <td class="number-data narrow">
          <input
            class="dbe-affinity-value"
            data-flag="${valueKey}"
            type="number"
            value="${value}"
            min="0"
            max="20"
          />
        </td>
        <td class="skill-name text-data">
          <a class="dbe-roll-affinity rollable-skill"
             data-flag="${valueKey}"
             data-name="${name}">
            ${name}
          </a>
        </td>
        <td></td>
      </tr>
    `;
  }).join("");

  const boxHTML = `
    <table class="sheet-table dbe-way-affinities item-list" style="margin-top: 8px;">
      <tr class="sheet-table-header">
        <th></th>
        <th class="number-header"></th>
        <th class="text-header">Way Affinities</th>
        <th></th>
      </tr>
      ${rowsHTML}
    </table>
  `;

  const $weaponColDiv = $skillsTab.find("table.weapon-skills").parent();

  if ($weaponColDiv.length) {
    $weaponColDiv.append(boxHTML);
  } else {
    $skillsTab.find("div.flexrow").first().append(boxHTML);
    console.warn("DBE | Fallback: appended to flexrow.");
  }

  // Save numeric value and auto-update paired affinity
  $skillsTab.find(".dbe-affinity-value").on("change", async (event) => {
    dbeScrollTop = $skillsTab.scrollTop();

    const key      = event.currentTarget.dataset.flag;
    const value    = Math.max(0, Math.min(20, parseInt(event.currentTarget.value) || 0));
    const pairKey  = AFFINITY_PAIRS[key];
    const pairValue = 20 - value;

    // Update partner input in DOM immediately for instant feedback
    $skillsTab
      .find(`.dbe-affinity-value[data-flag="${pairKey}"]`)
      .val(pairValue);

    // Save both in one update call — single re-render, no flicker
    await actor.update({
      [`flags.dragonbane-extra-fields.custom.${key}`]:     value,
      [`flags.dragonbane-extra-fields.custom.${pairKey}`]: pairValue,
    });
  });

  // Save checkbox
  $skillsTab.find(".dbe-affinity-check").on("change", async (event) => {
    dbeScrollTop = $skillsTab.scrollTop();
    const key   = event.currentTarget.dataset.flag;
    const value = event.currentTarget.checked;
    await actor.setFlag("dragonbane-extra-fields", `custom.${key}`, value);
  });

  // Roll on name click
  $skillsTab.find(".dbe-roll-affinity").on("click", async (event) => {
    event.preventDefault();
    const key   = event.currentTarget.dataset.flag;
    const name  = event.currentTarget.dataset.name;
    const value = parseInt(
      $skillsTab.find(`.dbe-affinity-value[data-flag="${key}"]`).val()
    ) || 0;
    await rollAffinity(name, value);
  });
});
