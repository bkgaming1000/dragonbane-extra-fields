console.log("DBE | Script file loaded!");

Hooks.on("renderDoDCharacterSheet", (app, html, data) => {
  console.log("DBE | Hook fired.");

  if (app.actor?.type !== "character") return;

  const actor = app.actor;
  const f = actor.getFlag("dragonbane-extra-fields", "custom") || {};

  const $html = html instanceof jQuery ? html : $(html);

  const affinities = [
    "Blood", "Wood", "Bone", "Iron", "Fire",
    "Stone", "Darkness", "Light", "Chaos", "Order"
  ];

  const rowsHTML = affinities.map(name => {
    const key = `affinity_${name.toLowerCase()}`;
    const checked = f[key] ? "checked" : "";
    return `
      <tr class="dbe-affinity-row">
        <td style="padding: 2px 4px;">
          <input
            type="checkbox"
            data-flag="${key}"
            ${checked}
            style="width:14px; height:14px; cursor:pointer;"
          />
        </td>
        <td style="padding: 2px 4px;">${name}</td>
      </tr>
    `;
  }).join("");

  const boxHTML = `
    <div class="dbe-way-affinities" style="margin-top: 8px;">
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

  // Find the Weapon Skills header and walk up to its wrapping div
  const weaponHeader = $html.find("th.text-header").filter(function() {
    return $(this).text().toLowerCase().includes("weapon");
  });

  console.log("DBE | Weapon header found:", weaponHeader.length > 0, "| text:", weaponHeader.text().trim());

  const weaponSkillsBox = weaponHeader.closest("table").parent("div");
  console.log("DBE | Weapon Skills wrapper div found:", weaponSkillsBox.length > 0);

  if (weaponSkillsBox.length) {
    weaponSkillsBox.after(boxHTML);
    console.log("DBE | Way Affinities inserted after Weapon Skills.");
  } else {
    // Fallback: append to skills tab
    const skillsTab = $html.find('[data-tab="skills"]').first();
    skillsTab.append(boxHTML);
    console.warn("DBE | Fallback used — appended to skills tab.");
  }

  $html.find(".dbe-way-affinities input[type='checkbox']").on("change", async (event) => {
    const key = event.currentTarget.dataset.flag;
    const value = event.currentTarget.checked;
    await actor.setFlag("dragonbane-extra-fields", `custom.${key}`, value);
  });
});
