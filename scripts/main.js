Hooks.on("renderActorSheet", (app, html, data) => {
  if (app.actor.type !== "character") return;

  const actor = app.actor;
  const f = actor.getFlag("dragonbane-extra-fields", "custom") || {};

  const affinities = [
    "Blood", "Wood", "Bone", "Iron", "Fire",
    "Stone", "Darkness", "Light", "Chaos", "Order"
  ];

  // Build a row for each affinity
  const rowsHTML = affinities.map(name => {
    const key = `affinity_${name.toLowerCase()}`;
    const checked = f[key] ? "checked" : "";
    return `
      <li class="dbe-affinity-row" style="
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 2px 4px;
        list-style: none;
      ">
        <input
          type="checkbox"
          data-flag="${key}"
          ${checked}
          style="width:14px; height:14px; cursor:pointer; flex-shrink:0;"
        />
        <span style="font-size: 0.9em;">${name}</span>
      </li>
    `;
  }).join("");

  // Box styled to match Dragonbane's fieldset skill boxes
  const boxHTML = `
    <fieldset class="dbe-way-affinities">
      <legend>Way Affinities</legend>
      <ul style="margin:0; padding:0;">
        ${rowsHTML}
      </ul>
    </fieldset>
  `;

  // Find the Skills tab
  const skillsTab = html.find('.tab[data-tab="skills"]');

  // Find the Weapon Skills fieldset by scanning legend text
  const weaponSkillsBox = skillsTab.find("fieldset").filter(function () {
    return $(this).find("legend").text().toLowerCase().includes("weapon");
  }).last();

  if (weaponSkillsBox.length) {
    // Insert immediately after the Weapon Skills box
    weaponSkillsBox.after(boxHTML);
  } else {
    // Fallback: log a warning and append to the tab so you can see it appeared
    console.warn("Dragonbane Extra Fields | Could not find Weapon Skills box. Appending to skills tab instead.");
    skillsTab.append(boxHTML);
  }

  // Save each checkbox when clicked — flags only, never touches the actor's skill data
  html.find(".dbe-way-affinities input[type='checkbox']").on("change", async (event) => {
    const key = event.currentTarget.dataset.flag;
    const value = event.currentTarget.checked;
    await actor.setFlag("dragonbane-extra-fields", `custom.${key}`, value);
  });
});
