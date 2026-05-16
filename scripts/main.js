console.log("DBE | Script file loaded!");

let dbeScrollTop = 0;

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
    // Use the exact same template and dialog style as the system
    const dialogData = {
      banes: [],
      boons: [],
      fillerBanes: 0,
      fillerBoons: 0
    };

    const title  = `${name} Way Affinity`;
    const label  = game.i18n.localize("DoD.ui.dialog.skillRollLabel");

    // Render the system's own roll dialog template
    const content = await renderTemplate(
      "systems/dragonbane/templates/partials/roll-dialog.hbs",
      dialogData
    );

    // Use DialogV2.input() exactly as the system does
    const values = await foundry.applications.api.DialogV2.input({
      window: { title },
      content,
      ok: { label }
    });

    if (values === null) return; // user closed dialog

    // Process result exactly as DoDTest.processDialogOptions does
    const expanded    = foundry.utils.expandObject(values);
    const boons       = Object.entries(expanded.boons ?? {}).filter(([,v]) => v).map(([k]) => k);
    const banes       = Object.entries(expanded.banes ?? {}).filter(([,v]) => v).map(([k]) => k);
    const extraBoons  = Number(expanded.extraBoons ?? 0);
    const extraBanes  = Number(expanded.extraBanes ?? 0);

    const totalBoons = boons.length + extraBoons;
    const totalBanes = banes.length + extraBanes;

    // Format formula exactly as DoDTest.formatRollFormula does
    let formula;
    if (totalBanes > totalBoons)      formula = `${1 + totalBanes - totalBoons}d20kh`;
    else if (totalBoons > totalBanes) formula = `${1 + totalBoons - totalBanes}d20kl`;
    else                              formula = "d20";

    const roll    = await new Roll(formula).evaluate();
    const result  = roll.total;
    const dragon  = result === 1;
    const demon   = result === 20;
    const success = result <= value && !demon;

    // Use the system's own localisation strings for outcomes
    let outcome;
    if (dragon)       outcome = game.i18n.localize("DoD.roll.dragon");
    else if (demon)   outcome = game.i18n.localize("DoD.roll.demon");
    else if (success) outcome = game.i18n.localize("DoD.roll.success");
    else              outcome = game.i18n.localize("DoD.roll.failure");

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<strong>${name} Way Affinity</strong> (${value})<br>${outcome}`
    });
  }

  const rowsHTML = affinities.map(name => {
    const valueKey = `affinity_${name.toLowerCase()}`;
    const checkKey = `affinity_check_${name.toLowerCase()}`;
    const value    = f[valueKey] ?? 10;
    const checked  = f[checkKey] ? "checked" : "";
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
    const key       = event.currentTarget.dataset.flag;
    const value     = Math.max(0, Math.min(20, parseInt(event.currentTarget.value) || 0));
    const pairKey   = AFFINITY_PAIRS[key];
    const pairValue = 20 - value;

    $skillsTab.find(`.dbe-affinity-value[data-flag="${pairKey}"]`).val(pairValue);

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
