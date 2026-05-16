console.log("DBE | Script file loaded!");

Hooks.on("renderDoDCharacterSheet", (app, html, data) => {
  if (app.actor?.type !== "character") return;

  const actor = app.actor;
  const f = actor.getFlag("dragonbane-extra-fields", "custom") || {};

  const $html = html instanceof jQuery ? html : $(html);

  const affinities = [
    "Blood", "Wood", "Bone", "Iron", "Fire",
    "Stone", "Darkness", "Light", "Chaos", "Order"
  ];

  // Roll d20 against the affinity value, matching Dragonbane's skill roll style
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
      <tr class="dbe-affinity-row">
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

  const boxHTML = `
    <div class="dbe-way-affinities" style="margin-top:8px;">
      <table style="width:100%;">
        <tbody>
          <tr class="sheet-table-header">
            <th class="text-header" colspan="2">Way Affinities</th>
          </tr>
          ${rowsHTML}
        </tbody>
      </table>
    </div>
  `;

  // Find the Weapon Skills header, go up to: table -> column div -> columns container div
  const weaponHeader = $html.find("th.text-header").filter(function() {
    return $(this).text().toLowerCase().includes("weapon");
  });

  // Two .parent() calls: first gets the column div, second gets the two-column container
  const columnsContainer = weaponHeader.closest("table").parent("div").parent("div");

  if (columnsContainer.length) {
    columnsContainer.after(boxHTML);
    console.log("DBE | Way Affinities inserted below the two-column block.");
  } else {
    const skillsTab = $html.find('[data-tab="skills"]').first();
    skillsTab.append(boxHTML);
    console.warn("DBE | Fallback used — appended to skills tab.");
  }

  // Save numeric value when it changes
  $html.find(".dbe-affinity-value").on("change", async (event) => {
    const key   = event.currentTarget.dataset.flag;
    const value = parseInt(event.currentTarget.value) || 0;
    await actor.setFlag("dragonbane-extra-fields", `custom.${key}`, value);
  });

  // Roll when the affinity name is clicked
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
