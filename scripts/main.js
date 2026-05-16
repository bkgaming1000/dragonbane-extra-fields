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
    // Boon/bane dialog matching Dragonbane's own style
    const dialogResult = await new Promise((resolve) => {
      new Dialog({
        title: `${name} Way Affinity`,
        content: `
          <form style="padding: 8px;">
            <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
              <label style="flex:1;">Boons</label>
              <input type="number" name="boons" value="0" min="0" max="6"
                style="width:60px; text-align:center;"/>
            </div>
            <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
              <label style="flex:1;">Banes</label>
              <input type="number" name="banes" value="0" min="0" max="6"
                style="width:60px; text-align:center;"/>
            </div>
          </form>
        `,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: "Roll",
            callback: (html) => {
              const boons = parseInt(html.find('[name="boons"]').val()) || 0;
              const banes = parseInt(html.find('[name="banes"]').val()) || 0;
              resolve({ boons, banes });
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => resolve(null)
          }
        },
        default: "roll",
        close: () => resolve(null)
      }).render(true);
    });

    if (!dialogResult) return;

    const { boons, banes } = dialogResult;
    const net = boons - banes;

    let formula;
    if (net > 0)      formula = `${net + 1}d20kl`; // boons: keep lowest
    else if (net < 0) formula = `${Math.abs(net) + 1}d20kh`; // banes: keep highest
    else              formula = "1d20";

    const roll = await new Roll(formula).evaluate();
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
    if (net > 0)      flavorExtra = ` &mdash; ${boons} Boon${boons > 1 ? "s" : ""}`;
    else if (net < 0) flavorExtra = ` &mdash; ${banes} Bane${banes > 1 ? "s" : ""}`;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<strong>${name} Way Affinity</strong> (${value})${flavorExtra}<br>${outcome}`
    });
  }

  // Sniff the weapon skills table so we can copy its appearance exactly
  const weaponTable = $skillsTab.find("th.text-header").filter(function() {
    return $(this).text().toLowerCase().includes("weapon");
  }).closest("table").first();

  // Copy background styles from the weapon table and its parent div
  const wrapperDiv    = weaponTable.parent();
  const wrapperBg     = wrapperDiv.css("background-image") || "none";
  const wrapperBgCol  = wrapperDiv.css("background-color") || "transparent";
  const tableBg       = weaponTable.css("background-image") || "none";
  const tableBgCol    = weaponTable.css("background-color") || "transparent";
  const tableBorder   = weaponTable.css("border") || "none";
  const tableClass    = weaponTable.attr("class") || "";

  // Sniff header row styles
  const existingHeader  = $skillsTab.find("tr.sheet-table-header").first();
  const headerColor     = existingHeader.css("color") || "#f0e6d3";
  const headerBg        = existingHeader.css("background-color") || "#5a3e2b";
  const headerBgImg     = existingHeader.css("background-image") || "none";

  // Sniff a regular skill row for text colour
  const existingRow  = $skillsTab.find("tbody tr").not(".sheet-table-header").first();
  const rowColor     = existingRow.css("color") || "#2a1a0a";

  const rowsHTML = affinities.map((name, i) => {
    const key   = `affinity_${name.toLowerCase()}`;
    const value = f[key] ?? 0;
    const bg    = i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.06)";
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
              width: 44px;
              text-align: center;
              color: ${rowColor};
              background: rgba(255,255,255,0.15);
              border: 1px solid rgba(0,0,0,0.2);
              border-radius: 3px;
              padding: 1px 2px;
            "
          />
        </td>
      </tr>
    `;
  }).join("");

  // Wrap in same div structure as weapon table, copying its background
  const boxHTML = `
    <div class="dbe-way-affinities-wrapper" style="
      background-image: ${wrapperBg};
      background-color: ${wrapperBgCol};
      background-size: cover;
      margin-top: 8px;
    ">
      <table class="${tableClass} dbe-way-affinities" style="
        width: 100%;
        border-collapse: collapse;
        background-image: ${tableBg};
        background-color: ${tableBgCol};
        background-size: cover;
        border: ${tableBorder};
      ">
        <tbody>
          <tr class="sheet-table-header" style="
            background-image: ${headerBgImg};
            background-color: ${headerBg};
            color: ${headerColor};
          ">
            <th class="text-header" colspan="2" style="
              color: ${headerColor};
              padding: 4px 6px;
              text-align: left;
            ">Way Affinities</th>
          </tr>
          ${rowsHTML}
        </tbody>
      </table>
    </div>
  `;

  if (weaponTable.length) {
    weaponTable.parent().after(boxHTML);
    console.log("DBE | Way Affinities inserted.");
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
