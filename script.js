const STORAGE_KEYS = {
  members: "es_members",
  deposits: "es_deposits",
  settlements: "es_settlements",
  dutyData: "dutyData",
  theme: "es_theme",
  dutyNotes: "es_duty_notes"
};

const defaultMembers = ["হাসান", "নেওয়াজ", "শফিক"];
const staff = [...defaultMembers];
const days = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
const holidays = ["2026-02-21", "2026-03-26", "2026-04-14", "2026-05-01", "2026-08-15", "2026-12-16", "2026-12-25"];

let dutyData = [];
let selectedSwap = null;
let selectedNoteIndex = null;
let deposits = JSON.parse(localStorage.getItem(STORAGE_KEYS.deposits) || "[]");
let settlements = JSON.parse(localStorage.getItem(STORAGE_KEYS.settlements) || "[]");
let dutyNotes = JSON.parse(localStorage.getItem(STORAGE_KEYS.dutyNotes) || "{}");
let members = JSON.parse(localStorage.getItem(STORAGE_KEYS.members) || "null") || defaultMembers.slice();

const memberModalEl = document.getElementById("memberModal");
const memberModal = memberModalEl ? new bootstrap.Modal(memberModalEl) : null;

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isHoliday(dateStr) {
  return holidays.includes(dateStr);
}

