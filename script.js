const firebaseConfig = {
  apiKey: "AIzaSyAf3hfQdBR3RnS5787dFWbi8MTzmF6KEg",
  authDomain: "duty-roster-2026.firebaseapp.com",
  databaseURL: "https://duty-roster-2026-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "duty-roster-2026",
  storageBucket: "duty-roster-2026.firebasestorage.app",
  messagingSenderId: "142416343397",
  appId: "1:142416343397:web:202d63a1fcff38e225b18c"
};

const defaultMembers = ["শফিক", "হাসান", "নেওয়াজ"];
const staff = [...defaultMembers];
const days = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
const STORAGE_KEYS = { theme: "es_theme" };
const DUTY_PAST_DAYS = 7;
const DUTY_FUTURE_DAYS = 23;

const holidays = {
  "2026-07-04": { className: "holiday-national", label: "জাতীয় ছুটি" },
  "2026-07-07": { className: "holiday-special", label: "বিশেষ ছুটি" },
  "2026-07-11": { className: "holiday-religious", label: "ধর্মীয় ছুটি" },
  "2026-07-16": { className: "holiday-puja", label: "পূজা ছুটি" }
};

let dutyData = [];
let dutyBackup = [];
let deposits = [];
let settlements = [];
let leaves = [];
let members = defaultMembers.slice();
let dbReady = false;
let swapAllowed = false;
let editingTx = null;
let editingLeaveId = null;
let currentTab = "duty";
let midnightTimer = null;
let swapPick1 = null;
let swapPick2 = null;

function dbRef(path) { return firebase.database().ref(path); }
function saveToDB(path, value) { if (!dbReady) return Promise.resolve(); return dbRef(path).set(value); }

async function initFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
    dbReady = true;
    setupRealtimeListeners();
  } catch (e) {
    console.error(e);
    showToast("Firebase init failed", "danger");
  }
}

function setupRealtimeListeners() {
  dbRef("members").on("value", snap => { members = snap.val() || defaultMembers.slice(); renderAll(); });
  dbRef("deposits").on("value", snap => { deposits = snap.val() ? Object.values(snap.val()) : []; renderAll(); });
  dbRef("settlements").on("value", snap => { settlements = snap.val() ? Object.values(snap.val()) : []; renderAll(); });
  dbRef("leaves").on("value", snap => { leaves = snap.val() ? Object.values(snap.val()) : []; renderAll(); });
  dbRef("swapAllowed").on("value", snap => {
    swapAllowed = !!snap.val();
    if (!swapAllowed) {
      swapPick1 = null;
      swapPick2 = null;
    }
    document.getElementById("leaveFeatures")?.classList.toggle("d-none", !swapAllowed);
    document.getElementById("leaveActionTh")?.classList.toggle("d-none", !swapAllowed);
    document.getElementById("historyActionTh")?.classList.toggle("d-none", !swapAllowed);
    updateSwapStatus();
    renderDutyPage();
  });
  dbRef("dutyData").on("value", snap => {
    dutyData = snap.val() || [];
    if (!dutyData.length) buildDutyData();
    else if (!dutyBackup.length) dutyBackup = dutyData.map(x => ({ ...x }));
    renderAll();
  });
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inRange(dateStr, start, end) { return dateStr >= start && dateStr <= end; }

function showToast(message, type = "primary") {
  const wrap = document.getElementById("toastContainer");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.closest('.toast').remove()"></button></div>`;
  wrap.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 1800 });
  toast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

function getLeaveByDateAndMember(dateStr, member) {
  return leaves.find(l => l.member === member && inRange(dateStr, l.start, l.end));
}

function getAvailableMembers(dateStr) {
  return staff.filter(m => !getLeaveByDateAndMember(dateStr, m));
}

function getNextAvailableMember(dateStr, startIndex, prevDuty) {
  const available = getAvailableMembers(dateStr);
  if (!available.length) return staff[startIndex % staff.length];
  for (let i = 0; i < staff.length; i++) {
    const candidate = staff[(startIndex + i) % staff.length];
    if (available.includes(candidate) && candidate !== prevDuty) return candidate;
  }
  return available.find(name => name !== prevDuty) || available[0];
}

