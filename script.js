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

const loaded = {
  members: false,
  leaves: false,
  dutyData: false
};

function dbRef(path) {
  return firebase.database().ref(path);
}

function saveToDB(path, value) {
  return dbReady ? dbRef(path).set(value) : Promise.resolve();
}

async function initFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
    dbReady = true;
    setupRealtimeListeners();
  } catch (error) {
    console.error(error);
    showToast("Firebase init failed", "danger");
  }
}

function setupRealtimeListeners() {
  dbRef("members").on("value", snap => {
    const data = snap.val();
    members = Array.isArray(data) && data.length ? data : defaultMembers.slice();
    loaded.members = true;
    rebuildIfRequired();
    renderAll();
  });

  dbRef("deposits").on("value", snap => {
    deposits = snap.val() ? Object.values(snap.val()) : [];
    renderAll();
  });

  dbRef("settlements").on("value", snap => {
    settlements = snap.val() ? Object.values(snap.val()) : [];
    renderAll();
  });

  dbRef("leaves").on("value", snap => {
    leaves = snap.val() ? Object.values(snap.val()) : [];
    loaded.leaves = true;
    rebuildIfRequired(true);
    renderAll();
  });

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
    dutyData = Array.isArray(snap.val()) ? snap.val() : [];
    loaded.dutyData = true;
    rebuildIfRequired();
    renderAll();
  });
}