function showToast(message, type = "primary") {
  const wrap = document.getElementById("toastContainer");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.closest('.toast').remove()"></button>
    </div>
  `;
  wrap.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 1800 });
  toast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

function saveMembers() { localStorage.setItem(STORAGE_KEYS.members, JSON.stringify(members)); }
function saveDeposits() { localStorage.setItem(STORAGE_KEYS.deposits, JSON.stringify(deposits)); }
function saveSettlements() { localStorage.setItem(STORAGE_KEYS.settlements, JSON.stringify(settlements)); }
function saveDutyData() { localStorage.setItem(STORAGE_KEYS.dutyData, JSON.stringify(dutyData)); }
function saveDutyNotes() { localStorage.setItem(STORAGE_KEYS.dutyNotes, JSON.stringify(dutyNotes)); }

function loadDutyData() {
  const saved = localStorage.getItem(STORAGE_KEYS.dutyData);
  if (saved) dutyData = JSON.parse(saved);
  else buildDutyData();
  trimPastDutyData();
}

function buildDutyData() {
  dutyData = [];
  let i = 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let d = new Date(start); d <= new Date(start.getFullYear(), start.getMonth(), start.getDate() + 29); d.setDate(d.getDate() + 1)) {
    dutyData.push({ date: formatDate(d), duty: staff[i % 3] });
    i++;
  }
  saveDutyData();
}

function trimPastDutyData() {
  const today = todayISO();
  const future = dutyData.filter(item => item.date >= today).slice(0, 30);
  if (future.length !== dutyData.length) {
    dutyData = future;
    saveDutyData();
  }
  while (dutyData.length < 30) {
    const lastDate = dutyData.length ? new Date(dutyData[dutyData.length - 1].date) : new Date();
    lastDate.setDate(lastDate.getDate() + 1);
    dutyData.push({ date: formatDate(lastDate), duty: staff[dutyData.length % 3] });
  }
  saveDutyData();
}

function updateDutySummary() {
  const summary = { "হাসান": { total: 0, friday: 0, holiday: 0 }, "নেওয়াজ": { total: 0, friday: 0, holiday: 0 }, "শফিক": { total: 0, friday: 0, holiday: 0 } };
  dutyData.forEach(item => {
    const dayIndex = new Date(item.date).getDay();
    const person = item.duty;
    if (!summary[person]) return;
    summary[person].total++;
    if (dayIndex === 5) summary[person].friday++;
    if (isHoliday(item.date)) summary[person].holiday++;
  });
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("hasanTotal", summary["হাসান"].total);
  set("newazFriday", summary["নেওয়াজ"].friday);
  set("shafiqHoliday", summary["শফিক"].holiday);
  set("swapCount", selectedSwap === null ? 0 : 1);
}

function openDutyNote(index) {
  const current = dutyNotes[dutyData[index].date] || "";
  const note = prompt("নোট লিখুন", current);
  if (note === null) return;
  if (note.trim()) dutyNotes[dutyData[index].date] = note.trim();
  else delete dutyNotes[dutyData[index].date];
  saveDutyNotes();
  selectedNoteIndex = index;
  generateCalendar();
}

function generateCalendar() {
  trimPastDutyData();
  const tbody = document.getElementById("tableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  dutyData.forEach((item, index) => {
    const row = document.createElement("tr");
    const d = new Date(item.date);
    const dayIndex = d.getDay();
    const dayName = days[dayIndex];
    const friday = dayIndex === 5;
    const holiday = isHoliday(item.date);

    if (selectedSwap === index) row.classList.add("selected-row");

    let status = '<span class="badge badge-normal">Normal</span>';
    if (friday) status = '<span class="badge badge-friday">Friday</span>';
    if (holiday) status = '<span class="badge badge-holiday">Holiday</span>';

    const noteText = dutyNotes[item.date] ? `<div class="small text-muted mt-1">${dutyNotes[item.date]}</div>` : "";
    row.innerHTML = `
      <td>${item.date}</td>
      <td>${dayName}</td>
      <td>${item.duty}</td>
      <td>${status}</td>
      <td>
        <a href="javascript:void(0)" class="text-decoration-none fw-semibold me-2" onclick="selectSwap(${index})">Swap</a>
        <a href="javascript:void(0)" class="text-decoration-none fw-semibold" onclick="openDutyNote(${index})">Note</a>
        ${noteText}
      </td>
    `;

    if (holiday) row.style.background = "rgba(220, 38, 38, 0.10)";
    else if (friday) row.style.background = "rgba(37, 99, 235, 0.10)";

    tbody.appendChild(row);
  });
  updateDutySummary();
}

function selectSwap(index) {
  if (selectedSwap === null) {
    selectedSwap = index;
    generateCalendar();
    showToast("প্রথম দিন নির্বাচন হয়েছে", "secondary");
    return;
  }
  if (selectedSwap === index) {
    selectedSwap = null;
    generateCalendar();
    return;
  }
  performSwap(selectedSwap, index);
  selectedSwap = null;
  generateCalendar();
}

function performSwap(firstIndex, secondIndex) {
  const temp = dutyData[firstIndex].duty;
  dutyData[firstIndex].duty = dutyData[secondIndex].duty;
  dutyData[secondIndex].duty = temp;
  saveDutyData();
  showToast("Swap সম্পন্ন হয়েছে", "success");
}

function resetAllSwaps() {
  localStorage.removeItem(STORAGE_KEYS.dutyData);
  selectedSwap = null;
  buildDutyData();
  trimPastDutyData();
  generateCalendar();
  showToast("সব Swap Reset হয়েছে", "warning");
}

function getTotalDeposit() { return deposits.reduce((sum, item) => sum + Number(item.amount || 0), 0); }
function getShare() { return members.length ? getTotalDeposit() / members.length : 0; }
function getReceived(name) { return deposits.filter(d => d.member === name).reduce((sum, x) => sum + Number(x.amount || 0), 0); }
function getSettlementPaid(name) { return settlements.filter(s => s.from === name).reduce((sum, x) => sum + Number(x.amount || 0), 0); }
function getSettlementReceived(name) { return settlements.filter(s => s.to === name).reduce((sum, x) => sum + Number(x.amount || 0), 0); }

function getBalances() {
  const share = getShare();
  return members.map(name => ({
    name,
    received: getReceived(name),
    share,
    balance: getReceived(name) - share - getSettlementPaid(name) + getSettlementReceived(name)
  }));
}

function getBaseSettlement() {
  const balances = getBalances();
  const givers = balances.filter(x => x.balance > 0).map(x => ({ name: x.name, amount: x.balance })).sort((a, b) => b.amount - a.amount);
  const takers = balances.filter(x => x.balance < 0).map(x => ({ name: x.name, amount: Math.abs(x.balance) })).sort((a, b) => b.amount - a.amount);
  const result = [];
  let i = 0, j = 0;
  while (i < givers.length && j < takers.length) {
    const amount = Math.min(givers[i].amount, takers[j].amount);
    if (amount > 0) result.push({ from: givers[i].name, to: takers[j].name, amount });
    givers[i].amount -= amount;
    takers[j].amount -= amount;
    if (givers[i].amount === 0) i++;
    if (takers[j].amount === 0) j++;
  }
  return result;
}

function applySettlementAdjustments(base) {
  const map = new Map(base.map(x => [`${x.from}__${x.to}`, x.amount]));
  settlements.forEach(s => {
    const key = `${s.from}__${s.to}`;
    const reverse = `${s.to}__${s.from}`;
    if (map.has(key)) map.set(key, Math.max(0, map.get(key) - Number(s.amount || 0)));
    else if (map.has(reverse)) map.set(reverse, Math.max(0, map.get(reverse) - Number(s.amount || 0)));
  });
  return [...map.entries()].filter(([, amount]) => amount > 0).map(([key, amount]) => {
    const [from, to] = key.split("__");
    return { from, to, amount };
  });
}

function populateMemberSelects() {
  ["depositMember", "settlementFrom", "settlementTo"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<option value="">আপনার নাম</option>` + members.map(name => `<option value="${name}">${name}</option>`).join("");
  });
  const totalMembersCard = document.getElementById("totalMembersCard");
  if (totalMembersCard) totalMembersCard.textContent = members.length;
}

