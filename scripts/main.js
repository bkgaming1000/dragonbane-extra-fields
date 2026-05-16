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

// ─── MAIN TAB: Power & Power Points ──────────────────────────────────────────

async function initMainTab(app, $html, actor) {
  const f = actor.getFlag("dragonbane-extra-fields", "custom") || {};
  const $mainTab = $html.find('section.tab[data-tab="main"]').first();
  if (!$mainTab.length) return;

  // Avoid double-injection
  if ($mainTab.find(".dbe-power-row").length) return;

  const power      = f.power ?? 0;
  const ppCurrent  = f.powerPointsCurrent ?? 0;

  // Append Power and Power Points rows to the derived-stat table
  // (the third one — damage bonuses & movement)
  const $statsTable = $mainTab.find("table.derived-stat").last();

  $statsTable.append(`
    <tr class="dbe-power-row">
      <th>Power</th>
      <td>
        <input
          class="dbe-power-input"
          type="number"
          value="${power}"
          min="0"
          style="width:2em; text-align:center;"
        />
      </td>
    </tr>
    <tr class="dbe-pp-row">
      <th>Power Points</th>
      <td>
        <a class="dbe-pp-current" style="cursor:pointer;" title="Left-click to spend, right-click to recover">${ppCurrent}</a>
        <span class="dbe-pp-separator"> / </span>
        <span class="dbe-pp-max">${power}</span>
      </td>
    </tr>
  `);

  // ── Save Power when changed ───────────────────────────────────────────────
  $mainTab.find(".dbe-power-input").on("change", async (event) => {
    const wil         = actor.system.attributes.wil.value ?? 0;
    const newPower    = Math.max(0, Math.min(wil, parseInt(event.currentTarget.value) || 0));
    const oldPower    = f.power ?? 0;

    // Clamp PP current to new power max
    const ppCur       = Math.min(f.powerPointsCurrent ?? 0, newPower);

    // WP: maintain current "damage" (gap between max and current)
    const oldWPBase   = actor.system.willPoints.base ?? actor.system.willPoints.max ?? wil;
    const oldWPValue  = actor.system.willPoints.value ?? oldWPBase;
    const wpDamage    = Math.max(0, oldWPBase - oldWPValue);
    const newWPBase   = Math.max(0, wil - newPower);
    const newWPValue  = Math.max(0, newWPBase - wpDamage);

    // Update DOM immediately for instant feedback
    event.currentTarget.value = newPower;
    $mainTab.find(".dbe-pp-max").text(newPower);
    $mainTab.find(".dbe-pp-current").text(ppCur);

    // Save flags and WP in one batch
    await Promise.all([
      actor.update({
        "flags.dragonbane-extra-fields.custom.power":              newPower,
        "flags.dragonbane-extra-fields.custom.powerPointsCurrent": ppCur,
        "system.willPoints.base":  newWPBase,
        "system.willPoints.value": newWPValue,
      })
    ]);
  });

  // ── Left-click: spend a Power Point ──────────────────────────────────────
  // ── Right-click: recover a Power Point ───────────────────────────────────
  $mainTab.find(".dbe-pp-current").on("click contextmenu", async (event) => {
    event.preventDefault();
    const currentPower = parseInt($mainTab.find(".dbe-power-input").val()) || 0;
    const curPP = f.powerPointsCurrent ?? (actor.getFlag("dragonbane-extra-fields", "custom") || {}).powerPointsCurrent ?? 0;

    let newPP;
    if (event.type === "click") {         // left click — spend
      if (curPP <= 0) return;
      newPP = curPP - 1;
    } else {                              // right click — recover
      if (curPP >= currentPower) return;
      newPP = curPP + 1;
    }

    $mainTab.find(".dbe-pp-current").text(newPP);
    await actor.setFlag("dragonbane-extra-fields", "custom.powerPointsCurrent", newPP);
  });
}

// ─── SKILLS TAB: Way Affinities ──────────────────────────────────────────────

function initSkillsTab(app, $html, actor) {
  const f = actor.getFlag("dragonbane-extra-fields", "custom") || {};
  const $skillsTab = $html.find('div.tab[data-tab="skills"]').first();
  if (!$skillsTab.length) return;

  if (dbeScrollTop > 0) {
    $skillsTab.scrollTop(dbeScrollTop);
  }

  if ($skillsTab.find(".dbe-way-affinities").length) return;

  const affinities = [
    "Blood", "Wood", "Bone", "Iron", "Fire",
    "Stone", "Darkness", "Light", "Chaos", "Order"
  ];

  async function rollAffinity(name, value) {
    const dialogData = { banes: [], boons: [], fillerBanes: 0, fillerBoons: 0 };
    const title  = `${name} Way Affinity`;
    const label  = game.i18n.localize("DoD.ui.dialog.skillRollLabel");
    const content = await renderTemplate(
      "systems/dragonbane/templates/partials/roll-dialog.hbs",
      dialogData
    );

    const values = await foundry.applications.api.DialogV2.input({
      window: { title },
      content,
      ok: { label }
    });

    if (values === null) return;

    const expanded   = foundry.utils.expandObject(values);
    const boons      = Object.entries(expanded.boons ?? {}).filter(([,v]) => v).map(([k]) => k);
    const banes      = Object.entries(expanded.banes ?? {}).filter(([,v]) => v).map(([k]) => k);
    const extraBoons = Number(expanded.extraBoons ?? 0);
    const extraBanes = Number(expanded.extraBanes ?? 0);

    const totalBoons = boons.length + extraBoons;
    const totalBanes = banes.length + extraBanes;

    let formula;
    if (totalBanes > totalBoons)      formula = `${1 + totalBanes - totalBoons}d20kh`;
    else if (totalBoons > totalBanes) formula = `${1 + totalBoons - totalBanes}d20kl`;
    else                              formula = "d20";

    const roll    = await new Roll(formula).evaluate();
    const result  = roll.total;
    const dragon  = result === 1;
    const demon   = result === 20;
    const success = result <= value && !demon;

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
          <input type="checkbox" class="dbe-affinity-check" data-flag="${checkKey}" ${checked} />
        </td>
        <td class="number-data narrow">
          <input class="dbe-affinity-value" data-flag="${valueKey}" type="number" value="${value}" min="0" max="20" />
        </td>
        <td class="skill-name text-data">
          <a class="dbe-roll-affinity rollable-skill" data-flag="${valueKey}" data-name="${name}">${name}</a>
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

  $skillsTab.find(".dbe-affinity-check").on("change", async (event) => {
    dbeScrollTop = $skillsTab.scrollTop();
    await actor.setFlag("dragonbane-extra-fields", `custom.${event.currentTarget.dataset.flag}`, event.currentTarget.checked);
  });

  $skillsTab.find(".dbe-roll-affinity").on("click", async (event) => {
    event.preventDefault();
    const key   = event.currentTarget.dataset.flag;
    const name  = event.currentTarget.dataset.name;
    const value = parseInt($skillsTab.find(`.dbe-affinity-value[data-flag="${key}"]`).val()) || 0;
    await rollAffinity(name, value);
  });
}

// ─── MAIN HOOK ───────────────────────────────────────────────────────────────

Hooks.on("renderDoDCharacterSheet", async (app, html, data) => {
  if (app.actor?.type !== "character") return;
  const actor = app.actor;
  const $html = html instanceof jQuery ? html : $(html);

  await initMainTab(app, $html, actor);
  initSkillsTab(app, $html, actor);
});
