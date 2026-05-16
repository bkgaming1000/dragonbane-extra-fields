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

const AFFINITY_NAMES = new Set([
  "blood", "wood", "bone", "iron", "fire",
  "stone", "darkness", "light", "chaos", "order"
]);

const DBE_POWER_EFFECT = "DBE: Power (WP Reduction)";

// ─── SHARED: Affinity roll dialog & roll ─────────────────────────────────────

async function rollVsAffinity(actor, title, affinityKey) {
  const f            = actor.getFlag("dragonbane-extra-fields", "custom") || {};
  const affinityVal  = f[`affinity_${affinityKey}`] ?? 10;
  const dialogData   = { banes: [], boons: [], fillerBanes: 0, fillerBoons: 0 };
  const label        = game.i18n.localize("DoD.ui.dialog.skillRollLabel");

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
  const boons      = Object.entries(expanded.boons  ?? {}).filter(([,v]) => v).map(([k]) => k);
  const banes      = Object.entries(expanded.banes  ?? {}).filter(([,v]) => v).map(([k]) => k);
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
  const success = result <= affinityVal && !demon;

  let outcome;
  if (dragon)       outcome = game.i18n.localize("DoD.roll.dragon");
  else if (demon)   outcome = game.i18n.localize("DoD.roll.demon");
  else if (success) outcome = game.i18n.localize("DoD.roll.success");
  else              outcome = game.i18n.localize("DoD.roll.failure");

  return { roll, outcome, affinityVal };
}

// ─── MAIN TAB: Power & Power Points ──────────────────────────────────────────

async function initMainTab(app, $html, actor) {
  const f = actor.getFlag("dragonbane-extra-fields", "custom") || {};
  const $mainTab = $html.find('section.tab[data-tab="main"]').first();
  if (!$mainTab.length) return;
  if ($mainTab.find(".dbe-power-row").length) return;

  const power     = f.power ?? 0;
  const ppCurrent = f.powerPointsCurrent ?? 0;

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
        <input
          class="dbe-pp-current"
          type="number"
          value="${ppCurrent}"
          min="0"
          max="${power}"
          title="Current Power Points"
          style="width:2em; text-align:center;"
        />
      </td>
    </tr>
  `);

  $mainTab.find(".dbe-power-input").on("change", async (event) => {
    const wil      = actor.system.attributes.wil.value ?? 0;
    const newPower = Math.max(0, Math.min(wil, parseInt(event.currentTarget.value) || 0));
    const ppCur    = Math.min(
      parseInt($mainTab.find(".dbe-pp-current").val()) || 0,
      newPower
    );

    const newWPMax   = Math.max(0, wil - newPower);
    const newWPValue = Math.min(actor.system.willPoints.value ?? 0, newWPMax);

    event.currentTarget.value = newPower;
    $mainTab.find(".dbe-pp-current").val(ppCur).attr("max", newPower);

    const existingEffect = actor.effects.find(e => e.name === DBE_POWER_EFFECT);

    if (newPower > 0) {
      const changes = [{
        key:      "system.willPoints.max",
        mode:     CONST.ACTIVE_EFFECT_MODES.ADD,
        value:    String(-newPower),
        priority: 20
      }];
      if (existingEffect) {
        await existingEffect.update({ changes });
      } else {
        await actor.createEmbeddedDocuments("ActiveEffect", [{
          name:     DBE_POWER_EFFECT,
          icon:     "icons/svg/downgrade.svg",
          origin:   actor.uuid,
          disabled: false,
          changes
        }]);
      }
    } else {
      if (existingEffect) await existingEffect.delete();
    }

    await actor.update({
      "flags.dragonbane-extra-fields.custom.power":              newPower,
      "flags.dragonbane-extra-fields.custom.powerPointsCurrent": ppCur,
      "system.willPoints.value":                                 newWPValue,
    });
  });

  $mainTab.find(".dbe-pp-current").on("change", async (event) => {
    const maxPP = actor.getFlag("dragonbane-extra-fields", "custom")?.power ?? 0;
    const newPP = Math.max(0, Math.min(maxPP, parseInt(event.currentTarget.value) || 0));
    event.currentTarget.value = newPP;
    await actor.setFlag("dragonbane-extra-fields", "custom.powerPointsCurrent", newPP);
  });
}

// ─── SPELL INTERCEPTION: roll vs Way Affinity ─────────────────────────────────

function initSpellInterception($html, actor) {
  // Find every element with a data-item-id and check if it's an affinity-linked spell
  $html.find("[data-item-id]").each(function() {
    const itemId = this.dataset.itemId;
    const item   = actor.items.get(itemId);
    if (!item || item.type !== "spell") return;

    const school = item.system.school?.toLowerCase().trim();
    if (!school || !AFFINITY_NAMES.has(school)) return;

    const affinityKey  = school;
    const affinityName = school.charAt(0).toUpperCase() + school.slice(1);

    // Helper to replace handlers on a specific element
    function interceptElement($el) {
      if (!$el.length) return;
      // Remove system's combined click+contextmenu handler, restore contextmenu ourselves
      $el.off("click contextmenu")
        .on("click", async (ev) => {
          ev.preventDefault();
          const result = await rollVsAffinity(
            actor,
            `${item.name} — ${affinityName} Way`,
            affinityKey
          );
          if (!result) return;
          await result.roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor:  `<strong>${item.name}</strong> — ${affinityName} Way (${result.affinityVal})<br>${result.outcome}`
          });
        })
        .on("contextmenu", (ev) => {
          ev.preventDefault();
          item.sheet.render(true);
        });
    }

    const $el = $(this);

    // Case 1: the element itself is the rollable link (main tab memorized spells)
    if ($el.hasClass("rollable-skill")) {
      interceptElement($el);
    }

    // Case 2: the element is a row containing rollable links (abilities tab)
    interceptElement($el.find(".rollable-skill"));
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
    await actor.setFlag(
      "dragonbane-extra-fields",
      `custom.${event.currentTarget.dataset.flag}`,
      event.currentTarget.checked
    );
  });

  $skillsTab.find(".dbe-roll-affinity").on("click", async (event) => {
    event.preventDefault();
    const key   = event.currentTarget.dataset.flag;
    const name  = event.currentTarget.dataset.name;
    const value = parseInt($skillsTab.find(`.dbe-affinity-value[data-flag="${key}"]`).val()) || 0;

    const affinityKey = key.replace("affinity_", "");
    const result = await rollVsAffinity(actor, `${name} Way Affinity`, affinityKey);
    if (!result) return;

    await result.roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor:  `<strong>${name} Way Affinity</strong> (${result.affinityVal})<br>${result.outcome}`
    });
  });
}

// ─── MAIN HOOK ───────────────────────────────────────────────────────────────

Hooks.on("renderDoDCharacterSheet", async (app, html, data) => {
  if (app.actor?.type !== "character") return;
  const actor = app.actor;
  const $html = html instanceof jQuery ? html : $(html);

  await initMainTab(app, $html, actor);
  initSpellInterception($html, actor);
  initSkillsTab(app, $html, actor);
});
