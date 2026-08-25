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

function dbRef(path) {
  return firebase.database().ref(path);
}

function saveToDB(path, value) {
  return dbReady ? dbRef(path).set(value) : Promise.resolve();
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function inRange(date, start, end) {
  return date >= start && date <= end;
}

function showToast(message, type = "primary") {
  const wrap = document.getElementById("toastContainer");
  if (!wrap) return;

  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto"
        onclick="this.closest('.toast').remove()"></button>
    </div>`;

  wrap.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 1800 });
  toast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

function getLeaveByDateAndMember(date, member) {
  return leaves.find(x =>
    x.member === member && inRange(date, x.start, x.end)
  );
}

function getAvailableMembers(date) {
  return members.filter(name => !getLeaveByDateAndMember(date, name));
}

function getNextAvailableMember(date, startIndex, previous) {
  if (!members.length) return "-";

  const available = getAvailableMembers(date);
  if (!available.length) return members[startIndex % members.length];

  for (let i = 0; i < members.length; i++) {
    const name = members[(startIndex + i) % members.length];
    if (available.includes(name) && name !== previous) return name;
  }

  return available[0];
}

function getNextDay(date) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return formatDate(d);
}

function buildDutyData() {
  if (!members.length) return;

  const oldData = dutyData.slice();
  const today = todayISO();
  const nextDay = getNextDay(today);
  const result = [];

  let previous = oldData.find(x => x.date === today)?.duty || null;

  for (let offset = -90; offset <= 180; offset++) {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + offset);

    const date = formatDate(d);
    const old = oldData.find(x => x.date === date);
    let duty;

    if (date < nextDay && old && members.includes(old.duty)) {
      duty = old.duty;
    } else {
      let startIndex = previous ? members.indexOf(previous) + 1 : 0;
      if (startIndex < 0) startIndex = 0;
      duty = getNextAvailableMember(date, startIndex, previous);
    }

    result.push({ date, duty });
    previous = duty;
  }

  dutyData = result;
  if (!dutyBackup.length) dutyBackup = result.map(x => ({ ...x }));
  saveToDB("dutyData", dutyData);
}

function rebuildFutureDuty() {
  if (!members.length) return;

  const today = todayISO();
  const nextDay = getNextDay(today);
  const result = dutyData.map(x => ({ ...x }));
  let previous = result.find(x => x.date === today)?.duty || null;

  result.forEach(item => {
    if (item.date < nextDay) return;

    const oldIndex = previous ? members.indexOf(previous) + 1 : 0;
    item.duty = getNextAvailableMember(
      item.date,
      Math.max(oldIndex, 0),
      previous
    );
    previous = item.duty;
  });

  dutyData = result;
  saveToDB("dutyData", dutyData);
}

function setupRealtimeListeners() {
  dbRef("members").on("value", snap => {
    const value = snap.val();
    members = Array.isArray(value) && value.length
      ? value
      : defaultMembers.slice();

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
    renderAll();
  });

  dbRef("swapAllowed").on("value", snap => {
    swapAllowed = !!snap.val();

    if (!swapAllowed) {
      swapPick1 = null;
      swapPick2 = null;
    }

    document.getElementById("leaveFeatures")
      ?.classList.toggle("d-none", !swapAllowed);
    document.getElementById("leaveActionTh")
      ?.classList.toggle("d-none", !swapAllowed);
    document.getElementById("historyActionTh")
      ?.classList.toggle("d-none", !swapAllowed);

    renderAll();
  });

  dbRef("dutyData").on("value", snap => {
    dutyData = snap.val() || [];

    if (!dutyData.length) {
      buildDutyData();
    } else if (!dutyBackup.length) {
      dutyBackup = dutyData.map(x => ({ ...x }));
    }

    renderAll();
  });
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

function updateTabButton() {
  const button = document.getElementById("tabToggleBtn");
  if (button) button.textContent = currentTab === "duty" ? "হিসাব" : "ডিউটি";
}

function toggleTab() {
  currentTab = currentTab === "duty" ? "money" : "duty";
  renderAll();
}

function populateMemberSelects() {
  const options = `<option value="">আপনার নাম</option>` +
    members.map(name => `<option value="${name}">${name}</option>`).join("");

  ["depositMember", "settlementFrom", "settlementTo", "leaveMember"]
    .forEach(id => {
      const select = document.getElementById(id);
      if (select) select.innerHTML = options;
    });

  const removeSelect = document.getElementById("removeMemberSelect");
  if (removeSelect) {
    removeSelect.innerHTML =
      `<option value="">Remove করার জন্য নাম নির্বাচন করুন</option>` +
      members.map(name => `<option value="${name}">${name}</option>`).join("");
  }
}

function addMember() {
  if (!swapAllowed) return;

  const input = document.getElementById("newMemberName");
  const name = input?.value.trim() || "";

  if (!name) return showToast("মেমবারের নাম লিখুন", "danger");
  if (members.includes(name)) {
    return showToast("এই মেমবার আগে থেকেই আছে", "warning");
  }

  members.push(name);

  saveToDB("members", members).then(() => {
    rebuildFutureDuty();

    if (input) input.value = "";
    renderAll();
    showToast(`${name} পরের দিনের duty rotation-এ যুক্ত হয়েছে`, "success");
  });
}

function removeMember(name) {
  if (!swapAllowed) return;

  if (!name) {
    return showToast("Remove করার জন্য নাম নির্বাচন করুন", "warning");
  }

  if (members.length <= 1) {
    return showToast("কমপক্ষে একজন মেমবার রাখতে হবে", "danger");
  }

  if (!confirm(`${name} কে মেমবার তালিকা থেকে Remove করবেন?`)) return;

  members = members.filter(member => member !== name);

  saveToDB("members", members).then(() => {
    rebuildFutureDuty();
    renderAll();
    showToast("মেমবার Remove হয়েছে; পুরোনো history সংরক্ষিত আছে", "success");
  });
}

function moveMember(name, direction) {
  if (!swapAllowed) return;

  const index = members.indexOf(name);
  const newIndex = index + direction;

  if (index < 0 || newIndex < 0 || newIndex >= members.length) return;

  [members[index], members[newIndex]] = [members[newIndex], members[index]];

  saveToDB("members", members).then(() => {
    rebuildFutureDuty();
    renderAll();
    showToast("ডিউটি রোটেশন আপডেট হয়েছে", "success");
  });
}

function renderRotationOrder() {
  const list = document.getElementById("rotationOrderList");
  if (!list) return;

  list.innerHTML = members.map((name, index) => `
    <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-2">
      <span><strong>${index + 1}.</strong> ${name}</span>
      <div class="d-flex gap-1">
        <button class="btn btn-sm btn-outline-secondary rotation-up"
          data-member="${encodeURIComponent(name)}"
          ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="btn btn-sm btn-outline-secondary rotation-down"
          data-member="${encodeURIComponent(name)}"
          ${index === members.length - 1 ? "disabled" : ""}>↓</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".rotation-up").forEach(button => {
    button.onclick = () =>
      moveMember(decodeURIComponent(button.dataset.member), -1);
  });

  list.querySelectorAll(".rotation-down").forEach(button => {
    button.onclick = () =>
      moveMember(decodeURIComponent(button.dataset.member), 1);
  });
}

