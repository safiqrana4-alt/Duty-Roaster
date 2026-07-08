const firebaseConfig = {
  apiKey: "AIzaSyAf3hfQdBR3rRnS5787dFWbi8MTzmF6KEg",
  authDomain: "duty-roster-2026.firebaseapp.com",
  databaseURL: "https://duty-roster-2026-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "duty-roster-2026",
  storageBucket: "duty-roster-2026.firebasestorage.app",
  messagingSenderId: "142416343397",
  appId: "1:142416343397:web:202d63a1fcff38e225b18c"
};

const defaultMembers = ["হাসান", "নেওয়াজ", "শফিক"];
const staff = [...defaultMembers];
const days = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
const STORAGE_KEYS = { theme: "es_theme" };

let dutyData = [];
let deposits = [];
let settlements = [];
let members = defaultMembers.slice();
let dbReady = false;
let swapPick1 = null;
let swapPick2 = null;
let swapAllowed = false;
let editingTx = null;

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
  dbRef("swapAllowed").on("value", snap => {
    swapAllowed = !!snap.val();
    if (!swapAllowed) clearDutySwapSelection();
    updateSwapStatus();
    renderDutyPage();
  });
  dbRef("dutyData").on("value", snap => {
    dutyData = snap.val() || [];
    if (!dutyData.length) buildDutyData();
    renderAll();
  });
}

function formatDate(date) { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, "0"); const d = String(date.getDate()).padStart(2, "0"); return `${y}-${m}-${d}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }

function showToast(message, type = "primary") {
  const wrap = document.getElementById("toastContainer"); if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.closest('.toast').remove()"></button></div>`;
  wrap.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 1800 });
  toast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

function buildDutyData() {
  dutyData = [];
  let i = 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (let d = new Date(start); d <= new Date(start.getFullYear(), start.getMonth(), start.getDate() + 30); d.setDate(d.getDate() + 1)) {
    dutyData.push({ date: formatDate(d), duty: staff[i % 3] });
    i++;
  }

  saveToDB("dutyData", dutyData);
}

function generateCalendar() {
  const tbody = document.getElementById("tableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const today = todayISO();

  dutyData.forEach((item, index) => {
    const row = document.createElement("tr");
    const d = new Date(item.date + "T00:00:00");
    const dayName = days[d.getDay()];
    const isSelected = swapPick1 === index || swapPick2 === index;
    const isToday = item.date === today;

    row.className = [isSelected ? "selected-row" : "", isToday ? "today-row" : ""].filter(Boolean).join(" ");
    row.style.cursor = swapAllowed ? "pointer" : "not-allowed";
    row.innerHTML = `<td>${item.date}</td><td>${dayName}</td><td>${item.duty}</td>`;
    row.onclick = () => {
      if (!swapAllowed) return showToast("Swap এখন বন্ধ আছে", "warning");
      selectDutyForSwap(index);
    };
    tbody.appendChild(row);
  });
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
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
      <span>Swap enabled from Firebase</span>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-warning" type="button" onclick="resetDutySchedule()">Reset</button>
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

function selectDutyForSwap(index) {
  if (!swapAllowed) return showToast("Swap এখন Firebase থেকে বন্ধ আছে", "warning");
  if (swapPick1 === null) {
    swapPick1 = index;
    showToast("প্রথম duty select হয়েছে", "primary");
  } else if (swapPick2 === null && index !== swapPick1) {
    swapPick2 = index;
    swapDutyNow();
  } else {
    swapPick1 = index;
    swapPick2 = null;
    showToast("নতুন করে select করুন", "warning");
  }
  renderDutyPage();
}

function swapDutyNow() {
  if (!swapAllowed) return showToast("Swap এখন বন্ধ আছে", "warning");
  if (swapPick1 === null || swapPick2 === null || swapPick1 === swapPick2) return showToast("Swap করার জন্য ২টি আলাদা duty select করুন", "danger");

  const temp = dutyData[swapPick1].duty;
  dutyData[swapPick1].duty = dutyData[swapPick2].duty;
  dutyData[swapPick2].duty = temp;

  saveToDB("dutyData", dutyData).then(() => {
    showToast("Duty swap হয়েছে", "success");
    swapPick1 = null;
    swapPick2 = null;
    renderAll();
  });
}

function resetDutySchedule() {
  if (!swapAllowed) return showToast("Reset unavailable এখন", "warning");
  buildDutyData();
  swapPick1 = null;
  swapPick2 = null;
  saveToDB("dutyData", dutyData).then(() => {
    showToast("Duty reset হয়েছে", "success");
    renderAll();
  });
}

function clearDutySwapSelection() {
  swapPick1 = null;
  swapPick2 = null;
  renderDutyPage();
  showToast("Selection reset হয়েছে", "info");
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
    givers[i].amount -= amount; takers[j].amount -= amount;
    if (givers[i].amount === 0) i++;
    if (takers[j].amount === 0) j++;
  }
  return result;
}

function populateMemberSelects() {
  const options = `<option value="">আপনার নাম</option>` + members.map(name => `<option value="${name}">${name}</option>`).join("");
  ["depositMember", "settlementFrom", "settlementTo"].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = options; });
}

function resetDepositForm() { document.getElementById("depositForm")?.reset(); }
function resetSettlementForm() { document.getElementById("settlementForm")?.reset(); editingTx = null; }