function saveDeposit() {
  const member = document.getElementById("depositMember")?.value || "";
  const amount = Number(document.getElementById("depositAmount")?.value || 0);
  if (!member) return showToast("আপনার নাম", "warning");
  if (!amount || amount <= 0) return showToast("সঠিক deposit দিন", "danger");
  deposits.push({ id: crypto.randomUUID(), date: todayISO(), member, amount });
  saveDeposits();
  resetDepositForm();
  renderMoneyPage();
  renderAll();
  showToast("জমা saved", "success");
}

function resetDepositForm() {
  document.getElementById("depositForm")?.reset();
}

function saveSettlement() {
  const from = document.getElementById("settlementFrom")?.value || "";
  const to = document.getElementById("settlementTo")?.value || "";
  const amount = Number(document.getElementById("settlementAmount")?.value || 0);
  if (!from || !to || !amount || amount <= 0) return showToast("সঠিক পরিশোধ দিন", "danger");
  if (from === to) return showToast("দিলাম এবং পেলাম একই হতে পারে না", "warning");
  settlements.push({ id: crypto.randomUUID(), date: todayISO(), from, to, amount });
  saveSettlements();
  resetSettlementForm();
  renderMoneyPage();
  renderAll();
  showToast("পরিশোধ saved", "success");
}

function resetSettlementForm() {
  document.getElementById("settlementForm")?.reset();
}

function clearAllDeposits() {
  if (!confirm("সব deposit মুছতে চান?")) return;
  deposits = [];
  saveDeposits();
  renderMoneyPage();
  renderAll();
}

function clearAllSettlements() {
  if (!confirm("সব পরিশোধ মুছতে চান?")) return;
  settlements = [];
  saveSettlements();
  renderMoneyPage();
  renderAll();
}

function deleteDeposit(id) {
  if (!confirm("এই deposit delete করবেন?")) return;
  deposits = deposits.filter(d => d.id !== id);
  saveDeposits();
  renderMoneyPage();
  renderAll();
}

function deleteSettlement(id) {
  if (!confirm("এই পরিশোধ delete করবেন?")) return;
  settlements = settlements.filter(s => s.id !== id);
  saveSettlements();
  renderMoneyPage();
  renderAll();
}

function editDeposit(id) {
  const row = deposits.find(d => d.id === id);
  if (!row) return;
  const date = prompt("Date", row.date);
  const member = prompt("জমা পেল", row.member);
  const amount = prompt("Amount", row.amount);
  if (!date || !member || !amount) return;
  row.date = date;
  row.member = member;
  row.amount = Number(amount);
  saveDeposits();
  renderMoneyPage();
  renderAll();
}

function editSettlement(id) {
  const row = settlements.find(s => s.id === id);
  if (!row) return;
  const date = prompt("Date", row.date);
  const from = prompt("দিলাম", row.from);
  const to = prompt("পেলাম", row.to);
  const amount = prompt("Amount", row.amount);
  if (!date || !from || !to || !amount) return;
  row.date = date;
  row.from = from;
  row.to = to;
  row.amount = Number(amount);
  saveSettlements();
  renderMoneyPage();
  renderAll();
}

function renderDutyPage() {
  generateCalendar();
}

function renderMoneyPage() {
  populateMemberSelects();
  const total = getTotalDeposit();
  const share = getShare();
  const remaining = applySettlementAdjustments(getBaseSettlement());
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("totalDepositCard", money(total));
  set("perPersonCard", money(share));
  set("totalMembersCard", members.length);
  set("remainingCountCard", remaining.length);

  const calcBody = document.getElementById("settlementCalcBody");
  if (calcBody) {
    calcBody.innerHTML = remaining.length
      ? remaining.map(x => `<tr><td>${x.from}</td><td>${x.to}</td><td>৳ ${money(x.amount)}</td></tr>`).join("")
      : `<tr><td colspan="3" class="text-center">No Remaining Settlement</td></tr>`;
  }

  const noRemaining = document.getElementById("noRemainingBox");
  if (noRemaining) noRemaining.classList.toggle("d-none", remaining.length !== 0);

  const histBody = document.getElementById("historyBody");
  if (histBody) {
    const q = document.getElementById("historySearch")?.value.trim().toLowerCase() || "";
    const history = [
      ...deposits.map(x => ({ id: x.id, type: "জমা", date: x.date, name: x.member, mode: "পেল", amount: x.amount, action: "deposit" })),
      ...settlements.map(x => ({ id: x.id, type: "পরিশোধ", date: x.date, name: `${x.from} → ${x.to}`, mode: "দিল", amount: x.amount, action: "settlement" }))
    ]
      .filter(x => !q || `${x.date} ${x.type} ${x.name} ${x.mode} ${x.amount}`.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));

    histBody.innerHTML = history.length
      ? history.map(r => `
        <tr>
          <td>${r.date}</td>
          <td>${r.type}</td>
          <td>${r.name}</td>
          <td>${r.mode}</td>
          <td>৳ ${money(r.amount)}</td>
          <td>
            <button class="btn btn-sm btn-outline-primary" onclick="${r.action === "deposit" ? `editDeposit('${r.id}')` : `editSettlement('${r.id}')`}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" onclick="${r.action === "deposit" ? `deleteDeposit('${r.id}')` : `deleteSettlement('${r.id}')`}">Delete</button>
          </td>
        </tr>
      `).join("")
      : `<tr><td colspan="6" class="text-center text-muted">No history found</td></tr>`;
  }

  const calcHint = document.getElementById("calcHint");
  if (calcHint) calcHint.textContent = `Auto calculation based on ${members.length} members`;
}