function rebuildIfRequired(force = false) {
  if (!loaded.members || !loaded.leaves || !loaded.dutyData) return;

  const everyMemberHasDuty = members.every(member =>
    dutyData.some(item => item.duty === member)
  );

  if (force || !dutyData.length || !everyMemberHasDuty) {
    buildDutyData();
  } else if (!dutyBackup.length) {
    dutyBackup = dutyData.map(item => ({ ...item }));
  }
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayISO() {
  const d = new Date();
  return formatDate(d);
}

function inRange(dateStr, start, end) {
  return dateStr >= start && dateStr <= end;
}

function showToast(message, type = "primary") {
  const wrap = document.getElementById("toastContainer");
  if (!wrap || typeof bootstrap === "undefined") return;

  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto"
        onclick="this.closest('.toast').remove()"></button>
    </div>
  `;

  wrap.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 1800 });
  toast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

function getLeaveByDateAndMember(dateStr, member) {
  return leaves.find(leave =>
    leave.member === member && inRange(dateStr, leave.start, leave.end)
  );
}

function getAvailableMembers(dateStr) {
  return members.filter(member =>
    !getLeaveByDateAndMember(dateStr, member)
  );
}

function getNextAvailableMember(dateStr, startIndex, previousDuty) {
  const available = getAvailableMembers(dateStr);

  if (!available.length) {
    return members[startIndex % members.length];
  }

  for (let i = 0; i < members.length; i++) {
    const candidate = members[(startIndex + i) % members.length];

    if (available.includes(candidate) && candidate !== previousDuty) {
      return candidate;
    }
  }

  return available.find(name => name !== previousDuty) || available[0];
}

function buildDutyData() {
  if (!members.length) return;

  dutyData = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const base = new Date("2026-07-07T00:00:00");
  const baseIndex = members.indexOf("হাসান") >= 0
    ? members.indexOf("হাসান")
    : 0;

  let previousDuty = null;

  for (let offset = -DUTY_PAST_DAYS; offset <= DUTY_FUTURE_DAYS; offset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);

    const dateStr = formatDate(date);
    const daysFromBase = Math.round(
      (date.getTime() - base.getTime()) / 86400000
    );

    const dutyIndex =
      ((baseIndex + daysFromBase) % members.length + members.length) %
      members.length;

    const duty = getNextAvailableMember(
      dateStr,
      dutyIndex,
      previousDuty
    );

    dutyData.push({ date: dateStr, duty });
    previousDuty = duty;
  }

  dutyBackup = dutyData.map(item => ({ ...item }));
  saveToDB("dutyData", dutyData);
}

function updateTabButton() {
  const button = document.getElementById("tabToggleBtn");
  if (button) {
    button.textContent = currentTab === "duty" ? "হিসাব" : "ডিউটি";
  }
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

  if (!member || !start || !end || start > end) {
    return showToast("সঠিক leave দিন", "danger");
  }

  if (editingLeaveId) {
    const index = leaves.findIndex(item => item.id === editingLeaveId);
    if (index >= 0) {
      leaves[index] = { ...leaves[index], member, start, end };
    }
    editingLeaveId = null;
  } else {
    leaves.push({
      id: crypto.randomUUID(),
      member,
      start,
      end
    });
  }

  saveToDB("leaves", leaves).then(() => {
    buildDutyData();
    resetLeaveForm();
    renderAll();
    showToast("Leave saved", "success");
  });
}

function editLeave(id) {
  const item = leaves.find(leave => leave.id === id);
  if (!item) return;

  editingLeaveId = id;
  document.getElementById("leaveMember").value = item.member;
  document.getElementById("leaveStart").value = item.start;
  document.getElementById("leaveEnd").value = item.end;
}

function deleteLeave(id) {
  if (!confirm("Leave delete করবেন?")) return;

  leaves = leaves.filter(leave => leave.id !== id);

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
    showToast("প্রথম duty selected");
  } else if (!swapPick2) {
    swapPick2 = { date: dateStr };
    showToast("দ্বিতীয় duty selected");
  }

  renderAll();
}

function performDutySwap() {
  if (!swapPick1 || !swapPick2) {
    return showToast("দুটি date select করুন", "danger");
  }

  const first = dutyData.findIndex(item => item.date === swapPick1.date);
  const second = dutyData.findIndex(item => item.date === swapPick2.date);

  if (first < 0 || second < 0) {
    return showToast("দলিল পাওয়া যায়নি", "danger");
  }

  [dutyData[first].duty, dutyData[second].duty] =
    [dutyData[second].duty, dutyData[first].duty];

  saveToDB("dutyData", dutyData).then(() => {
    swapPick1 = null;
    swapPick2 = null;
    renderAll();
    showToast("Duty swapped", "success");
  });
}

function resetDutySchedule() {
  if (!dutyBackup.length) {
    return showToast("Backup not ready", "danger");
  }

  dutyData = dutyBackup.map(item => ({ ...item }));
  swapPick1 = null;
  swapPick2 = null;

  saveToDB("dutyData", dutyData).then(() => {
    renderAll();
    showToast("Duty reset", "success");
  });
}

function generateCalendar() {
  const tbody = document.getElementById("tableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const today = todayISO();
  const sorted = dutyData.slice().sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const todayIndex = sorted.findIndex(item => item.date === today);
  const startIndex = todayIndex >= 0 ? Math.max(0, todayIndex - 7) : 0;
  const rows = sorted.slice(startIndex, startIndex + 31);

  rows.forEach(item => {
    const date = new Date(`${item.date}T00:00:00`);
    const dayName = days[date.getDay()];
    const holiday = holidays[item.date];
    const selected =
      swapPick1?.date === item.date || swapPick2?.date === item.date;

    const row = document.createElement("tr");

    row.className = [
      item.date === today ? "today-row" : "",
      holiday ? `holiday-row ${holiday.className}` : "",
      dayName === "শুক্রবার" ? "friday-row" : "",
      selected ? "selected-row" : ""
    ].filter(Boolean).join(" ");

    row.onclick = () => selectDutySwap(item.date);
    row.innerHTML = `
      <td>${item.date}</td>
      <td>${dayName}</td>
      <td>${item.duty}</td>
    `;

    tbody.appendChild(row);
  });

  if (todayIndex >= 0) {
    tbody.querySelector(".today-row")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}

function updateSwapStatus() {
  const box = document.getElementById("swapStatusBox");
  if (!box) return;

  if (!swapAllowed) {
    box.className = "alert alert-danger py-2 mb-0";
    box.innerHTML = "<span>Swap disabled from Firebase</span>";
    return;
  }

  box.className = "alert alert-success py-2 mb-0";
  box.innerHTML = `
    <div class="d-flex flex-column gap-2">
      <span>Swap enabled from Firebase</span>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-sm btn-warning" onclick="performDutySwap()"
          ${(!swapPick1 || !swapPick2) ? "disabled" : ""}>Swap Now</button>
        <button class="btn btn-sm btn-outline-danger"
          onclick="resetDutySchedule()">Reset</button>
        <button class="btn btn-sm btn-danger"
          onclick="toggleSwapAllowed()">Disable Swap</button>
      </div>
    </div>
  `;
}

function toggleSwapAllowed() {
  saveToDB("swapAllowed", !swapAllowed).then(() => {
    showToast(
      !swapAllowed ? "Swap enabled" : "Swap disabled",
      !swapAllowed ? "success" : "warning"
    );
  });
}

function getTotalDeposit() {
  return deposits.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function getShare() {
  return members.length ? getTotalDeposit() / members.length : 0;
}

function getReceived(name) {
  return deposits
    .filter(item => item.member === name)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function getSettlementPaid(name) {
  return settlements
    .filter(item => item.from === name)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function getSettlementReceived(name) {
  return settlements
    .filter(item => item.to === name)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function getBaseSettlement() {
  const balances = members.map(name => ({
    name,
    balance:
      getReceived(name) -
      getShare() -
      getSettlementPaid(name) +
      getSettlementReceived(name)
  }));

  const givers = balances
    .filter(item => item.balance > 0)
    .map(item => ({ name: item.name, amount: item.balance }))
    .sort((a, b) => b.amount - a.amount);

  const takers = balances
    .filter(item => item.balance < 0)
    .map(item => ({ name: item.name, amount: Math.abs(item.balance) }))
    .sort((a, b) => b.amount - a.amount);

  const result = [];
  let i = 0;
  let j = 0;

  while (i < givers.length && j < takers.length) {
    const amount = Math.min(givers[i].amount, takers[j].amount);

    if (amount > 0) {
      result.push({
        from: givers[i].name,
        to: takers[j].name,
        amount
      });
    }

    givers[i].amount -= amount;
    takers[j].amount -= amount;

    if (givers[i].amount === 0) i++;
    if (takers[j].amount === 0) j++;
  }

  return result;
}

function populateMemberSelects() {
  const options =
    `<option value="">আপনার নাম</option>` +
    members.map(name => `<option value="${name}">${name}</option>`).join("");

  ["depositMember", "settlementFrom", "settlementTo", "leaveMember"]
    .forEach(id => {
      const element = document.getElementById(id);
      if (element) element.innerHTML = options;
    });
}

function renderLeaveList() {
  const body = document.getElementById("leaveBody");
  if (!body) return;

  body.innerHTML = leaves.length
    ? leaves.map(leave => `
      <tr>
        <td>${leave.member}</td>
        <td>${leave.start}</td>
        <td>${leave.end}</td>
        <td class="${swapAllowed ? "" : "d-none"}">
          <button class="btn btn-sm btn-outline-primary me-1"
            onclick="editLeave('${leave.id}')">Edit</button>
          <button class="btn btn-sm btn-outline-danger"
            onclick="deleteLeave('${leave.id}')">Delete</button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="${swapAllowed ? 4 : 3}"
        class="text-center text-muted">No leave found</td></tr>`;
}

function resetDepositForm() {
  document.getElementById("depositForm")?.reset();
}

function resetSettlementForm() {
  document.getElementById("settlementForm")?.reset();
  editingTx = null;
}

function saveDeposit() {
  const member = document.getElementById("depositMember")?.value || "";
  const amount = Number(document.getElementById("depositAmount")?.value || 0);

  if (!member || amount <= 0) {
    return showToast("সঠিক জমা দিন", "danger");
  }

  const data = {
    id: editingTx?.type === "deposit"
      ? editingTx.id
      : crypto.randomUUID(),
    member,
    amount,
    date: editingTx?.date || todayISO()
  };

  if (editingTx?.type === "deposit") {
    const index = deposits.findIndex(item => item.id === editingTx.id);
    if (index >= 0) deposits[index] = data;
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
  const amount = Number(
    document.getElementById("settlementAmount")?.value || 0
  );

  if (!from || !to || from === to || amount <= 0) {
    return showToast("সঠিক settlement দিন", "danger");
  }

  const data = {
    id: editingTx?.type === "settlement"
      ? editingTx.id
      : crypto.randomUUID(),
    from,
    to,
    amount,
    date: editingTx?.date || todayISO()
  };

  if (editingTx?.type === "settlement") {
    const index = settlements.findIndex(item => item.id === editingTx.id);
    if (index >= 0) settlements[index] = data;
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
  const item = type === "deposit"
    ? deposits.find(x => x.id === id)
    : settlements.find(x => x.id === id);

  if (!item) return;

  editingTx = {
    type,
    id,
    date: item.date
  };

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
    deposits = deposits.filter(item => item.id !== id);
    saveToDB("deposits", deposits).then(renderAll);
  } else {
    settlements = settlements.filter(item => item.id !== id);
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
      ? remaining.map(item => `
        <tr>
          <td>${item.from}</td>
          <td>${item.to}</td>
          <td>৳ ${money(item.amount)}</td>
        </tr>
      `).join("")
      : `<tr><td colspan="3" class="text-center">
          No Remaining Settlement</td></tr>`;
  }

  document.getElementById("noRemainingBox")
    ?.classList.toggle("d-none", remaining.length !== 0);

  const historyBody = document.getElementById("historyBody");
  if (!historyBody) return;

  const query =
    document.getElementById("historySearch")?.value.trim().toLowerCase() || "";

  const allHistory = [
    ...deposits.map(item => ({
      typeKey: "deposit",
      date: item.date,
      type: "জমা",
      name: item.member,
      mode: "পেল",
      amount: item.amount,
      id: item.id
    })),
    ...settlements.map(item => ({
      typeKey: "settlement",
      date: item.date,
      type: "পরিশোধ",
      name: `${item.from} → ${item.to}`,
      mode: "দিল",
      amount: item.amount,
      id: item.id
    }))
  ]
    .filter(item =>
      !query ||
      `${item.date} ${item.type} ${item.name} ${item.mode} ${item.amount}`
        .toLowerCase()
        .includes(query)
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const history = query ? allHistory : allHistory.slice(0, 10);

  historyBody.innerHTML = history.length
    ? history.map(item => `
      <tr>
        <td>${item.date}</td>
        <td>${item.type}</td>
        <td>${item.name}</td>
        <td>${item.mode}</td>
        <td>৳ ${money(item.amount)}</td>
        <td class="text-nowrap ${swapAllowed ? "" : "d-none"}">
          <button class="btn btn-sm btn-outline-primary me-1"
            onclick="editTransaction('${item.typeKey}', '${item.id}')">Edit</button>
          <button class="btn btn-sm btn-outline-danger"
            onclick="deleteTransaction('${item.typeKey}', '${item.id}')">Delete</button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="${swapAllowed ? 6 : 5}"
        class="text-center text-muted">No history found</td></tr>`;
}

function renderAll() {
  renderDutyPage();
  renderMoneyPage();

  document.getElementById("dutyPage")
    ?.classList.toggle("d-none", currentTab !== "duty");

  document.getElementById("moneyPage")
    ?.classList.toggle("d-none", currentTab !== "money");

  updateTabButton();
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function applyTheme() {
  const theme = localStorage.getItem(STORAGE_KEYS.theme) || "light";
  document.documentElement.setAttribute("data-theme", theme);
}

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme();
  renderAll();
  await initFirebase();
  scheduleMidnightRefresh();
});
