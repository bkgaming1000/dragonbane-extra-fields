console.log("DBE | Script file loaded!");

// Store scroll position across re-renders
let dbeScrollTop = 0;

Hooks.on("renderDoDCharacterSheet", (app, html, data) => {
  if (app.actor?.type !== "character") return;

  const actor = app.actor;
  const f = actor.getFlag("dragonbane-extra-fields", "custom") || {};

  const $html = html instanceof jQuery ? html : $(html);

  // Restore scroll position after re-render
  const $skillsTab = $html.find('[data-tab="skills"]').first();
  if (dbeScrollTop > 0) {
    $skillsTab.scrollTop(dbeScrollTop);
  }

  const affinities = [
    "Blood", "Wood", "Bone", "Iron", "Fire",
    "Stone", "Darkness", "Light", "Chaos", "Order"
  ];

  async function rollAffinity(name, value) {
    const roll = await new Roll("1d20").evaluate();
    const result = roll.total;
    const dragon = result === 1;
    const demon  = result === 20;
    const success = result <= value && !demon;

    let outcome;
    if (dragon)       outcome = "🐉 Dragon Roll! Critical Success!";
    else if (demon)   outcome = "😈 Demon Roll! Critical Failure!";
    else if (success) outcome = "✅ Success";
    else              outcome = "❌ Failure";

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<strong>${name} Way Affinity</strong> (${value})<br>${outcome}`
    });
  }

  const rowsHTML = affinities.map(name => {
    const key   = `affinity_${name.toLowerCase()}`;
    const value = f[key] ?? 0;
    return `
      <tr>
        <td style="padding:2px 4px; width:100%;">
          <a class="dbe-roll-affinity rollable"
             data-flag="${key}"
             data-name="${name}"
             style="cursor:pointer;">
            ${name}
          </a>
        </td>
        <td style="padding:2px 4px; text-align:right;">
          <input
            type="number"
            class="dbe-affinity-value"
            data-flag="${key}"
            value="${value}"
            min="0"
            max="99"
            style="width:44px; text-align:center;"
          />
        </td>
      </tr>
    `;
  }).join("");

  // Use the same table/header classes as Dragonbane's own skill tables
  const boxHTML = `
    <table class="dbe-way-affinities" style="width:100%; margin-top:8px;">
      <tbody>
        <tr class="sheet-table-header">
          <th class="text-header" colspan="2">Way Affinities</th>
        </tr>
        ${rowsHTML}
      </tbody>
    </table>
  `;

  // Find Weapon Skills table and insert directly after it,
  // staying inside its column div
  const weaponTable = $html.find("th.text-header").filter(function() {
    return $(this).text().toLowerCase().includes("weapon");
  }).closest("table");

  console.log("DBE | Weapon Skills table found:", weaponTable.length > 0);

  if (weaponTable.length) {
    weaponTable.after(boxHTML);
    console.log("DBE | Way Affinities inserted after Weapon Skills table.");
  } else {
    $skillsTab.append(boxHTML);
    console.warn("DBE | Fallback used — appended to skills tab.");
  }

  // Save numeric value — store scroll position first to survive re-render
  $html.find(".dbe-affinity-value").on("change", async (event) => {
    dbeScrollTop = $skillsTab.scrollTop();
    const key   = event.currentTarget.dataset.flag;
    const value = parseInt(event.currentTarget.value) || 0;
    await actor.setFlag("dragonbane-extra-fields", `custom.${key}`, value);
  });

  // Roll when name is clicked
  $html.find(".dbe-roll-affinity").on("click", async (event) => {
    event.preventDefault();
    const key   = event.currentTarget.dataset.flag;
    const name  = event.currentTarget.dataset.name;
    const value = parseInt(
      $html.find(`.dbe-affinity-value[data-flag="${key}"]`).val()
    ) || 0;
    await rollAffinity(name, value);
  });
});
