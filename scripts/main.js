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
    // Use DialogV2 for V13 native look
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

    const roll   = await new Roll(formula).evaluate();
    const result = roll.total;
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

  // Find the weapon skills table
  const weaponTable = $skillsTab.find("th.text-header").filter(function() {
    return $(this).text().toLowerCase().includes("weapon");
  }).closest("table").first();

  // Copy classes from the weapon column wrapper div so we get the same parchment style
  const weaponColDiv   = weaponTable.parent();
  const weaponColClass = weaponColDiv.attr("class") || "";

  // The flex row contains both Core Skills and Weapon Skills columns
  // Going up one more level gets us outside it so we insert below both columns
  const flexRow = weaponColDiv.parent();

  // Sniff text colours from existing rows
  const existingHeader = $skillsTab.find("tr.sheet-table-header").first();
  const headerColor    = existingHeader.css("color") || "#f0e6d3";
  const existingRow    = $skillsTab.find("tbody tr").not(".sheet-table-header").first();
  const rowColor       = existingRow.css("color") || "#2a1a0a";

  const rowsHTML = affinities.map((name, i) => {
    const key   = `affinity_${name.toLowerCase()}`;
    const value = f[key] ?? 0;
    const bg    = i % 2 === 0 ? "rgba(0,0,0,0.03)" : "rgba(0,0,0,0.07)";
    return `
      <tr class="dbe-affinity-row" style="background:${bg};">
        <td style="padding:3px 6px; width:100%;">
          <a class="dbe-roll-affinity rollable"
             data-flag="${key}"
             data-name="${name}"
             style="cursor:pointer; color:${rowColor}; text-decoration:none;">
            ${name}
          </a>
        </td>
        <td style="padding:3px 6px; text-align:right; white-space:nowrap;">
          <input
            type="number"
            class="dbe-affinity-value"
            data-flag="${key}"
            value="${value}"
            min="0"
            max="99"
            style="
              width:44px;
              text-align:center;
              color:${rowColor};
              background:rgba(0,0,0,0.08);
              border:1px solid rgba(0,0,0,0.2);
              border-radius:3px;
              padding:1px 2px;
            "
          />
        </td>
      </tr>
    `;
  }).join("");

  // Wrap in a div with the same class as the weapon column so we get the parchment scroll
  const boxHTML = `
    <div class="dbe-way-affinities ${weaponColClass}" style="margin-top:8px; width:100%;">
      <table style="width:100%; border-collapse:collapse;">
        <tbody>
          <tr class="sheet-table-header">
            <th class="text-header" colspan="2" style="color:${headerColor}; padding:4px 6px; text-align:left;">
              Way Affinities
            </th>
          </tr>
          ${rowsHTML}
        </tbody>
      </table>
    </div>
  `;

  if (flexRow.length) {
    flexRow.after(boxHTML);
    console.log("DBE | Way Affinities inserted below flex row.");
  } else if (weaponTable.length) {
    weaponTable.parent().after(boxHTML);
    console.warn("DBE | Flex row not found, inserted after weapon column div.");
  } else {
    $skillsTab.append(boxHTML);
    console.warn("DBE | Fallback used.");
  }

  $skillsTab.find(".dbe-affinity-value").on("change", async (event) => {
    dbeScrollTop = $skillsTab.scrollTop();
    const key   = event.currentTarget.dataset.flag;
    const value = parseInt(event.currentTarget.value) || 0;
    await actor.setFlag("dragonbane-extra-fields", `custom.${key}`, value);
  });

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