function renderMemberManage() {
  const leaveFeatures = document.getElementById("leaveFeatures");
  const swapBox = document.getElementById("swapStatusBox");

  if (!leaveFeatures || !swapAllowed) {
    document.getElementById("memberManageBox")?.remove();
    return;
  }

  let box = document.getElementById("memberManageBox");

  if (!box) {
    box = document.createElement("section");
    box.id = "memberManageBox";
    box.className = "card app-card mb-3";
    box.innerHTML = `
      <div class="card-header">
        <h5 class="mb-0">Member Add / Remove</h5>
      </div>
      <div class="card-body">
        <form id="memberForm" class="d-flex gap-2 flex-wrap"
          onsubmit="event.preventDefault(); addMember();">
          <input id="newMemberName" class="form-control"
            style="max-width:320px"
            placeholder="নতুন মেমবারের নাম লিখুন" required>
          <button class="btn btn-primary" type="submit">Add Member</button>
        </form>

        <div class="d-flex gap-2 flex-wrap mt-3">
          <select id="removeMemberSelect" class="form-select"
            style="max-width:320px"></select>
          <button class="btn btn-outline-danger" type="button"
            onclick="removeMember(document.getElementById('removeMemberSelect').value)">
            Remove Member
          </button>
        </div>

        <hr>
        <h6>ডিউটি রোটেশন ক্রম</h6>
        <small class="text-muted">
          তালিকার উপরের নামের পরে পরের নামের ডিউটি হবে।
        </small>
        <div id="rotationOrderList" class="mt-2"></div>
      </div>`;

    leaveFeatures.insertBefore(box, swapBox);
  }

  populateMemberSelects();
  renderRotationOrder();
}

