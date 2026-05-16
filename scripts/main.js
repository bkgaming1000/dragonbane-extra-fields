console.log("DBE | Script file loaded!");

let dbeScrollTop = 0;

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
    let boons = 0;
    let banes = 0;

    const confirmed = await foundry.applications.api.DialogV2.wait({
      window: { title: `${name} Way Affinity` },
      content: `
        <div style="padding:8px; display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="flex:1; font-weight:bold;">Boons</label>
            <input id="dbe-boons" type="number" value="0" min="0" max="6"
              style="width:60px; text-align:center;"/>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="flex:1; font-weight:bold;">Banes</label>
            <input id="dbe-banes" type="number" value="0" min="0" max="6"
              style="width:60px; text-align:center;"/>
          </div>
        </div>
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

  // Use the exact same classes as the system skill rows
  const rowsHTML = affinities.map(name => {
    const key   = `affinity_${name.toLowerCase()}`;
    const value = f[key] ?? 0;
    return `
      <tr class="sheet-table-data">
        <td class="checkbox-data icon-data"></td>
        <td class="number-data narrow">
          <input class="dbe-affinity-value"
            data-flag="${key}"
            type="number"
            value="${value}"
            min="0" max="99"
          />
        </td>
        <td class="skill-name text-data">
          <a class="dbe-roll-affinity rollable-skill"
             data-flag="${key}"
             data-name="${name}">
            ${name}
          </a>
        </td>
        <td></td>
      </tr>
    `;
  }).join("");

  // Exact same classes as core-skills and weapon-skills tables
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

  // Append inside the weapon skills column div — matching where secondary skills go
  const $weaponColDiv = $skillsTab.find("table.weapon-skills").parent();

  console.log("DBE | Weapon column div found:", $weaponColDiv.length > 0);

  if ($weaponColDiv.length) {
    $weaponColDiv.append(boxHTML);
    console.log("DBE | Way Affinities appended to weapon column.");
  } else {
    $skillsTab.find("div.flexrow").first().append(boxHTML);
    console.warn("DBE | Fallback: appended to flexrow.");
  }

  // Save value — store scroll position first to survive re-render
  $skillsTab.find(".dbe-affinity-value").on("change", async (event) => {
    dbeScrollTop = $skillsTab.scrollTop();
    const key   = event.currentTarget.dataset.flag;
    const value = parseInt(event.currentTarget.value) || 0;
    await actor.setFlag("dragonbane-extra-fields", `custom.${key}`, value);
  });

  // Roll on click
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
