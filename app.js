/********************************
 * DATUM / FORMAT
 ********************************/
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function currentMonthISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function nextMonthISO(ym) {
  if (!ym || !ym.includes("-")) return currentMonthISO();
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return currentMonthISO();

  let ny = y;
  let nm = m + 1;
  if (nm === 13) {
    nm = 1;
    ny += 1;
  }
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}`;
}

function fmtDatum(iso) {
  if (!iso || !iso.includes("-")) return iso || "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
}

function fmtMonat(ym) {
  if (!ym || !ym.includes("-")) return ym || "";
  const [y, m] = ym.split("-");
  return `${m}.${y}`;
}

/********************************
 * GELD
 ********************************/
function euro(zahl) {
  return Number(zahl).toFixed(2) + " €";
}

function summe(liste) {
  return liste.reduce((sum, e) => sum + Number(e.betrag), 0);
}

/********************************
 * ID HELPERS
 ********************************/
function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ensureIds(arr) {
  let changed = false;
  const out = arr.map(x => {
    if (!x.id) {
      changed = true;
      return { ...x, id: newId() };
    }
    return x;
  });
  return { out, changed };
}

/********************************
 * VERSIONIERUNG FIXKOSTEN
 * - Änderungen können ab "diesem Monat" ODER "nächstem Monat" gelten
 * - Vergangenheit bleibt unverändert
 ********************************/
function ensureVersionFields(arr, defaultStartMonat) {
  let changed = false;
  const out = arr.map(x => {
    const nx = { ...x };
    if (!nx.id) { nx.id = newId(); changed = true; }
    if (!nx.baseId) { nx.baseId = nx.id; changed = true; }
    if (!nx.startMonat) { nx.startMonat = defaultStartMonat; changed = true; }
    if (typeof nx.deleted !== "boolean") nx.deleted = false;
    return nx;
  });
  return { out, changed };
}

function effectiveByMonth(versionedList, selectedMonth) {
  const map = new Map();
  for (const item of versionedList) {
    if (!item.startMonat) continue;
    if (item.startMonat <= selectedMonth) {
      const prev = map.get(item.baseId);
      if (!prev || prev.startMonat < item.startMonat) {
        map.set(item.baseId, item);
      }
    }
  }
  return Array.from(map.values()).filter(x => !x.deleted);
}

/********************************
 * MONATE (für "Gesamt gespart")
 ********************************/
function monthsInclusive(startYM, endYM) {
  if (!startYM || !endYM) return 0;
  const [sy, sm] = startYM.split("-").map(Number);
  const [ey, em] = endYM.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return 0;

  const start = sy * 12 + (sm - 1);
  const end = ey * 12 + (em - 1);
  const diff = end - start;
  return diff >= 0 ? diff + 1 : 0;
}

/********************************
 * UI: Zeile mit 🗑️ Button
 ********************************/
function makeRowWithDelete(mainText, onRowClick, onDeleteClick, extraNote) {
  const row = document.createElement("div");
  row.className = "list-item item-row";

  const left = document.createElement("div");
  left.className = "item-main";

  const title = document.createElement("div");
  title.textContent = mainText;
  left.appendChild(title);

  if (extraNote) {
    const note = document.createElement("div");
    note.className = "small";
    note.textContent = extraNote;
    left.appendChild(note);
  }

  const del = document.createElement("button");
  del.type = "button";
  del.className = "icon-btn";
  del.textContent = "🗑️";
  del.setAttribute("aria-label", "Löschen");

  row.addEventListener("click", () => onRowClick());
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    onDeleteClick();
  });

  row.appendChild(left);
  row.appendChild(del);
  return row;
}

/********************************
 * DEMO-DATEN (nur beim ersten Start)
 ********************************/
if (!localStorage.getItem("einnahmen")) {
  localStorage.setItem("einnahmen", JSON.stringify([
    { id: newId(), name: "Gehalt", betrag: 2200 },
    { id: newId(), name: "Nebenjob", betrag: 300 }
  ]));
}

// Fixkosten sind versioniert gespeichert
if (!localStorage.getItem("fixkosten")) {
  localStorage.setItem("fixkosten", JSON.stringify([
    { id: newId(), baseId: newId(), name: "Miete", betrag: 950, startMonat: "1900-01", deleted: false },
    { id: newId(), baseId: newId(), name: "Handy", betrag: 30, startMonat: "1900-01", deleted: false }
  ]));
}

if (!localStorage.getItem("sparen")) {
  localStorage.setItem("sparen", JSON.stringify([
    { id: newId(), name: "Notgroschen", betrag: 200, startMonat: currentMonthISO() }
  ]));
}

if (!localStorage.getItem("buchungen")) {
  localStorage.setItem("buchungen", JSON.stringify([
    { id: newId(), datum: todayISO(), betrag: -150, kategorie: "Essen", notiz: "Supermarkt" }
  ]));
}

if (!localStorage.getItem("selectedMonth")) {
  localStorage.setItem("selectedMonth", currentMonthISO());
}

/********************************
 * MONAT STEUERUNG
 ********************************/
function getSelectedMonth() {
  return localStorage.getItem("selectedMonth") || currentMonthISO();
}

function setSelectedMonth(ym) {
  localStorage.setItem("selectedMonth", ym);
  render();
}

function setToCurrentMonth() {
  const ym = currentMonthISO();
  const input = document.getElementById("monat");
  input.value = ym;
  setSelectedMonth(ym);
}

/********************************
 * EINNAHMEN
 ********************************/
function addEinnahme() {
  const name = prompt("Name der Einnahme:");
  if (!name) return;

  const betrag = Number(prompt("Betrag (€):"));
  if (isNaN(betrag)) return;

  const einnahmen = JSON.parse(localStorage.getItem("einnahmen")) || [];
  einnahmen.push({ id: newId(), name, betrag });

  localStorage.setItem("einnahmen", JSON.stringify(einnahmen));
  render();
}

function editEinnahmeById(id) {
  const einnahmen0 = JSON.parse(localStorage.getItem("einnahmen")) || [];
  const { out: einnahmen, changed } = ensureIds(einnahmen0);
  if (changed) localStorage.setItem("einnahmen", JSON.stringify(einnahmen));

  const index = einnahmen.findIndex(x => x.id === id);
  if (index < 0) return;

  const e = einnahmen[index];
  const neuerName = prompt("Name ändern:", e.name);
  if (neuerName === null) return;

  const neuerBetrag = Number(prompt("Betrag ändern (€):", e.betrag));
  if (isNaN(neuerBetrag)) return;

  if (confirm("Einnahme löschen?")) {
    einnahmen.splice(index, 1);
  } else {
    einnahmen[index] = { ...e, name: neuerName, betrag: neuerBetrag };
  }

  localStorage.setItem("einnahmen", JSON.stringify(einnahmen));
  render();
}

function deleteEinnahmeById(id) {
  const einnahmen0 = JSON.parse(localStorage.getItem("einnahmen")) || [];
  const { out: einnahmen, changed } = ensureIds(einnahmen0);
  if (changed) localStorage.setItem("einnahmen", JSON.stringify(einnahmen));

  const idx = einnahmen.findIndex(x => x.id === id);
  if (idx < 0) return;
  if (!confirm("Einnahme wirklich löschen?")) return;

  einnahmen.splice(idx, 1);
  localStorage.setItem("einnahmen", JSON.stringify(einnahmen));
  render();
}

/********************************
 * FIXKOSTEN (NEU: ab diesem Monat ODER ab nächstem Monat)
 ********************************/
function addFixkosten() {
  const selectedMonth = getSelectedMonth();
  const nextMonth = nextMonthISO(selectedMonth);

  const abNaechstem = confirm(
    `Fixkosten ab wann anlegen?\n\nOK = ab nächstem Monat (${fmtMonat(nextMonth)})\nAbbrechen = ab diesem Monat (${fmtMonat(selectedMonth)})`
  );
  const giltAb = abNaechstem ? nextMonth : selectedMonth;

  const name = prompt(`Name der Fixkosten (gilt ab ${fmtMonat(giltAb)}):`);
  if (!name) return;

  const betrag = Number(prompt("Betrag (€):"));
  if (isNaN(betrag)) return;

  const fixkosten0 = JSON.parse(localStorage.getItem("fixkosten")) || [];
  const migrated = ensureVersionFields(fixkosten0, "1900-01");
  const fixkosten = migrated.out;

  const baseId = newId();
  fixkosten.push({ id: newId(), baseId, name, betrag, startMonat: giltAb, deleted: false });

  localStorage.setItem("fixkosten", JSON.stringify(fixkosten));
  render();
}

function editFixkostenByBaseId(baseId) {
  const selectedMonth = getSelectedMonth();
  const nextMonth = nextMonthISO(selectedMonth);

  const abNaechstem = confirm(
    `Änderung ab wann?\n\nOK = ab nächstem Monat (${fmtMonat(nextMonth)})\nAbbrechen = ab diesem Monat (${fmtMonat(selectedMonth)})`
  );
  const giltAb = abNaechstem ? nextMonth : selectedMonth;

  const fixkosten0 = JSON.parse(localStorage.getItem("fixkosten")) || [];
  const migrated = ensureVersionFields(fixkosten0, "1900-01");
  const fixkosten = migrated.out;

  const effective = effectiveByMonth(fixkosten, selectedMonth);
  const current = effective.find(x => x.baseId === baseId);
  if (!current) return;

  const neuerName = prompt(`Name ändern (wirkt ab ${fmtMonat(giltAb)}):`, current.name);
  if (neuerName === null) return;

  const neuerBetrag = Number(prompt(`Betrag ändern (wirkt ab ${fmtMonat(giltAb)}):`, current.betrag));
  if (isNaN(neuerBetrag)) return;

  fixkosten.push({
    id: newId(),
    baseId,
    name: neuerName,
    betrag: neuerBetrag,
    startMonat: giltAb,
    deleted: false
  });

  localStorage.setItem("fixkosten", JSON.stringify(fixkosten));
  render();
}

function deleteFixkostenByBaseId(baseId) {
  const selectedMonth = getSelectedMonth();
  const nextMonth = nextMonthISO(selectedMonth);

  const abNaechstem = confirm(
    `Fixkosten ab wann löschen?\n\nOK = ab nächstem Monat (${fmtMonat(nextMonth)})\nAbbrechen = ab diesem Monat (${fmtMonat(selectedMonth)})`
  );
  const startMonat = abNaechstem ? nextMonth : selectedMonth;

  if (!confirm(`Wirklich löschen ab ${fmtMonat(startMonat)}?`)) return;

  const fixkosten0 = JSON.parse(localStorage.getItem("fixkosten")) || [];
  const migrated = ensureVersionFields(fixkosten0, "1900-01");
  const fixkosten = migrated.out;

  const effective = effectiveByMonth(fixkosten, selectedMonth);
  const current = effective.find(x => x.baseId === baseId);
  if (!current) return;

  fixkosten.push({
    id: newId(),
    baseId,
    name: current.name,
    betrag: current.betrag,
    startMonat,
    deleted: true
  });

  localStorage.setItem("fixkosten", JSON.stringify(fixkosten));
  render();
}

/********************************
 * SPARPLÄNE
 ********************************/
function addSparplan() {
  const name = prompt("Name des Sparplans:");
  if (!name) return;

  const betrag = Number(prompt("Monatlicher Betrag (€):"));
  if (isNaN(betrag)) return;

  const startMonat = prompt("Start-Monat (YYYY-MM):", getSelectedMonth());
  if (!startMonat) return;

  const sparen = JSON.parse(localStorage.getItem("sparen")) || [];
  sparen.push({ id: newId(), name, betrag, startMonat });

  localStorage.setItem("sparen", JSON.stringify(sparen));
  render();
}

function editSparplanById(id) {
  const sparen0 = JSON.parse(localStorage.getItem("sparen")) || [];
  const { out: sparen, changed } = ensureIds(sparen0);
  if (changed) localStorage.setItem("sparen", JSON.stringify(sparen));

  const index = sparen.findIndex(x => x.id === id);
  if (index < 0) return;

  const s = sparen[index];

  const neuerName = prompt("Name ändern:", s.name);
  if (neuerName === null) return;

  const neuerBetrag = Number(prompt("Monatlicher Betrag (€):", s.betrag));
  if (isNaN(neuerBetrag)) return;

  const neuerStart = prompt("Start-Monat (YYYY-MM):", s.startMonat || getSelectedMonth());
  if (neuerStart === null) return;

  if (confirm("Sparplan löschen?")) {
    sparen.splice(index, 1);
  } else {
    sparen[index] = { ...s, name: neuerName, betrag: neuerBetrag, startMonat: neuerStart || s.startMonat };
  }

  localStorage.setItem("sparen", JSON.stringify(sparen));
  render();
}

function deleteSparplanById(id) {
  const sparen0 = JSON.parse(localStorage.getItem("sparen")) || [];
  const { out: sparen, changed } = ensureIds(sparen0);
  if (changed) localStorage.setItem("sparen", JSON.stringify(sparen));

  const idx = sparen.findIndex(x => x.id === id);
  if (idx < 0) return;
  if (!confirm("Sparplan wirklich löschen?")) return;

  sparen.splice(idx, 1);
  localStorage.setItem("sparen", JSON.stringify(sparen));
  render();
}

/********************************
 * BUCHUNGEN
 ********************************/
function addBuchung() {
  const datum = prompt("Datum (YYYY-MM-DD):", todayISO());
  if (!datum) return;

  const betrag = Number(prompt("Betrag (€) — Ausgabe negativ, Einnahme positiv:", -10));
  if (isNaN(betrag)) return;

  const kategorie = prompt("Kategorie:", "Allgemein") || "Allgemein";
  const notiz = prompt("Notiz (optional):", "") || "";

  const buchungen = JSON.parse(localStorage.getItem("buchungen")) || [];
  buchungen.push({ id: newId(), datum, betrag, kategorie, notiz });

  localStorage.setItem("buchungen", JSON.stringify(buchungen));
  render();
}

function editBuchungById(id) {
  const buchungen0 = JSON.parse(localStorage.getItem("buchungen")) || [];
  const { out: buchungen, changed } = ensureIds(buchungen0);
  if (changed) localStorage.setItem("buchungen", JSON.stringify(buchungen));

  const index = buchungen.findIndex(x => x.id === id);
  if (index < 0) return;

  const b = buchungen[index];

  const neuesDatum = prompt("Datum (YYYY-MM-DD):", b.datum);
  if (neuesDatum === null) return;

  const neuerBetrag = Number(prompt("Betrag (€):", b.betrag));
  if (isNaN(neuerBetrag)) return;

  const neueKategorie = prompt("Kategorie:", b.kategorie);
  if (neueKategorie === null) return;

  const neueNotiz = prompt("Notiz:", b.notiz);
  if (neueNotiz === null) return;

  if (confirm("Buchung löschen?")) {
    buchungen.splice(index, 1);
  } else {
    buchungen[index] = {
      ...b,
      datum: neuesDatum,
      betrag: neuerBetrag,
      kategorie: neueKategorie || "Allgemein",
      notiz: neueNotiz || ""
    };
  }

  localStorage.setItem("buchungen", JSON.stringify(buchungen));
  render();
}

function deleteBuchungById(id) {
  const buchungen0 = JSON.parse(localStorage.getItem("buchungen")) || [];
  const { out: buchungen, changed } = ensureIds(buchungen0);
  if (changed) localStorage.setItem("buchungen", JSON.stringify(buchungen));

  const idx = buchungen.findIndex(x => x.id === id);
  if (idx < 0) return;
  if (!confirm("Buchung wirklich löschen?")) return;

  buchungen.splice(idx, 1);
  localStorage.setItem("buchungen", JSON.stringify(buchungen));
  render();
}

/********************************
 * RENDER
 ********************************/
function render() {
  const selectedMonth = getSelectedMonth();

  const einnahmen0 = JSON.parse(localStorage.getItem("einnahmen")) || [];
  const fixkosten0 = JSON.parse(localStorage.getItem("fixkosten")) || [];
  const sparen0 = JSON.parse(localStorage.getItem("sparen")) || [];
  const buchungen0 = JSON.parse(localStorage.getItem("buchungen")) || [];

  const eFix = ensureIds(einnahmen0);
  if (eFix.changed) localStorage.setItem("einnahmen", JSON.stringify(eFix.out));

  const fMig = ensureVersionFields(fixkosten0, "1900-01");
  if (fMig.changed) localStorage.setItem("fixkosten", JSON.stringify(fMig.out));

  const sFix = ensureIds(sparen0);
  if (sFix.changed) localStorage.setItem("sparen", JSON.stringify(sFix.out));

  const bFix = ensureIds(buchungen0);
  if (bFix.changed) localStorage.setItem("buchungen", JSON.stringify(bFix.out));

  const einnahmen = eFix.out;
  const fixkostenVersioned = fMig.out;
  const fixkostenEffektiv = effectiveByMonth(fixkostenVersioned, selectedMonth);
  const sparen = sFix.out;
  const buchungen = bFix.out;

  const monatInput = document.getElementById("monat");
  if (monatInput && monatInput.value !== selectedMonth) monatInput.value = selectedMonth;

  const monatHinweis = document.getElementById("monat-hinweis");
  if (monatHinweis) {
    const nextMonth = nextMonthISO(selectedMonth);
    monatHinweis.textContent =
      `Auswertung für ${fmtMonat(selectedMonth)} • Fixkosten können ab diesem oder ab ${fmtMonat(nextMonth)} geändert werden`;
  }

  const buchungenMonat = buchungen.filter(b => (b.datum || "").startsWith(selectedMonth));

  const einnahmenSumme = summe(einnahmen);
  const fixSumme = summe(fixkostenEffektiv);
  const sparSumme = summe(sparen);
  const buchungenSummeMonat = summe(buchungenMonat);

  const verfuegbarMonat = einnahmenSumme - fixSumme - sparSumme + buchungenSummeMonat;

  document.getElementById("einnahmen-summe").textContent = euro(einnahmenSumme);
  document.getElementById("fixkosten").textContent = euro(-fixSumme);
  document.getElementById("sparen").textContent = euro(-sparSumme);
  document.getElementById("buchungen-summe").textContent = euro(buchungenSummeMonat);
  document.getElementById("verfuegbar").textContent = euro(verfuegbarMonat);

  // Einnahmen Liste (mit 🗑️)
  const eListe = document.getElementById("einnahmen-liste");
  eListe.innerHTML = "";
  einnahmen.forEach((e) => {
    const row = makeRowWithDelete(
      `${e.name}: ${euro(e.betrag)}`,
      () => editEinnahmeById(e.id),
      () => deleteEinnahmeById(e.id),
      ""
    );
    eListe.appendChild(row);
  });

  // Fixkosten Liste (mit 🗑️)
  const fListe = document.getElementById("fixkosten-liste");
  fListe.innerHTML = "";
  fixkostenEffektiv.forEach((f) => {
    const row = makeRowWithDelete(
      `${f.name}: ${euro(-f.betrag)}`,
      () => editFixkostenByBaseId(f.baseId),
      () => deleteFixkostenByBaseId(f.baseId),
      ""
    );
    fListe.appendChild(row);
  });

  // Sparen Liste (mit 🗑️)
  const sListe = document.getElementById("sparen-liste");
  if (sListe) {
    sListe.innerHTML = "";
    sparen.forEach((s) => {
      const row = makeRowWithDelete(
        `${s.name}: ${euro(-s.betrag)} / Monat (Start ${fmtMonat(s.startMonat || selectedMonth)})`,
        () => editSparplanById(s.id),
        () => deleteSparplanById(s.id),
        ""
      );
      sListe.appendChild(row);
    });
  }

  // Gesamt gespart (falls vorhanden)
  const gesamtBox = document.getElementById("sparen-gesamt");
  if (gesamtBox) {
    gesamtBox.innerHTML = "";
    if (sparen.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "Noch keine Sparpläne angelegt.";
      gesamtBox.appendChild(empty);
    } else {
      sparen.forEach((s) => {
        const start = s.startMonat || selectedMonth;
        const months = monthsInclusive(start, selectedMonth);
        const total = Number(s.betrag) * months;

        const row = document.createElement("div");
        row.className = "total-item";
        row.textContent = `${s.name}: ${euro(total)}  (${months} Monat(e) × ${euro(s.betrag)})`;
        gesamtBox.appendChild(row);
      });
    }
  }

  // Buchungen Liste (mit 🗑️)
  const bListe = document.getElementById("buchungen-liste");
  bListe.innerHTML = "";

  const sortiert = [...buchungenMonat].sort((a, b) => (b.datum || "").localeCompare(a.datum || ""));
  if (sortiert.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "Keine Buchungen in diesem Monat.";
    bListe.appendChild(empty);
  } else {
    sortiert.forEach((b) => {
      const mainText = `${fmtDatum(b.datum)} • ${b.kategorie}: ${euro(b.betrag)}`;
      const row = makeRowWithDelete(
        mainText,
        () => editBuchungById(b.id),
        () => deleteBuchungById(b.id),
        b.notiz || ""
      );
      bListe.appendChild(row);
    });
  }
}

/********************************
 * START + MONTH INPUT LISTENER
 ********************************/
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("monat");
  if (input) {
    input.value = getSelectedMonth();
    input.addEventListener("change", () => {
      if (input.value) setSelectedMonth(input.value);
    });
  }
  render();
});