function saveLeave() {
  const member = document.getElementById("leaveMember")?.value || "";
  const start = document.getElementById("leaveStart")?.value || "";
  const end = document.getElementById("leaveEnd")?.value || "";

  if (!member || !start || !end || start > end) {
    return showToast("সঠিক leave দিন", "danger");
  }

  if (editingLeaveId) {
    const item = leaves.find(x => x.id === editingLeaveId);
    if (item) Object.assign(item, { member, start, end });
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

function getDutyForDate(date) {
  const item = dutyData.find(x => x.date === date);
  return item?.duty || "-";
}

function selectDutySwap(date) {
  if (!swapAllowed) return;

  if (swapPick1?.date === date || swapPick2?.date === date) {
    swapPick1 = null;
    swapPick2 = null;
  } else if (!swapPick1) {
    swapPick1 = { date };
  } else if (!swapPick2) {
    swapPick2 = { date };
  }

  renderAll();
}

function generateCalendar() {
  const tbody = document.getElementById("tableBody");
  if (!tbody) return;

  tbody.innerHTML = "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = -DUTY_PAST_DAYS; offset <= DUTY_FUTURE_DAYS; offset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);

    const dateStr = formatDate(date);
    const dayName = days[date.getDay()];
    const holiday = holidays[dateStr];
    const selected = swapPick1?.date === dateStr || swapPick2?.date === dateStr;

    const row = document.createElement("tr");
    row.className = [
      offset === 0 ? "today-row" : "",
      holiday ? `holiday-row ${holiday.className}` : "",
      dayName === "শুক্রবার" ? "friday-row" : "",
      selected ? "selected-row" : ""
    ].filter(Boolean).join(" ");

    row.onclick = () => selectDutySwap(dateStr);
    row.innerHTML = `
      <td>${dateStr}</td>
      <td>${dayName}</td>
      <td>${getDutyForDate(dateStr)}</td>`;

    tbody.appendChild(row);
  }

  tbody.querySelector(".today-row")?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function performDutySwap() {
  if (!swapPick1 || !swapPick2) {
    return showToast("দুটি date select করুন", "danger");
  }

  const a = dutyData.find(x => x.date === swapPick1.date);
  const b = dutyData.find(x => x.date === swapPick2.date);

  if (!a || !b) return showToast("দলিল পাওয়া যায়নি", "danger");

  [a.duty, b.duty] = [b.duty, a.duty];

  saveToDB("dutyData", dutyData).then(() => {
    swapPick1 = null;
    swapPick2 = null;
    renderAll();
    showToast("Duty swapped", "success");
  });
}

function shiftAllDuty(direction) {
  if (!swapAllowed) return;

  if (!dutyData.length) {
    return showToast("ডিউটি ডাটা পাওয়া যায়নি", "danger");
  }

  const sortedData = dutyData
    .map(item => ({ ...item }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const shiftedData = sortedData.map((item, index) => {
    let sourceIndex;

    if (direction === "up") {
      sourceIndex = index + 1;
    } else {
      sourceIndex = index - 1;
    }

    const source = sortedData[sourceIndex];

    return {
      ...item,
      duty: source?.duty || item.duty
    };
  });

  dutyData = shiftedData;
  swapPick1 = null;
  swapPick2 = null;

  saveToDB("dutyData", dutyData).then(() => {
    renderAll();
    showToast(
      direction === "up"
        ? "সবার ডিউটি ১ রো উপরে সরানো হয়েছে"
        : "সবার ডিউটি ১ রো নিচে সরানো হয়েছে",
      "success"
    );
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

function updateSwapStatus() {
  const box = document.getElementById("swapStatusBox");
  if (!box) return;

  box.className = `alert ${swapAllowed ? "alert-success" : "alert-danger"} py-2 mb-0`;
  box.innerHTML = swapAllowed
    ? `<div class="d-flex flex-column gap-2">
        <span>Swap enabled from Firebase</span>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-sm btn-warning" type="button"
            onclick="performDutySwap()"
            ${!swapPick1 || !swapPick2 ? "disabled" : ""}>Swap Now</button>

          <button class="btn btn-sm btn-primary" type="button"
            onclick="shiftAllDuty('up')">
            ১ রো উপরে
          </button>

          <button class="btn btn-sm btn-secondary" type="button"
            onclick="shiftAllDuty('down')">
            ১ রো নিচে
          </button>

          <button class="btn btn-sm btn-outline-danger" type="button"
            onclick="resetDutySchedule()">Reset</button>

          <button class="btn btn-sm btn-danger" type="button"
            onclick="toggleSwapAllowed()">Disable Swap</button>
        </div>
      </div>`
    : "Swap disabled from Firebase";
}

function toggleSwapAllowed() {
  saveToDB("swapAllowed", !swapAllowed).then(() => {
    showToast(!swapAllowed ? "Swap enabled" : "Swap disabled");
  });
}

function renderLeaveList() {
  const body = document.getElementById("leaveBody");
  if (!body) return;

  body.innerHTML = leaves.length
    ? leaves.map(l => `
      <tr>
        <td>${l.member}</td>
        <td>${l.start}</td>
        <td>${l.end}</td>
        <td class="${swapAllowed ? "" : "d-none"}">
          <button class="btn btn-sm btn-outline-primary me-1"
            onclick="editLeave('${l.id}')">Edit</button>
          <button class="btn btn-sm btn-outline-danger"
            onclick="deleteLeave('${l.id}')">Delete</button>
        </td>
      </tr>`).join("")
    : `<tr><td colspan="${swapAllowed ? 4 : 3}"
        class="text-center text-muted">No leave found</td></tr>`;
}

function getTotalDeposit() {
  return deposits.reduce((sum, x) => sum + Number(x.amount || 0), 0);
}

function getShare() {
  return members.length ? getTotalDeposit() / members.length : 0;
}

function getReceived(name) {
  return deposits.filter(x => x.member === name)
    .reduce((sum, x) => sum + Number(x.amount || 0), 0);
}

function getSettlementPaid(name) {
  return settlements.filter(x => x.from === name)
    .reduce((sum, x) => sum + Number(x.amount || 0), 0);
}

function getSettlementReceived(name) {
  return settlements.filter(x => x.to === name)
    .reduce((sum, x) => sum + Number(x.amount || 0), 0);
}

function getBaseSettlement() {
  const balances = members.map(name => ({
    name,
    balance: getReceived(name) - getShare() -
      getSettlementPaid(name) + getSettlementReceived(name)
  }));

  const givers = balances.filter(x => x.balance > 0)
    .map(x => ({ name: x.name, amount: x.balance }))
    .sort((a, b) => b.amount - a.amount);

  const takers = balances.filter(x => x.balance < 0)
    .map(x => ({ name: x.name, amount: Math.abs(x.balance) }))
    .sort((a, b) => b.amount - a.amount);

  const result = [];
  let i = 0;
  let j = 0;

  while (i < givers.length && j < takers.length) {
    const amount = Math.min(givers[i].amount, takers[j].amount);
    result.push({ from: givers[i].name, to: takers[j].name, amount });

    givers[i].amount -= amount;
    takers[j].amount -= amount;

    if (!givers[i].amount) i++;
    if (!takers[j].amount) j++;
  }

  return result;
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
    id: editingTx?.type === "deposit" ? editingTx.id : crypto.randomUUID(),
    member,
    amount,
    date: editingTx?.date || todayISO()
  };

  if (editingTx?.type === "deposit") {
    const index = deposits.findIndex(x => x.id === editingTx.id);
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
  const amount = Number(document.getElementById("settlementAmount")?.value || 0);

  if (!from || !to || from === to || amount <= 0) {
    return showToast("সঠিক settlement দিন", "danger");
  }

  const data = {
    id: editingTx?.type === "settlement" ? editingTx.id : crypto.randomUUID(),
    from,
    to,
    amount,
    date: editingTx?.date || todayISO()
  };

  if (editingTx?.type === "settlement") {
    const index = settlements.findIndex(x => x.id === editingTx.id);
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
  const list = type === "deposit" ? deposits : settlements;
  const item = list.find(x => x.id === id);
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

function renderMoneyPage() {
  populateMemberSelects();

  const remaining = getBaseSettlement();
  const calcBody = document.getElementById("settlementCalcBody");

  if (calcBody) {
    calcBody.innerHTML = remaining.length
      ? remaining.map(x => `
        <tr>
          <td>${x.from}</td>
          <td>${x.to}</td>
          <td>৳ ${money(x.amount)}</td>
        </tr>`).join("")
      : `<tr><td colspan="3" class="text-center">No Remaining Settlement</td></tr>`;
  }

  document.getElementById("noRemainingBox")
    ?.classList.toggle("d-none", remaining.length !== 0);

  const body = document.getElementById("historyBody");
  if (!body) return;

  const query = document.getElementById("historySearch")
    ?.value.trim().toLowerCase() || "";

  const history = [
    ...deposits.map(x => ({
      typeKey: "deposit",
      date: x.date,
      type: "জমা",
      name: x.member,
      mode: "পেল",
      amount: x.amount,
      id: x.id
    })),
    ...settlements.map(x => ({
      typeKey: "settlement",
      date: x.date,
      type: "পরিশোধ",
      name: `${x.from} → ${x.to}`,
      mode: "দিল",
      amount: x.amount,
      id: x.id
    }))
  ]
    .filter(x => !query ||
      `${x.date} ${x.type} ${x.name} ${x.mode} ${x.amount}`
        .toLowerCase().includes(query))
    .sort((a, b) => b.date.localeCompare(a.date));

  const rows = query ? history : history.slice(0, 10);

  body.innerHTML = rows.length
    ? rows.map(x => `
      <tr>
        <td>${x.date}</td>
        <td>${x.type}</td>
        <td>${x.name}</td>
        <td>${x.mode}</td>
        <td>৳ ${money(x.amount)}</td>
        <td class="text-nowrap ${swapAllowed ? "" : "d-none"}">
          <button class="btn btn-sm btn-outline-primary me-1"
            onclick="editTransaction('${x.typeKey}','${x.id}')">Edit</button>
          <button class="btn btn-sm btn-outline-danger"
            onclick="deleteTransaction('${x.typeKey}','${x.id}')">Delete</button>
        </td>
      </tr>`).join("")
    : `<tr><td colspan="${swapAllowed ? 6 : 5}"
        class="text-center text-muted">No history found</td></tr>`;
}

function renderDutyPage() {
  generateCalendar();
  renderLeaveList();
  renderMemberManage();
  populateMemberSelects();
  updateSwapStatus();
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

function scheduleMidnightRefresh() {
  if (midnightTimer) clearTimeout(midnightTimer);

  const now = new Date();
  const next = new Date();
  next.setHours(24, 0, 5, 0);

  midnightTimer = setTimeout(() => {
    buildDutyData();
    renderAll();
    scheduleMidnightRefresh();
  }, next - now);
}

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme();
  renderAll();
  await initFirebase();
  scheduleMidnightRefresh();
});