function saveDeposit() {
  const member = document.getElementById("depositMember")?.value || "";
  const amount = Number(document.getElementById("depositAmount")?.value || 0);
  if (!member || amount <= 0) return showToast("সঠিক deposit দিন", "danger");

  if (editingTx && editingTx.type === "deposit") {
    const idx = deposits.findIndex(x => x.id === editingTx.id);
    if (idx >= 0) deposits[idx] = { ...deposits[idx], date: todayISO(), member, amount };
    editingTx = null;
    saveToDB("deposits", deposits).then(() => showToast("Transaction updated", "success"));
    resetDepositForm();
    renderAll();
    return;
  }

  deposits.push({ id: crypto.randomUUID(), date: todayISO(), member, amount });
  saveToDB("deposits", deposits);
  resetDepositForm();
  renderAll();
}

function saveSettlement() {
  const from = document.getElementById("settlementFrom")?.value || "";
  const to = document.getElementById("settlementTo")?.value || "";
  const amount = Number(document.getElementById("settlementAmount")?.value || 0);
  if (!from || !to || amount <= 0 || from === to) return showToast("সঠিক পরিশোধ দিন", "danger");

  if (editingTx && editingTx.type === "settlement") {
    const idx = settlements.findIndex(s => s.id === editingTx.id);
    if (idx >= 0) settlements[idx] = { ...settlements[idx], date: todayISO(), from, to, amount };
    editingTx = null;
    saveToDB("settlements", settlements).then(() => showToast("Transaction updated", "success"));
    resetSettlementForm();
    renderAll();
    return;
  }

  settlements.push({ id: crypto.randomUUID(), date: todayISO(), from, to, amount });
  saveToDB("settlements", settlements);
  resetSettlementForm();
  renderAll();
}

function editTransaction(type, id) {
  if (!swapAllowed) return showToast("Edit শুধু swapAllowed true হলে", "warning");
  editingTx = { type, id };
  if (type === "deposit") {
    const tx = deposits.find(x => x.id === id);
    if (!tx) return;
    document.getElementById("depositMember").value = tx.member;
    document.getElementById("depositAmount").value = tx.amount;
    showMoneyTab();
    showToast("Deposit edit mode on", "primary");
  } else {
    const tx = settlements.find(x => x.id === id);
    if (!tx) return;
    document.getElementById("settlementFrom").value = tx.from;
    document.getElementById("settlementTo").value = tx.to;
    document.getElementById("settlementAmount").value = tx.amount;
    showMoneyTab();
    showToast("Settlement edit mode on", "primary");
  }
}

function deleteTransaction(type, id) {
  if (!swapAllowed) return showToast("Delete শুধু swapAllowed true হলে", "warning");
  if (!confirm("Delete করবেন?")) return;
  if (type === "deposit") deposits = deposits.filter(x => x.id !== id);
  else settlements = settlements.filter(x => x.id !== id);
  saveToDB(type === "deposit" ? "deposits" : "settlements", type === "deposit" ? deposits : settlements).then(() => {
    renderAll();
    showToast("Transaction deleted", "success");
  });
}

function renderDutyPage() { generateCalendar(); updateSwapStatus(); }

function renderMoneyPage() {
  populateMemberSelects();
  const remaining = getBaseSettlement();
  const calcBody = document.getElementById("settlementCalcBody");
  if (calcBody) calcBody.innerHTML = remaining.length ? remaining.map(x => `<tr><td>${x.from}</td><td>${x.to}</td><td>৳ ${money(x.amount)}</td></tr>`).join("") : `<tr><td colspan="3" class="text-center">No Remaining Settlement</td></tr>`;
  const noRemaining = document.getElementById("noRemainingBox");
  if (noRemaining) noRemaining.classList.toggle("d-none", remaining.length !== 0);

  const histBody = document.getElementById("historyBody");
  if (histBody) {
    const q = document.getElementById("historySearch")?.value.trim().toLowerCase() || "";
    const history = [
      ...deposits.map(x => ({ typeKey: "deposit", date: x.date, type: "জমা", name: x.member, mode: "পেল", amount: x.amount, id: x.id })),
      ...settlements.map(x => ({ typeKey: "settlement", date: x.date, type: "পরিশোধ", name: `${x.from} → ${x.to}`, mode: "দিল", amount: x.amount, id: x.id }))
    ].filter(x => !q || `${x.date} ${x.type} ${x.name} ${x.mode} ${x.amount}`.toLowerCase().includes(q)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

    histBody.innerHTML = history.length ? history.map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${r.type}</td>
        <td>${r.name}</td>
        <td>${r.mode}</td>
        <td>৳ ${money(r.amount)}</td>
        <td class="text-nowrap">
          <button class="btn btn-sm btn-outline-primary me-1" ${swapAllowed ? "" : "disabled"} onclick="editTransaction('${r.typeKey}', '${r.id}')">Edit</button>
          <button class="btn btn-sm btn-outline-danger" ${swapAllowed ? "" : "disabled"} onclick="deleteTransaction('${r.typeKey}', '${r.id}')">Delete</button>
        </td>
      </tr>
    `).join("") : `<tr><td colspan="6" class="text-center text-muted">No history found</td></tr>`;
  }
}

function renderAll() { renderDutyPage(); renderMoneyPage(); }
function showDutyTab() { document.getElementById("dutyPage").classList.remove("d-none"); document.getElementById("moneyPage").classList.add("d-none"); document.getElementById("dutyTabBtn").classList.add("active"); document.getElementById("moneyTabBtn").classList.remove("active"); renderDutyPage(); }
function showMoneyTab() { document.getElementById("dutyPage").classList.add("d-none"); document.getElementById("moneyPage").classList.remove("d-none"); document.getElementById("dutyTabBtn").classList.remove("active"); document.getElementById("moneyTabBtn").classList.add("active"); renderMoneyPage(); }
function money(n) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n || 0)); }
function applyTheme() { const theme = localStorage.getItem(STORAGE_KEYS.theme) || "light"; document.documentElement.setAttribute("data-theme", theme); }

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme();
  buildDutyData();
  renderAll();
  await initFirebase();
});
