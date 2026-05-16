console.log("DBE | Script file loaded!");

let dbeScrollTop = 0;

Hooks.on("renderDoDCharacterSheet", (app, html, data) => {
  if (app.actor?.type !== "character") return;

  const actor = app.actor;
  const f = actor.getFlag("dragonbane-extra-fields", "custom") || {};

  const $html = html instanceof jQuery ? html : $(html);

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

  // Sniff the colour scheme from an existing skill row so we match exactly
  const existingSkillRow = $html.find("tr.skill-item, tr.weapon-item, tbody tr").not(".sheet-table-header").first();
  const rowBg    = existingSkillRow.css("background-color") || "transparent";
  const rowColor = existingSkillRow.css("color") || "#f0e6d3";

  // Sniff the header style from an existing sheet-table-header
  const existingHeader = $html.find("tr.sheet-table-header").first();
  const headerBg     = existingHeader.css("background-color") || "#5a3e2b";
  const headerColor  = existingHeader.css("color") || "#f0e6d3";
  const headerBgImg  = existingHeader.css("background-image") || "none";

  const rowsHTML = affinities.map((name, i) => {
    const key   = `affinity_${name.toLowerCase()}`;
    const value = f[key] ?? 0;
    // Alternate row shading to match other tables
    const bg = i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.08)";
    return `
      <tr class="dbe-affinity-row" style="background:${bg};">
        <td style="padding:3px 6px; color:${rowColor}; width:100%;">
          <a class="dbe-roll-affinity rollable"
             data-flag="${key}"
             data-name="${name}"
             style="cursor:pointer; color:${rowColor}; text-decoration:none;">
            ${name}
          </a>
        </td>
        <td style="padding:3px 6px; text-align:right;">
          <input
            type="number"
            class="dbe-affinity-value"
            data-flag="${key}"
            value="${value}"
            min="0"
            max="99"
            style="
              width: 44px;
              text-align: center;
              color: ${rowColor};
              background: rgba(255,255,255,0.1);
              border: 1px solid rgba(255,255,255,0.25);
              border-radius: 3px;
              padding: 1px 2px;
            "
          />
        </td>
      </tr>
    `;
  }).join("");

  const boxHTML = `
    <table class="dbe-way-affinities" style="width:100%; margin-top:8px; border-collapse:collapse;">
      <tbody>
        <tr class="sheet-table-header" style="
          background-color: ${headerBg};
          background-image: ${headerBgImg};
          color: ${headerColor};
        ">
          <th class="text-header" colspan="2" style="
            color: ${headerColor};
            padding: 4px 6px;
            text-align: left;
            font-variant: small-caps;
            letter-spacing: 0.05em;
          ">Way Affinities</th>
        </tr>
        ${rowsHTML}
      </tbody>
    </table>
  `;

  const weaponTable = $html.find("th.text-header").filter(function() {
    return $(this).text().toLowerCase().includes("weapon");
  }).closest("table");

  if (weaponTable.length) {
    weaponTable.after(boxHTML);
  } else {
    $skillsTab.append(boxHTML);
    console.warn("DBE | Fallback used — appended to skills tab.");
  }

  $html.find(".dbe-affinity-value").on("change", async (event) => {
    dbeScrollTop = $skillsTab.scrollTop();
    const key   = event.currentTarget.dataset.flag;
    const value = parseInt(event.currentTarget.value) || 0;
    await actor.setFlag("dragonbane-extra-fields", `custom.${key}`, value);
  });

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