function buildDutyData() {
  dutyData = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const base = new Date("2026-07-06T00:00:00");
  const baseIndex = 1;
  let prevDuty = null;

  for (let offset = -90; offset <= 180; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    const dateStr = formatDate(d);

    const daysFromBase = Math.round((d.getTime() - base.getTime()) / 86400000);
    const dutyIndex = (baseIndex + daysFromBase) % staff.length;
    const normalizedIndex = (dutyIndex + staff.length) % staff.length;
    const duty = getNextAvailableMember(dateStr, normalizedIndex, prevDuty);

    dutyData.push({ date: dateStr, duty });
    prevDuty = duty;
  }

  dutyBackup = dutyData.map(x => ({ ...x }));
  saveToDB("dutyData", dutyData);
}

function updateTabButton() {
  const btn = document.getElementById("tabToggleBtn");
  if (btn) btn.textContent = currentTab === "duty" ? "হিসাব" : "ডিউটি";
}

function toggleTab() {
  currentTab = currentTab === "duty" ? "money" : "duty";
  renderAll();
}

function scheduleMidnightRefresh() {
  if (midnightTimer) clearTimeout(midnightTimer);
  const now = new Date();
  const next = new Date();
  next.setHours(24, 0, 5, 0);
  midnightTimer = setTimeout(() => {
    buildDutyData();
    renderAll();
    scheduleMidnightRefresh();
  }, next.getTime() - now.getTime());
}

function saveLeave() {
  const member = document.getElementById("leaveMember")?.value || "";
  const start = document.getElementById("leaveStart")?.value || "";
  const end = document.getElementById("leaveEnd")?.value || "";
  if (!member || !start || !end || start > end) return showToast("সঠিক leave দিন", "danger");

  if (editingLeaveId) {
    const idx = leaves.findIndex(x => x.id === editingLeaveId);
    if (idx >= 0) leaves[idx] = { ...leaves[idx], member, start, end };
    editingLeaveId = null;
  } else {
    leaves.push({ id: crypto.randomUUID(), member, start, end });
  }

  saveToDB("leaves", leaves).then(() => {
    buildDutyData();
    renderAll();
    resetLeaveForm();
    showToast("Leave saved", "success");
  });
}

function editLeave(id) {
  const item = leaves.find(x => x.id === id);
  if (!item) return;
  editingLeaveId = id;
  document.getElementById("leaveMember").value = item.member;
  document.getElementById("leaveStart").value = item.start;
  document.getElementById("leaveEnd").value = item.end;
}

function deleteLeave(id) {
  if (!confirm("Leave delete করবেন?")) return;
  leaves = leaves.filter(x => x.id !== id);
  saveToDB("leaves", leaves).then(() => {
    buildDutyData();
    renderAll();
  });
}

function resetLeaveForm() {
  document.getElementById("leaveForm")?.reset();
  editingLeaveId = null;
}

function clearDutySwapSelection() {
  swapPick1 = null;
  swapPick2 = null;
  renderAll();
}

function selectDutySwap(dateStr) {
  if (!swapAllowed) return;
  if (swapPick1?.date === dateStr || swapPick2?.date === dateStr) {
    clearDutySwapSelection();
    showToast("Selection cleared", "warning");
    return;
  }
  if (!swapPick1) {
    swapPick1 = { date: dateStr };
    showToast("প্রথম duty selected", "primary");
  } else if (!swapPick2) {
    swapPick2 = { date: dateStr };
    showToast("দ্বিতীয় duty selected", "primary");
  }
  renderAll();
}

function performDutySwap() {
  if (!swapPick1 || !swapPick2) return showToast("দুটি date select করুন", "danger");
  const i1 = dutyData.findIndex(x => x.date === swapPick1.date);
  const i2 = dutyData.findIndex(x => x.date === swapPick2.date);
  if (i1 < 0 || i2 < 0) return showToast("দলিল পাওয়া যায়নি", "danger");
  [dutyData[i1].duty, dutyData[i2].duty] = [dutyData[i2].duty, dutyData[i1].duty];
  saveToDB("dutyData", dutyData).then(() => {
    swapPick1 = null;
    swapPick2 = null;
    renderAll();
    showToast("Duty swapped", "success");
  });
}

function resetDutySchedule() {
  if (!dutyBackup.length) return showToast("Backup not ready", "danger");
  dutyData = dutyBackup.map(x => ({ ...x }));
  swapPick1 = null;
  swapPick2 = null;
  saveToDB("dutyData", dutyData).then(() => {
    renderAll();
    showToast("Duty reset", "success");
  });
}

function getDutyForDate(dateStr) {
  const item = dutyData.find(x => x.date === dateStr);
  if (item) return item.duty;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "-";
  const base = new Date("2026-07-06T00:00:00");
  const baseIndex = 1;
  const daysFromBase = Math.round((d.getTime() - base.getTime()) / 86400000);
  const dutyIndex = (baseIndex + daysFromBase) % staff.length;
  const normalizedIndex = (dutyIndex + staff.length) % staff.length;
  return staff[normalizedIndex] || "-";
}

