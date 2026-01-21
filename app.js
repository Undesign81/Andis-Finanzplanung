/* Finanzplan – Tool-freie Version (localStorage) */

const STORAGE_KEY = "finanzplan_v1";

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);

function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(()=>t.classList.add("hidden"), 1800);
}

function todayYMD(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function ymFromDate(ymd){
  return ymd.slice(0,7);
}
function ymNow(){
  return ymFromDate(todayYMD());
}
function monthLabelDE(ym){
  const [y,m] = ym.split("-").map(Number);
  const dt = new Date(y, m-1, 1);
  return dt.toLocaleDateString("de-DE", { month:"long", year:"numeric" });
}
function addMonths(ym, delta){
  const [y,m] = ym.split("-").map(Number);
  const dt = new Date(y, m-1, 1);
  dt.setMonth(dt.getMonth() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
}
function centsToEUR(c){
  return (c/100).toLocaleString("de-DE", { style:"currency", currency:"EUR" });
}
function eurToCents(str){
  // akzeptiert "12,34" oder "12.34" oder "12"
  const s = String(str).trim().replace(/\./g,"").replace(",",".");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
function uid(prefix){
  return `${prefix}_${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
}

/* ---------- Data Model ---------- */
function defaultState(){
  return {
    incomeMonth: ymNow(),
    fixedMonth: ymNow(),
    expensesMonth: ymNow(),
    savingsMonth: ymNow(),

    // Types/Categories
    fixedTypes: [
      {id:"ft_rent", name:"Miete"},
      {id:"ft_power", name:"Strom"},
      {id:"ft_net", name:"Internet/Handy"},
      {id:"ft_ins", name:"Versicherung"},
      {id:"ft_other", name:"Sonstiges"},
    ],
    expenseCategories: [
      {id:"ec_food", name:"Lebensmittel"},
      {id:"ec_fun", name:"Freizeit"},
      {id:"ec_drug", name:"Drogerie"},
      {id:"ec_fuel", name:"Tanken"},
      {id:"ec_other", name:"Sonstiges"},
    ],

    // Entries
    incomes: [],      // {id,date,month,amountCents,type,note?}
    fixedCosts: [],   // {id,date,month,amountCents,typeId,note?}
    expenses: [],     // {id,date,month,amountCents,categoryId,note?}

    // Savings
    savingsPlans: [],   // {id,name,targetCents?,isArchived}
    savingsRates: [],   // {id,planId,month,amountCents}
    savingsMoves: [],   // {id,planId,date,month,amountCents,type:'deposit'|'withdraw'}
  };
}

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return defaultState();
  try{
    const st = JSON.parse(raw);
    // minimal migration safety
    return Object.assign(defaultState(), st);
  }catch{
    return defaultState();
  }
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetAll(){
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  saveState();
  renderAll();
  toast("Zurückgesetzt");
}

let state = loadState();

/* ---------- Modal ---------- */
function openModal({title, bodyHTML, actions=[]}){
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = bodyHTML;
  const act = $("modalActions");
  act.innerHTML = "";
  actions.forEach(a=>{
    const btn = document.createElement("button");
    btn.className = a.className || "btn btnSmall";
    btn.textContent = a.text;
    btn.type = "button";
    btn.onclick = async ()=> {
      if(a.onClick) await a.onClick();
    };
    act.appendChild(btn);
  });
  $("modalBackdrop").classList.remove("hidden");
}
function closeModal(){
  $("modalBackdrop").classList.add("hidden");
  $("modalBody").innerHTML = "";
  $("modalActions").innerHTML = "";
}
$("modalClose").onclick = closeModal;
$("modalBackdrop").addEventListener("click", (e)=>{
  if(e.target === $("modalBackdrop")) closeModal();
});

/* ---------- Navigation ---------- */
const screens = ["home","income","fixed","expenses","savings"];

function setPageTitle(title, sub){
  $("pageTitle").textContent = title;
  $("pageSub").textContent = sub || "Lokal • EUR";
}

function showScreen(name){
  screens.forEach(s=>{
    const el = $(`screen-${s}`);
    el.classList.toggle("active", s===name);
  });
}

function go(route){
  location.hash = `#/${route}`;
}

$("btnHome").onclick = ()=>go("");

window.addEventListener("hashchange", renderRoute);

/* ---------- Calculations ---------- */
function sumIncome(month){
  return state.incomes.filter(x=>x.month===month).reduce((a,x)=>a+x.amountCents,0);
}
function sumFixed(month){
  return state.fixedCosts.filter(x=>x.month===month).reduce((a,x)=>a+x.amountCents,0);
}
function sumExpenses(month){
  return state.expenses.filter(x=>x.month===month).reduce((a,x)=>a+x.amountCents,0);
}
function sumDeposits(month){
  return state.savingsMoves
    .filter(m=>m.month===month && m.type==="deposit")
    .reduce((a,m)=>a+m.amountCents,0);
}
function availableBudget(month){
  return sumIncome(month) - sumFixed(month) - sumExpenses(month) - sumDeposits(month);
}
function savingsTotalsByPlan(){
  const activePlans = state.savingsPlans.filter(p=>!p.isArchived);
  return activePlans.map(p=>{
    const total = state.savingsMoves
      .filter(m=>m.planId===p.id)
      .reduce((a,m)=>a + (m.type==="deposit" ? m.amountCents : -m.amountCents), 0);
    return {planId:p.id, name:p.name, totalCents:total};
  });
}
function getRate(planId, month){
  return state.savingsRates.find(r=>r.planId===planId && r.month===month) || null;
}
function ensureRatesCopiedForMonth(month){
  // Kopiert Sparraten aus Vormonat, wenn für diesen Monat noch keine Raten existieren
  const activePlans = state.savingsPlans.filter(p=>!p.isArchived);
  const hasAny = state.savingsRates.some(r=>r.month===month && activePlans.some(p=>p.id===r.planId));
  if(hasAny) return;

  const prev = addMonths(month, -1);
  const prevRates = state.savingsRates.filter(r=>r.month===prev);

  activePlans.forEach(p=>{
    const pr = prevRates.find(r=>r.planId===p.id);
    if(pr){
      state.savingsRates.push({
        id: uid("sr"),
        planId: p.id,
        month,
        amountCents: pr.amountCents
      });
    } else {
      // kein Vorwert -> Rate 0 anlegen? lieber nicht. Nutzer legt bei Bedarf an.
    }
  });
  saveState();
}
function ensureFixedCopiedForMonth(month){
  // Fixkosten aus Vormonat übernehmen – aber nur, wenn Monat noch keine Fixkosten hat
  const hasAny = state.fixedCosts.some(x=>x.month===month);
  if(hasAny) return false;
  const prev = addMonths(month, -1);
  const prevItems = state.fixedCosts.filter(x=>x.month===prev);
  if(prevItems.length===0) return false;

  const date = `${month}-01`; // immer 01.
  prevItems.forEach(x=>{
    state.fixedCosts.push({
      id: uid("fix"),
      date,
      month,
      amountCents: x.amountCents,
      typeId: x.typeId,
      note: x.note || ""
    });
  });
  saveState();
  return true;
}

/* ---------- Render: Home ---------- */
function renderHome(){
  const month = ymNow(); // immer aktueller Monat
  setPageTitle("Finanzplan", `${monthLabelDE(month)} • Aktueller Monat`);
  showScreen("home");

  const avail = availableBudget(month);
  const totals = savingsTotalsByPlan();

  const html = `
    <div class="list">
      <div class="card">
        <div class="sub" style="margin:0">Noch verfügbares Budget</div>
        <div class="bigValue">${centsToEUR(avail)}</div>
        <div class="kv"><span>Einnahmen</span><span>${centsToEUR(sumIncome(month))}</span></div>
        <div class="kv"><span>Fixe Kosten</span><span>${centsToEUR(sumFixed(month))}</span></div>
        <div class="kv"><span>Sonstige Ausgaben</span><span>${centsToEUR(sumExpenses(month))}</span></div>
        <div class="kv"><span>Eingezahlt</span><span>${centsToEUR(sumDeposits(month))}</span></div>
      </div>

      <div class="card">
        <div class="row">
          <div class="h2">Sparpläne</div>
          <span class="pill">Gesamtsummen</span>
        </div>
        <div class="hr"></div>
        ${
          totals.length===0
            ? `<div class="muted">Noch keine Sparpläne angelegt.</div>`
            : totals.map(t=>`
              <div class="row" style="margin:10px 0">
                <div class="itemTitle">${escapeHtml(t.name)}</div>
                <div class="itemTitle">${centsToEUR(t.totalCents)}</div>
              </div>
            `).join("")
        }
      </div>

      <button class="btn btnPrimary" id="goSavings">Sparpläne</button>
      <button class="btn" id="goIncome">Einnahmen</button>
      <button class="btn" id="goFixed">Fixe Kosten</button>
      <button class="btn" id="goExpenses">Sonstige Ausgaben</button>
      <button class="btn btnDanger" id="doReset">App komplett zurücksetzen</button>
    </div>
  `;
  $("screen-home").innerHTML = html;

  $("goSavings").onclick = ()=>go("savings");
  $("goIncome").onclick = ()=>go("income");
  $("goFixed").onclick = ()=>go("fixed");
  $("goExpenses").onclick = ()=>go("expenses");
  $("doReset").onclick = async ()=>{
    openModal({
      title: "App zurücksetzen",
      bodyHTML: `
        <div class="muted">Wirklich alles löschen? Das kann nicht rückgängig gemacht werden.</div>
        <div class="field">
          <label>Zum Bestätigen tippe: <b>LÖSCHEN</b></label>
          <input id="resetWord" placeholder="LÖSCHEN" />
        </div>
      `,
      actions: [
        { text: "Abbrechen", className:"btn btnSmall", onClick: ()=>closeModal() },
        { text: "Löschen", className:"btn btnDanger", onClick: ()=>{
            const v = ($("resetWord").value||"").trim().toUpperCase();
            if(v!=="LÖSCHEN"){ toast("Bitte LÖSCHEN tippen"); return; }
            closeModal(); resetAll();
          }
        }
      ]
    });
  };
}

/* ---------- Render: Month Header ---------- */
function renderMonthHeader(current, onPrev, onNext){
  return `
    <div class="card">
      <div class="row">
        <button class="iconBtn" id="mPrev" type="button">◀</button>
        <div style="text-align:center">
          <div class="itemTitle">${monthLabelDE(current)}</div>
          <div class="itemSub">Monat</div>
        </div>
        <button class="iconBtn" id="mNext" type="button">▶</button>
      </div>
    </div>
  `;
}

/* ---------- Render: Income ---------- */
function renderIncome(){
  const month = state.incomeMonth;
  setPageTitle("Einnahmen", `${monthLabelDE(month)} • Lohn/Kindergeld/Nebenjob/Sonstiges`);
  showScreen("income");

  const items = state.incomes
    .filter(x=>x.month===month)
    .sort((a,b)=> b.date.localeCompare(a.date));

  const sum = items.reduce((a,x)=>a+x.amountCents,0);

  const html = `
    <div class="list">
      ${renderMonthHeader(month)}
      <div class="card">
        <div class="row">
          <div class="itemTitle">Summe Einnahmen</div>
          <div class="itemTitle">${centsToEUR(sum)}</div>
        </div>
      </div>

      <button class="btn btnPrimary" id="addIncome">+ Einnahme hinzufügen</button>

      <div class="card">
        <div class="itemTitle">Liste</div>
        <div class="hr"></div>
        ${
          items.length===0 ? `<div class="muted">Keine Einnahmen in diesem Monat.</div>` :
          items.map(x=>`
            <div class="row" style="margin:12px 0">
              <div>
                <div class="itemTitle">${escapeHtml(x.type)}</div>
                <div class="itemSub">${escapeHtml(x.date)} • ${escapeHtml(x.note||"")}</div>
              </div>
              <div style="text-align:right">
                <div class="itemTitle">${centsToEUR(x.amountCents)}</div>
                <button class="btn btnSmall" data-act="incomeMenu" data-id="${x.id}" type="button">⋯</button>
              </div>
            </div>
          `).join("")
        }
      </div>
    </div>
  `;
  $("screen-income").innerHTML = html;

  $("mPrev").onclick = ()=>{ state.incomeMonth = addMonths(state.incomeMonth,-1); saveState(); renderIncome(); };
  $("mNext").onclick = ()=>{ state.incomeMonth = addMonths(state.incomeMonth, 1); saveState(); renderIncome(); };

  $("addIncome").onclick = ()=>openIncomeForm(null);

  document.querySelectorAll('[data-act="incomeMenu"]').forEach(btn=>{
    btn.onclick = ()=>openIncomeMenu(btn.getAttribute("data-id"));
  });
}

function openIncomeForm(id){
  const isEdit = !!id;
  const item = isEdit ? state.incomes.find(x=>x.id===id) : null;
  const dateDefault = isEdit ? item.date : `${state.incomeMonth}-01`;
  const typeDefault = isEdit ? item.type : "Lohn";
  const amountDefault = isEdit ? (item.amountCents/100).toLocaleString("de-DE") : "";
  const noteDefault = isEdit ? (item.note||"") : "";

  openModal({
    title: isEdit ? "Einnahme bearbeiten" : "Einnahme hinzufügen",
    bodyHTML: `
      <div class="field">
        <label>Art</label>
        <select id="incType">
          ${["Lohn","Kindergeld","Nebenjob","Sonstiges"].map(t=>`<option ${t===typeDefault?"selected":""}>${t}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Betrag (€)</label>
        <input id="incAmount" inputmode="decimal" placeholder="z.B. 2500,00" value="${escapeAttr(amountDefault)}"/>
      </div>
      <div class="field">
        <label>Datum</label>
        <input id="incDate" type="date" value="${escapeAttr(dateDefault)}"/>
      </div>
      <div class="field">
        <label>Notiz (optional)</label>
        <input id="incNote" placeholder="optional" value="${escapeAttr(noteDefault)}"/>
      </div>
    `,
    actions: [
      { text:"Abbrechen", className:"btn btnSmall", onClick: ()=>closeModal() },
      { text:"Speichern", className:"btn btnPrimary", onClick: ()=>{
          const cents = eurToCents($("incAmount").value);
          if(cents===null || cents<=0){ toast("Ungültiger Betrag"); return; }
          const date = $("incDate").value || todayYMD();
          const month = ymFromDate(date);
          const type = $("incType").value;
          const note = $("incNote").value || "";

          if(isEdit){
            Object.assign(item, {date, month, type, amountCents:cents, note});
          }else{
            state.incomes.push({ id: uid("inc"), date, month, type, amountCents:cents, note });
          }
          // Wenn man im Formular ein anderes Datum wählt, springt Seite automatisch auf diesen Monat? -> nein, bleibt beim gewählten Monat.
          saveState();
          closeModal();
          renderIncome();
          toast("Gespeichert");
        }
      }
    ]
  });
}

function openIncomeMenu(id){
  openModal({
    title: "Aktionen",
    bodyHTML: `<div class="muted">Einnahme bearbeiten oder löschen.</div>`,
    actions: [
      { text:"Bearbeiten", className:"btn btnPrimary", onClick: ()=>{ closeModal(); openIncomeForm(id); } },
      { text:"Löschen", className:"btn btnDanger", onClick: ()=>{
          const i = state.incomes.findIndex(x=>x.id===id);
          if(i>=0) state.incomes.splice(i,1);
          saveState(); closeModal(); renderIncome(); toast("Gelöscht");
        }
      },
      { text:"Abbrechen", className:"btn btnSmall", onClick: ()=>closeModal() },
    ]
  });
}

/* ---------- Render: Fixed Costs ---------- */
function renderFixed(){
  const month = state.fixedMonth;
  setPageTitle("Fixe Kosten", `${monthLabelDE(month)} • Übernehmen möglich`);
  showScreen("fixed");

  const items = state.fixedCosts
    .filter(x=>x.month===month)
    .sort((a,b)=> b.date.localeCompare(a.date));

  const sum = items.reduce((a,x)=>a+x.amountCents,0);

  const html = `
    <div class="list">
      ${renderMonthHeader(month)}
      <div class="card">
        <div class="row">
          <div class="itemTitle">Summe Fixe Kosten</div>
          <div class="itemTitle">${centsToEUR(sum)}</div>
        </div>
      </div>

      <div class="grid2">
        <button class="btn btnPrimary" id="addFix">+ Fixkosten</button>
        <button class="btn" id="manageFixTypes">Typen verwalten</button>
      </div>

      <button class="btn" id="copyFix">Fixkosten aus Vormonat übernehmen</button>

      <div class="card">
        <div class="itemTitle">Liste</div>
        <div class="hr"></div>
        ${
          items.length===0 ? `<div class="muted">Keine Fixkosten in diesem Monat.</div>` :
          items.map(x=>{
            const t = state.fixedTypes.find(t=>t.id===x.typeId)?.name || "Unbekannt";
            return `
              <div class="row" style="margin:12px 0">
                <div>
                  <div class="itemTitle">${escapeHtml(t)}</div>
                  <div class="itemSub">${escapeHtml(x.date)} • ${escapeHtml(x.note||"")}</div>
                </div>
                <div style="text-align:right">
                  <div class="itemTitle">${centsToEUR(x.amountCents)}</div>
                  <button class="btn btnSmall" data-act="fixMenu" data-id="${x.id}" type="button">⋯</button>
                </div>
              </div>
            `;
          }).join("")
        }
      </div>
    </div>
  `;
  $("screen-fixed").innerHTML = html;

  $("mPrev").onclick = ()=>{ state.fixedMonth = addMonths(state.fixedMonth,-1); saveState(); renderFixed(); };
  $("mNext").onclick = ()=>{ state.fixedMonth = addMonths(state.fixedMonth, 1); saveState(); renderFixed(); };

  $("addFix").onclick = ()=>openFixedForm(null);
  $("manageFixTypes").onclick = ()=>openManageTypes("fixed");

  $("copyFix").onclick = ()=>{
    const ok = ensureFixedCopiedForMonth(month);
    if(ok){ renderFixed(); toast("Übernommen"); }
    else toast("Nichts zu übernehmen (oder schon vorhanden)");
  };

  document.querySelectorAll('[data-act="fixMenu"]').forEach(btn=>{
    btn.onclick = ()=>openFixedMenu(btn.getAttribute("data-id"));
  });
}

function openFixedForm(id){
  const isEdit = !!id;
  const item = isEdit ? state.fixedCosts.find(x=>x.id===id) : null;
  const dateDefault = isEdit ? item.date : `${state.fixedMonth}-01`;
  const amountDefault = isEdit ? (item.amountCents/100).toLocaleString("de-DE") : "";
  const noteDefault = isEdit ? (item.note||"") : "";
  const typeDefault = isEdit ? item.typeId : (state.fixedTypes[0]?.id || "");

  openModal({
    title: isEdit ? "Fixkosten bearbeiten" : "Fixkosten hinzufügen",
    bodyHTML: `
      <div class="field">
        <label>Typ</label>
        <select id="fixType">
          ${state.fixedTypes.map(t=>`<option value="${t.id}" ${t.id===typeDefault?"selected":""}>${escapeHtml(t.name)}</option>`).join("")}
          <option value="__new__">+ Neuer Typ…</option>
        </select>
      </div>
      <div class="field hidden" id="fixNewTypeField">
        <label>Neuer Typ</label>
        <input id="fixNewType" placeholder="z.B. Kredit/Rate" />
      </div>
      <div class="field">
        <label>Betrag (€)</label>
        <input id="fixAmount" inputmode="decimal" placeholder="z.B. 799,00" value="${escapeAttr(amountDefault)}"/>
      </div>
      <div class="field">
        <label>Datum</label>
        <input id="fixDate" type="date" value="${escapeAttr(dateDefault)}"/>
        <div class="itemSub">Beim Übernehmen wird immer der 01. gesetzt.</div>
      </div>
      <div class="field">
        <label>Notiz (optional)</label>
        <input id="fixNote" placeholder="optional" value="${escapeAttr(noteDefault)}"/>
      </div>
    `,
    actions: [
      { text:"Abbrechen", className:"btn btnSmall", onClick: ()=>closeModal() },
      { text:"Speichern", className:"btn btnPrimary", onClick: ()=>{
          const cents = eurToCents($("fixAmount").value);
          if(cents===null || cents<=0){ toast("Ungültiger Betrag"); return; }

          let typeId = $("fixType").value;
          if(typeId==="__new__"){
            const name = ($("fixNewType").value||"").trim();
            if(!name){ toast("Neuer Typ fehlt"); return; }
            typeId = uid("ft");
            state.fixedTypes.push({id:typeId, name});
          }

          const date = $("fixDate").value || `${state.fixedMonth}-01`;
          const month = ymFromDate(date);
          const note = $("fixNote").value || "";

          if(isEdit){
            Object.assign(item, {date, month, typeId, amountCents:cents, note});
          }else{
            state.fixedCosts.push({ id: uid("fix"), date, month, typeId, amountCents:cents, note });
          }
          saveState();
          closeModal();
          renderFixed();
          toast("Gespeichert");
        }
      }
    ]
  });

  $("fixType").onchange = ()=>{
    const v = $("fixType").value;
    $("fixNewTypeField").classList.toggle("hidden", v!=="__new__");
  };
}

function openFixedMenu(id){
  openModal({
    title: "Aktionen",
    bodyHTML: `<div class="muted">Fixkosten bearbeiten oder löschen.</div>`,
    actions: [
      { text:"Bearbeiten", className:"btn btnPrimary", onClick: ()=>{ closeModal(); openFixedForm(id); } },
      { text:"Löschen", className:"btn btnDanger", onClick: ()=>{
          const i = state.fixedCosts.findIndex(x=>x.id===id);
          if(i>=0) state.fixedCosts.splice(i,1);
          saveState(); closeModal(); renderFixed(); toast("Gelöscht");
        }
      },
      { text:"Abbrechen", className:"btn btnSmall", onClick: ()=>closeModal() },
    ]
  });
}

/* ---------- Render: Expenses ---------- */
function renderExpenses(){
  const month = state.expensesMonth;
  setPageTitle("Sonstige Ausgaben", `${monthLabelDE(month)} • Kategorien frei`);
  showScreen("expenses");

  const items = state.expenses
    .filter(x=>x.month===month)
    .sort((a,b)=> b.date.localeCompare(a.date));

  const sum = items.reduce((a,x)=>a+x.amountCents,0);

  const html = `
    <div class="list">
      ${renderMonthHeader(month)}
      <div class="card">
        <div class="row">
          <div class="itemTitle">Summe Ausgaben</div>
          <div class="itemTitle">${centsToEUR(sum)}</div>
        </div>
      </div>

      <div class="grid2">
        <button class="btn btnPrimary" id="addExp">+ Ausgabe</button>
        <button class="btn" id="manageCats">Kategorien verwalten</button>
      </div>

      <div class="card">
        <div class="itemTitle">Liste</div>
        <div class="hr"></div>
        ${
          items.length===0 ? `<div class="muted">Keine Ausgaben in diesem Monat.</div>` :
          items.map(x=>{
            const c = state.expenseCategories.find(c=>c.id===x.categoryId)?.name || "Unbekannt";
            return `
              <div class="row" style="margin:12px 0">
                <div>
                  <div class="itemTitle">${escapeHtml(c)}</div>
                  <div class="itemSub">${escapeHtml(x.date)} • ${escapeHtml(x.note||"")}</div>
                </div>
                <div style="text-align:right">
                  <div class="itemTitle">-${centsToEUR(x.amountCents)}</div>
                  <button class="btn btnSmall" data-act="expMenu" data-id="${x.id}" type="button">⋯</button>
                </div>
              </div>
            `;
          }).join("")
        }
      </div>
    </div>
  `;
  $("screen-expenses").innerHTML = html;

  $("mPrev").onclick = ()=>{ state.expensesMonth = addMonths(state.expensesMonth,-1); saveState(); renderExpenses(); };
  $("mNext").onclick = ()=>{ state.expensesMonth = addMonths(state.expensesMonth, 1); saveState(); renderExpenses(); };

  $("addExp").onclick = ()=>openExpenseForm(null);
  $("manageCats").onclick = ()=>openManageTypes("expense");

  document.querySelectorAll('[data-act="expMenu"]').forEach(btn=>{
    btn.onclick = ()=>openExpenseMenu(btn.getAttribute("data-id"));
  });
}

function openExpenseForm(id){
  const isEdit = !!id;
  const item = isEdit ? state.expenses.find(x=>x.id===id) : null;
  const dateDefault = isEdit ? item.date : `${state.expensesMonth}-01`;
  const amountDefault = isEdit ? (item.amountCents/100).toLocaleString("de-DE") : "";
  const noteDefault = isEdit ? (item.note||"") : "";
  const catDefault = isEdit ? item.categoryId : (state.expenseCategories[0]?.id || "");

  openModal({
    title: isEdit ? "Ausgabe bearbeiten" : "Ausgabe hinzufügen",
    bodyHTML: `
      <div class="field">
        <label>Kategorie</label>
        <select id="expCat">
          ${state.expenseCategories.map(c=>`<option value="${c.id}" ${c.id===catDefault?"selected":""}>${escapeHtml(c.name)}</option>`).join("")}
          <option value="__new__">+ Neue Kategorie…</option>
        </select>
      </div>
      <div class="field hidden" id="expNewCatField">
        <label>Neue Kategorie</label>
        <input id="expNewCat" placeholder="z.B. Kleidung" />
      </div>
      <div class="field">
        <label>Betrag (€)</label>
        <input id="expAmount" inputmode="decimal" placeholder="z.B. 45,90" value="${escapeAttr(amountDefault)}"/>
      </div>
      <div class="field">
        <label>Datum</label>
        <input id="expDate" type="date" value="${escapeAttr(dateDefault)}"/>
      </div>
      <div class="field">
        <label>Notiz (optional)</label>
        <input id="expNote" placeholder="optional" value="${escapeAttr(noteDefault)}"/>
      </div>
    `,
    actions: [
      { text:"Abbrechen", className:"btn btnSmall", onClick: ()=>closeModal() },
      { text:"Speichern", className:"btn btnPrimary", onClick: ()=>{
          const cents = eurToCents($("expAmount").value);
          if(cents===null || cents<=0){ toast("Ungültiger Betrag"); return; }

          let categoryId = $("expCat").value;
          if(categoryId==="__new__"){
            const name = ($("expNewCat").value||"").trim();
            if(!name){ toast("Neue Kategorie fehlt"); return; }
            categoryId = uid("ec");
            state.expenseCategories.push({id:categoryId, name});
          }

          const date = $("expDate").value || `${state.expensesMonth}-01`;
          const month = ymFromDate(date);
          const note = $("expNote").value || "";

          if(isEdit){
            Object.assign(item, {date, month, categoryId, amountCents:cents, note});
          }else{
            state.expenses.push({ id: uid("exp"), date, month, categoryId, amountCents:cents, note });
          }
          saveState();
          closeModal();
          renderExpenses();
          toast("Gespeichert");
        }
      }
    ]
  });

  $("expCat").onchange = ()=>{
    const v = $("expCat").value;
    $("expNewCatField").classList.toggle("hidden", v!=="__new__");
  };
}

function openExpenseMenu(id){
  openModal({
    title: "Aktionen",
    bodyHTML: `<div class="muted">Ausgabe bearbeiten oder löschen.</div>`,
    actions: [
      { text:"Bearbeiten", className:"btn btnPrimary", onClick: ()=>{ closeModal(); openExpenseForm(id); } },
      { text:"Löschen", className:"btn btnDanger", onClick: ()=>{
          const i = state.expenses.findIndex(x=>x.id===id);
          if(i>=0) state.expenses.splice(i,1);
          saveState(); closeModal(); renderExpenses(); toast("Gelöscht");
        }
      },
      { text:"Abbrechen", className:"btn btnSmall", onClick: ()=>closeModal() },
    ]
  });
}

/* ---------- Types/Categories Management (with safe delete mapping) ---------- */
function openManageTypes(kind){
  const isFixed = kind==="fixed";
  const list = isFixed ? state.fixedTypes : state.expenseCategories;
  const title = isFixed ? "Fixkosten-Typen" : "Ausgaben-Kategorien";
  const usedCount = (id)=>{
    if(isFixed) return state.fixedCosts.filter(x=>x.typeId===id).length;
    return state.expenses.filter(x=>x.categoryId===id).length;
  };

  openModal({
    title: `${title} verwalten`,
    bodyHTML: `
      <div class="muted">Du kannst umbenennen oder löschen. Beim Löschen kannst du Einträge umhängen.</div>
      <div class="hr"></div>
      <div class="field">
        <label>Neu hinzufügen</label>
        <input id="newTypeName" placeholder="Name" />
        <button class="btn btnPrimary" id="addTypeBtn" type="button">Hinzufügen</button>
      </div>
      <div class="hr"></div>
      <div id="typeList"></div>
    `,
    actions: [{ text:"Schließen", className:"btn btnSmall", onClick: ()=>closeModal() }]
  });

  function renderTypeList(){
    const wrap = $("typeList");
    wrap.innerHTML = list.map(t=>{
      return `
        <div class="card" style="padding:12px; margin:10px 0">
          <div class="row">
            <div>
              <div class="itemTitle">${escapeHtml(t.name)}</div>
              <div class="itemSub">Verwendet: ${usedCount(t.id)}</div>
            </div>
            <div class="grid2" style="grid-template-columns:auto auto; gap:10px">
              <button class="btn btnSmall" data-act="rename" data-id="${t.id}" type="button">Umbenennen</button>
              <button class="btn btnSmall" data-act="del" data-id="${t.id}" type="button">Löschen</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    wrap.querySelectorAll('[data-act="rename"]').forEach(b=>{
      b.onclick = ()=>renameType(b.getAttribute("data-id"));
    });
    wrap.querySelectorAll('[data-act="del"]').forEach(b=>{
      b.onclick = ()=>deleteType(b.getAttribute("data-id"));
    });
  }

  function renameType(id){
    const t = list.find(x=>x.id===id);
    if(!t) return;
    openModal({
      title: "Umbenennen",
      bodyHTML: `
        <div class="field">
          <label>Neuer Name</label>
          <input id="renameVal" value="${escapeAttr(t.name)}" />
        </div>
      `,
      actions: [
        {text:"Abbrechen", className:"btn btnSmall", onClick: ()=>{ closeModal(); openManageTypes(kind); }},
        {text:"Speichern", className:"btn btnPrimary", onClick: ()=>{
          const v = ($("renameVal").value||"").trim();
          if(!v){ toast("Name fehlt"); return; }
          t.name = v;
          saveState();
          closeModal();
          openManageTypes(kind);
          toast("Umbenannt");
        }}
      ]
    });
  }

  function deleteType(id){
    const t = list.find(x=>x.id===id);
    if(!t) return;
    const used = usedCount(id);

    if(used===0){
      const idx = list.findIndex(x=>x.id===id);
      list.splice(idx,1);
      saveState();
      closeModal();
      openManageTypes(kind);
      toast("Gelöscht");
      return;
    }

    // mapping required
    const alternatives = list.filter(x=>x.id!==id);
    const defaultTarget = alternatives[0]?.id || null;

    openModal({
      title: "Löschen (mit Umhängen)",
      bodyHTML: `
        <div class="muted">Dieser Typ wird in ${used} Einträgen verwendet. Wähle, wohin die Einträge verschoben werden.</div>
        <div class="field">
          <label>Verschieben nach</label>
          <select id="mapTo">
            ${alternatives.map(a=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("")}
          </select>
        </div>
      `,
      actions: [
        {text:"Abbrechen", className:"btn btnSmall", onClick: ()=>{ closeModal(); openManageTypes(kind); }},
        {text:"Verschieben & Löschen", className:"btn btnDanger", onClick: ()=>{
          const to = $("mapTo").value || defaultTarget;
          if(!to){ toast("Keine Alternative vorhanden"); return; }

          if(isFixed){
            state.fixedCosts.forEach(x=>{ if(x.typeId===id) x.typeId = to; });
          }else{
            state.expenses.forEach(x=>{ if(x.categoryId===id) x.categoryId = to; });
          }

          const idx = list.findIndex(x=>x.id===id);
          list.splice(idx,1);
          saveState();
          closeModal();
          openManageTypes(kind);
          toast("Verschoben & gelöscht");
        }}
      ]
    });
  }

  $("addTypeBtn").onclick = ()=>{
    const v = ($("newTypeName").value||"").trim();
    if(!v){ toast("Name fehlt"); return; }
    list.push({ id: uid(isFixed?"ft":"ec"), name: v });
    saveState();
    $("newTypeName").value = "";
    renderTypeList();
    toast("Hinzugefügt");
  };

  renderTypeList();
}

/* ---------- Render: Savings ---------- */
function renderSavings(){
  const month = state.savingsMonth;
  ensureRatesCopiedForMonth(month);

  setPageTitle("Sparpläne", `${monthLabelDE(month)} • Rate + Eingezahlt`);
  showScreen("savings");

  const plans = state.savingsPlans.filter(p=>!p.isArchived);

  const html = `
    <div class="list">
      ${renderMonthHeader(month)}

      <button class="btn btnPrimary" id="addPlan">+ Sparplan hinzufügen</button>

      ${plans.length===0 ? `
        <div class="card"><div class="muted">Noch keine Sparpläne. Lege einen an.</div></div>
      ` : plans.map(p=>{
        const total = state.savingsMoves
          .filter(m=>m.planId===p.id)
          .reduce((a,m)=>a + (m.type==="deposit" ? m.amountCents : -m.amountCents), 0);

        const rate = getRate(p.id, month);
        const rateCents = rate ? rate.amountCents : 0;

        const depositExists = state.savingsMoves.some(m=>m.planId===p.id && m.month===month && m.type==="deposit");
        const depositBtnLabel = depositExists ? "Eingezahlt ✓" : "Eingezahlt";
        const depositDisabled = depositExists ? "disabled" : "";

        return `
          <div class="card" style="padding:14px">
            <div class="row">
              <div>
                <div class="itemTitle">${escapeHtml(p.name)}</div>
                <div class="itemSub">Gesamt: <b>${centsToEUR(total)}</b></div>
              </div>
              <button class="btn btnSmall" data-act="planMenu" data-id="${p.id}" type="button">⋯</button>
            </div>

            <div class="hr"></div>

            <div class="row">
              <div>
                <div class="muted">Rate ${monthLabelDE(month)}</div>
                <div class="itemTitle">${centsToEUR(rateCents)}</div>
              </div>
              <button class="btn btnSmall" data-act="editRate" data-id="${p.id}" type="button">Rate ändern</button>
            </div>

            <div style="margin-top:12px">
              <button class="btn ${depositExists ? "" : "btnPrimary"}" data-act="deposit" data-id="${p.id}" ${depositDisabled} type="button">${depositBtnLabel}</button>
              ${depositExists ? `<button class="btn btnSmall" style="margin-top:10px" data-act="undoDeposit" data-id="${p.id}" type="button">Rückgängig</button>` : ""}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
  $("screen-savings").innerHTML = html;

  $("mPrev").onclick = ()=>{ state.savingsMonth = addMonths(state.savingsMonth,-1); saveState(); renderSavings(); };
  $("mNext").onclick = ()=>{ state.savingsMonth = addMonths(state.savingsMonth, 1); saveState(); renderSavings(); };

  $("addPlan").onclick = ()=>openAddPlan();

  document.querySelectorAll('[data-act="editRate"]').forEach(b=>{
    b.onclick = ()=>openEditRate(b.getAttribute("data-id"));
  });
  document.querySelectorAll('[data-act="deposit"]').forEach(b=>{
    b.onclick = ()=>doDeposit(b.getAttribute("data-id"));
  });
  document.querySelectorAll('[data-act="undoDeposit"]').forEach(b=>{
    b.onclick = ()=>undoDeposit(b.getAttribute("data-id"));
  });
  document.querySelectorAll('[data-act="planMenu"]').forEach(b=>{
    b.onclick = ()=>openPlanMenu(b.getAttribute("data-id"));
  });
}

function openAddPlan(){
  openModal({
    title: "Sparplan hinzufügen",
    bodyHTML: `
      <div class="field">
        <label>Name</label>
        <input id="spName" placeholder="z.B. Auto" />
      </div>
      <div class="field">
        <label>Start-Rate für aktuellen Monat (optional)</label>
        <input id="spRate" inputmode="decimal" placeholder="z.B. 200,00" />
      </div>
      <div class="field">
        <label>Zielbetrag (optional)</label>
        <input id="spTarget" inputmode="decimal" placeholder="z.B. 8000,00" />
      </div>
    `,
    actions: [
      {text:"Abbrechen", className:"btn btnSmall", onClick: ()=>closeModal()},
      {text:"Speichern", className:"btn btnPrimary", onClick: ()=>{
        const name = ($("spName").value||"").trim();
        if(!name){ toast("Name fehlt"); return; }

        const planId = uid("sp");
        const targetCents = ($("spTarget").value||"").trim() ? eurToCents($("spTarget").value) : null;
        if(targetCents!==null && targetCents<=0){ toast("Zielbetrag ungültig"); return; }

        state.savingsPlans.push({ id: planId, name, targetCents: (targetCents||undefined), isArchived:false });

        const month = state.savingsMonth;
        const rateCents = ($("spRate").value||"").trim() ? eurToCents($("spRate").value) : null;
        if(rateCents!==null && rateCents>0){
          state.savingsRates.push({ id: uid("sr"), planId, month, amountCents: rateCents });
        }

        saveState();
        closeModal();
        renderSavings();
        toast("Gespeichert");
      }}
    ]
  });
}

function openEditRate(planId){
  const month = state.savingsMonth;
  const rate = getRate(planId, month);
  const current = rate ? (rate.amountCents/100).toLocaleString("de-DE") : "";

  openModal({
    title: "Rate ändern (nur dieser Monat)",
    bodyHTML: `
      <div class="muted">Änderungen wirken nur für ${monthLabelDE(month)}. Vergangene Monate bleiben unverändert.</div>
      <div class="field">
        <label>Rate (€)</label>
        <input id="rateVal" inputmode="decimal" placeholder="z.B. 200,00" value="${escapeAttr(current)}"/>
      </div>
      <div class="muted">Tipp: Leere Rate = 0.</div>
    `,
    actions: [
      {text:"Abbrechen", className:"btn btnSmall", onClick: ()=>closeModal()},
      {text:"Speichern", className:"btn btnPrimary", onClick: ()=>{
        const raw = ($("rateVal").value||"").trim();
        const cents = raw ? eurToCents(raw) : 0;
        if(cents===null || cents<0){ toast("Ungültiger Betrag"); return; }

        if(rate){
          rate.amountCents = cents;
        }else{
          state.savingsRates.push({ id: uid("sr"), planId, month, amountCents: cents });
        }
        saveState();
        closeModal();
        renderSavings();
        toast("Rate gespeichert");
      }}
    ]
  });
}

function doDeposit(planId){
  const month = state.savingsMonth;
  const rate = getRate(planId, month);
  const amount = rate ? rate.amountCents : 0;
  if(amount<=0){ toast("Rate ist 0 – erst Rate setzen"); return; }

  const exists = state.savingsMoves.some(m=>m.planId===planId && m.month===month && m.type==="deposit");
  if(exists){ toast("Schon eingezahlt"); return; }

  const date = `${month}-01`; // immer 01.
  state.savingsMoves.push({ id: uid("sm"), planId, date, month, amountCents: amount, type:"deposit" });
  saveState();
  renderSavings();
  toast("Eingezahlt");
}

function undoDeposit(planId){
  const month = state.savingsMonth;
  const idx = state.savingsMoves.findIndex(m=>m.planId===planId && m.month===month && m.type==="deposit");
  if(idx>=0){
    state.savingsMoves.splice(idx,1);
    saveState();
    renderSavings();
    toast("Rückgängig");
  }
}

function openPlanMenu(planId){
  const p = state.savingsPlans.find(x=>x.id===planId);
  if(!p) return;

  openModal({
    title: "Sparplan Aktionen",
    bodyHTML: `<div class="muted">${escapeHtml(p.name)}</div>`,
    actions: [
      {text:"Plan umbenennen", className:"btn btnPrimary", onClick: ()=>{ closeModal(); openRenamePlan(planId); }},
      {text:"Archivieren", className:"btn", onClick: ()=>{
        p.isArchived = true;
        saveState(); closeModal(); renderSavings(); toast("Archiviert");
      }},
      {text:"Endgültig löschen", className:"btn btnDanger", onClick: ()=>{
        closeModal();
        openHardDeletePlan(planId);
      }},
      {text:"Abbrechen", className:"btn btnSmall", onClick: ()=>closeModal()},
    ]
  });
}

function openRenamePlan(planId){
  const p = state.savingsPlans.find(x=>x.id===planId);
  if(!p) return;

  openModal({
    title: "Sparplan umbenennen",
    bodyHTML: `
      <div class="field">
        <label>Name</label>
        <input id="planNewName" value="${escapeAttr(p.name)}" />
      </div>
    `,
    actions: [
      {text:"Abbrechen", className:"btn btnSmall", onClick: ()=>closeModal()},
      {text:"Speichern", className:"btn btnPrimary", onClick: ()=>{
        const v = ($("planNewName").value||"").trim();
        if(!v){ toast("Name fehlt"); return; }
        p.name = v;
        saveState(); closeModal(); renderSavings(); toast("Gespeichert");
      }},
    ]
  });
}

function openHardDeletePlan(planId){
  const p = state.savingsPlans.find(x=>x.id===planId);
  if(!p) return;

  openModal({
    title: "Endgültig löschen",
    bodyHTML: `
      <div class="muted">Das löscht den Sparplan, alle Raten und alle Einzahlungen/Entnahmen.</div>
      <div class="field">
        <label>Zum Bestätigen tippe: <b>LÖSCHEN</b></label>
        <input id="delPlanWord" placeholder="LÖSCHEN" />
      </div>
    `,
    actions: [
      {text:"Abbrechen", className:"btn btnSmall", onClick: ()=>closeModal()},
      {text:"Löschen", className:"btn btnDanger", onClick: ()=>{
        const v = ($("delPlanWord").value||"").trim().toUpperCase();
        if(v!=="LÖSCHEN"){ toast("Bitte LÖSCHEN tippen"); return; }

        state.savingsPlans = state.savingsPlans.filter(x=>x.id!==planId);
        state.savingsRates = state.savingsRates.filter(x=>x.planId!==planId);
        state.savingsMoves = state.savingsMoves.filter(x=>x.planId!==planId);

        saveState();
        closeModal();
        renderSavings();
        toast("Gelöscht");
      }},
    ]
  });
}

/* ---------- Route Handling ---------- */
function renderRoute(){
  const h = location.hash || "#/";
  const route = h.replace("#/","");

  if(route==="income") return renderIncome();
  if(route==="fixed") return renderFixed();
  if(route==="expenses") return renderExpenses();
  if(route==="savings") return renderSavings();
  return renderHome();
}

function renderAll(){
  renderRoute();
}

/* ---------- Safety: escape HTML ---------- */
function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(s){
  return escapeHtml(s).replaceAll("\n"," ");
}

/* ---------- Init ---------- */
(function init(){
  saveState();      // ensures storage exists
  renderAll();
})();
