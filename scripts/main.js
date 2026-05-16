console.log("DBE | Script file loaded!");
Hooks.on("renderActorSheet", (app, html, data) => {
  console.log("DBE | Hook fired. Actor type:", app.actor?.type, "| html type:", html?.constructor?.name);

  if (app.actor?.type !== "character") return;

  const actor = app.actor;
  const f = actor.getFlag("dragonbane-extra-fields", "custom") || {};

  // V13 passes a raw HTMLElement; V12 passes a jQuery object. Normalise to jQuery.
  const $html = html instanceof jQuery ? html : $(html);

  const affinities = [
    "Blood", "Wood", "Bone", "Iron", "Fire",
    "Stone", "Darkness", "Light", "Chaos", "Order"
  ];

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

  const boxHTML = `
    <fieldset class="dbe-way-affinities">
      <legend>Way Affinities</legend>
      <ul style="margin:0; padding:0;">
        ${rowsHTML}
      </ul>
    </fieldset>
  `;

  // Log all fieldsets found so we can see what's available
  const allFieldsets = $html.find("fieldset");
  console.log("DBE | Fieldsets found:", allFieldsets.length);
  allFieldsets.each(function() {
    console.log("DBE |  -", $(this).find("legend").text().trim());
  });

  // Also log tab structure
  const allTabs = $html.find("[data-tab]");
  console.log("DBE | Tabs found:", allTabs.length);
  allTabs.each(function() {
    console.log("DBE |  - tab:", $(this).attr("data-tab"));
  });

  // Find the Skills tab
  const skillsTab = $html.find('[data-tab="skills"]');
  console.log("DBE | Skills tab found:", skillsTab.length > 0);

  // Find Weapon Skills fieldset
  const weaponSkillsBox = (skillsTab.length ? skillsTab : $html).find("fieldset").filter(function () {
    return $(this).find("legend").text().toLowerCase().includes("weapon");
  }).last();

  console.log("DBE | Weapon Skills box found:", weaponSkillsBox.length > 0);

  if (weaponSkillsBox.length) {
    weaponSkillsBox.after(boxHTML);
    console.log("DBE | Way Affinities box inserted after Weapon Skills.");
  } else {
    // Fallback: append to skills tab or whole sheet
    const target = skillsTab.length ? skillsTab : $html.find(".sheet-body");
    target.append(boxHTML);
    console.warn("DBE | Could not find Weapon Skills box — appended to fallback target.");
  }

  $html.find(".dbe-way-affinities input[type='checkbox']").on("change", async (event) => {
    const key = event.currentTarget.dataset.flag;
    const value = event.currentTarget.checked;
    await actor.setFlag("dragonbane-extra-fields", `custom.${key}`, value);
  });
});