function renderAll() {
  renderDutyPage();
  renderMoneyPage();
}

function showDutyTab() {
  document.getElementById("dutyPage").classList.remove("d-none");
  document.getElementById("moneyPage").classList.add("d-none");
  document.getElementById("dutyTabBtn").classList.add("active");
  document.getElementById("moneyTabBtn").classList.remove("active");
  renderDutyPage();
}

function showMoneyTab() {
  document.getElementById("dutyPage").classList.add("d-none");
  document.getElementById("moneyPage").classList.remove("d-none");
  document.getElementById("dutyTabBtn").classList.remove("active");
  document.getElementById("moneyTabBtn").classList.add("active");
  renderMoneyPage();
}

function openMemberModal() { memberModal?.show(); }
function closeMemberModal() { memberModal?.hide(); }

function addMember() {
  const input = document.getElementById("newMemberName");
  const name = input?.value.trim();
  if (!name) return showToast("Member name required", "danger");
  if (members.includes(name)) return showToast("Member already exists", "warning");
  members.push(name);
  saveMembers();
  if (input) input.value = "";
  closeMemberModal();
  renderAll();
  showToast("Member added", "success");
}

function exportJSON() {
  const data = { members, deposits, settlements, dutyData, dutyNotes };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "expense-settlement-data.json";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("JSON exported", "success");
}

function downloadDutyJSON() {
  const blob = new Blob([JSON.stringify(dutyData, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "duty-data.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJSON(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      members = data.members || members;
      deposits = data.deposits || [];
      settlements = data.settlements || [];
      dutyData = data.dutyData || dutyData;
      dutyNotes = data.dutyNotes || {};
      saveMembers();
      saveDeposits();
      saveSettlements();
      saveDutyData();
      saveDutyNotes();
      renderAll();
      showToast("JSON imported", "success");
    } catch {
      showToast("Invalid JSON", "danger");
    }
  };
  reader.readAsText(file);
}

async function copyReport() {
  const remaining = applySettlementAdjustments(getBaseSettlement());
  const text = [
    `Total Deposit: ${getTotalDeposit()}`,
    `Per Person Share: ${getShare()}`,
    `Members: ${members.length}`,
    `Remaining Settlement:`,
    ...remaining.map(x => `${x.from} -> ${x.to}: ${x.amount}`)
  ].join("\n");
  await navigator.clipboard.writeText(text);
  showToast("Report copied", "success");
}

function deleteAllData() {
  if (!confirm("সব data delete করবেন?")) return;
  localStorage.removeItem(STORAGE_KEYS.members);
  localStorage.removeItem(STORAGE_KEYS.deposits);
  localStorage.removeItem(STORAGE_KEYS.settlements);
  localStorage.removeItem(STORAGE_KEYS.dutyData);
  localStorage.removeItem(STORAGE_KEYS.dutyNotes);
  members = defaultMembers.slice();
  deposits = [];
  settlements = [];
  dutyNotes = {};
  buildDutyData();
  saveMembers();
  saveDeposits();
  saveSettlements();
  saveDutyData();
  saveDutyNotes();
  renderAll();
  showToast("All data deleted", "warning");
}

function money(n) {
  return new Intl.NumberFormat("en-US").format(Number(n || 0));
}

function applyTheme() {
  const theme = localStorage.getItem(STORAGE_KEYS.theme) || "light";
  document.documentElement.setAttribute("data-theme", theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(STORAGE_KEYS.theme, next);
}

document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  loadDutyData();
  renderAll();
});