function generateCalendar() {
  const tbody = document.getElementById("tableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);

  for (let offset = -DUTY_PAST_DAYS; offset <= DUTY_FUTURE_DAYS; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    const dateStr = formatDate(d);
    const dayName = days[d.getDay()];
    const holiday = holidays[dateStr];
    const dutyName = getDutyForDate(dateStr);
    const selected = swapPick1?.date === dateStr || swapPick2?.date === dateStr;

    const row = document.createElement("tr");
    row.className = [
      offset === 1 ? "tomorrow-row" : "",
      offset === 0 ? "today-row" : "",
      holiday ? `holiday-row ${holiday.className}` : "",
      dayName === "শুক্রবার" ? "friday-row" : "",
      selected ? "selected-row" : ""
    ].filter(Boolean).join(" ");

    row.onclick = () => selectDutySwap(dateStr);
    row.innerHTML = `<td>${dateStr}</td><td>${dayName}</td><td>${dutyName}</td>`;
    tbody.appendChild(row);
  }

  tbody.querySelector(".today-row")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateSwapStatus() {
  const box = document.getElementById("swapStatusBox");
  if (!box) return;
  box.classList.remove("d-none");

  if (!swapAllowed) {
    box.className = "alert alert-danger py-2 mb-0";
    box.innerHTML = `<span>Swap disabled from Firebase</span>`;
    return;
  }

  box.className = "alert alert-success py-2 mb-0";
  box.innerHTML = `
    <div class="d-flex flex-column gap-2">
      <span>Swap enabled from Firebase</span>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-sm btn-warning" type="button" onclick="performDutySwap()" ${(!swapPick1 || !swapPick2) ? "disabled" : ""}>Swap Now</button>
        <button class="btn btn-sm btn-outline-danger" type="button" onclick="resetDutySchedule()">Reset</button>
        <button class="btn btn-sm btn-danger" type="button" onclick="toggleSwapAllowed()">Disable Swap</button>
      </div>
    </div>
  `;
}

function toggleSwapAllowed() {
  saveToDB("swapAllowed", !swapAllowed).then(() => {
    showToast(!swapAllowed ? "Swap enabled" : "Swap disabled", !swapAllowed ? "success" : "warning");
  });
}

function getTotalDeposit() { return deposits.reduce((sum, item) => sum + Number(item.amount || 0), 0); }
function getShare() { return members.length ? getTotalDeposit() / members.length : 0; }
function getReceived(name) { return deposits.filter(d => d.member === name).reduce((sum, x) => sum + Number(x.amount || 0), 0); }
function getSettlementPaid(name) { return settlements.filter(s => s.from === name).reduce((sum, x) => sum + Number(x.amount || 0), 0); }
function getSettlementReceived(name) { return settlements.filter(s => s.to === name).reduce((sum, x) => sum + Number(x.amount || 0), 0); }

function getBaseSettlement() {
  const balances = members.map(name => ({ name, balance: getReceived(name) - getShare() - getSettlementPaid(name) + getSettlementReceived(name) }));
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

function populateMemberSelects() {
  const options = `<option value="">আপনার নাম</option>` + members.map(name => `<option value="${name}">${name}</option>`).join("");
  ["depositMember", "settlementFrom", "settlementTo", "leaveMember"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = options;
  });
}

function renderLeaveList() {
  const body = document.getElementById("leaveBody");
  if (!body) return;
  body.innerHTML = leaves.length
    ? leaves.map(l => `<tr><td>${l.member}</td><td>${l.start}</td><td>${l.end}</td><td class="${swapAllowed ? "" : "d-none"}"><button class="btn btn-sm btn-outline-primary me-1" onclick="editLeave('${l.id}')">Edit</button><button class="btn btn-sm btn-outline-danger" onclick="deleteLeave('${l.id}')">Delete</button></td></tr>`).join("")
    : `<tr><td colspan="${swapAllowed ? 4 : 3}" class="text-center text-muted">No leave found</td></tr>`;
}

function resetDepositForm() { document.getElementById("depositForm")?.reset(); }
function resetSettlementForm() { document.getElementById("settlementForm")?.reset(); editingTx = null; }

function saveDeposit() {
  const member = document.getElementById("depositMember")?.value || "";
  const amount = Number(document.getElementById("depositAmount")?.value || 0);
  if (!member || amount <= 0) return showToast("সঠিক জমা দিন", "danger");
  const data = { id: editingTx?.type === "deposit" ? editingTx.id : crypto.randomUUID(), member, amount, date: editingTx?.date || todayISO() };
  if (editingTx?.type === "deposit") {
    const idx = deposits.findIndex(x => x.id === editingTx.id);
    if (idx >= 0) deposits[idx] = data;
  } else {
    deposits.unshift(data);
  }
  saveToDB("deposits", deposits).then(() => {
    editingTx = null;
    resetDepositForm();
    renderAll();
    showToast("Deposit saved", "success");
  });
}

function saveSettlement() {
  const from = document.getElementById("settlementFrom")?.value || "";
  const to = document.getElementById("settlementTo")?.value || "";
  const amount = Number(document.getElementById("settlementAmount")?.value || 0);
  if (!from || !to || from === to || amount <= 0) return showToast("সঠিক settlement দিন", "danger");
  const data = { id: editingTx?.type === "settlement" ? editingTx.id : crypto.randomUUID(), from, to, amount, date: editingTx?.date || todayISO() };
  if (editingTx?.type === "settlement") {
    const idx = settlements.findIndex(x => x.id === editingTx.id);
    if (idx >= 0) settlements[idx] = data;
  } else {
    settlements.unshift(data);
  }
  saveToDB("settlements", settlements).then(() => {
    editingTx = null;
    resetSettlementForm();
    renderAll();
    showToast("Settlement saved", "success");
  });
}

function editTransaction(type, id) {
  const item = type === "deposit" ? deposits.find(x => x.id === id) : settlements.find(x => x.id === id);
  if (!item) return;
  editingTx = { type, id, date: item.date };
  if (type === "deposit") {
    document.getElementById("depositMember").value = item.member;
    document.getElementById("depositAmount").value = item.amount;
  } else {
    document.getElementById("settlementFrom").value = item.from;
    document.getElementById("settlementTo").value = item.to;
    document.getElementById("settlementAmount").value = item.amount;
  }
}

function deleteTransaction(type, id) {
  if (!confirm("Delete করবেন?")) return;
  if (type === "deposit") {
    deposits = deposits.filter(x => x.id !== id);
    saveToDB("deposits", deposits).then(renderAll);
  } else {
    settlements = settlements.filter(x => x.id !== id);
    saveToDB("settlements", settlements).then(renderAll);
  }
}

function renderDutyPage() {
  generateCalendar();
  renderLeaveList();
  populateMemberSelects();
  updateSwapStatus();
}

function renderMoneyPage() {
  populateMemberSelects();
  const remaining = getBaseSettlement();
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
    const allHistory = [
      ...deposits.map(x => ({ typeKey: "deposit", date: x.date, type: "জমা", name: x.member, mode: "পেল", amount: x.amount, id: x.id })),
      ...settlements.map(x => ({ typeKey: "settlement", date: x.date, type: "পরিশোধ", name: `${x.from} → ${x.to}`, mode: "দিল", amount: x.amount, id: x.id }))
    ]
    .filter(x => !q || `${x.date} ${x.type} ${x.name} ${x.mode} ${x.amount}`.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));

    const history = q ? allHistory : allHistory.slice(0, 10);

    histBody.innerHTML = history.length
      ? history.map(r => `<tr><td>${r.date}</td><td>${r.type}</td><td>${r.name}</td><td>${r.mode}</td><td>৳ ${money(r.amount)}</td><td class="text-nowrap ${swapAllowed ? "" : "d-none"}"><button class="btn btn-sm btn-outline-primary me-1" onclick="editTransaction('${r.typeKey}', '${r.id}')">Edit</button><button class="btn btn-sm btn-outline-danger" onclick="deleteTransaction('${r.typeKey}', '${r.id}')">Delete</button></td></tr>`).join("")
      : `<tr><td colspan="${swapAllowed ? 6 : 5}" class="text-center text-muted">No history found</td></tr>`;
  }
}

function renderAll() {
  renderDutyPage();
  renderMoneyPage();
  document.getElementById("dutyPage").classList.toggle("d-none", currentTab !== "duty");
  document.getElementById("moneyPage").classList.toggle("d-none", currentTab !== "money");
  updateTabButton();
}

function money(n) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n || 0));
}

function applyTheme() {
  const theme = localStorage.getItem(STORAGE_KEYS.theme) || "light";
  document.documentElement.setAttribute("data-theme", theme);
}

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme();
  buildDutyData();
  renderAll();
  await initFirebase();
  scheduleMidnightRefresh();
});
