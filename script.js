const staff = [
  { name: "হাসান", mobile: "01711111111", password: "1234" },
  { name: "নেওয়াজ", mobile: "01722222222", password: "1234" },
  { name: "শফিক", mobile: "01733333333", password: "1234" }
];

const days = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
const holidays = [
  "2026-02-21",
  "2026-03-26",
  "2026-04-14",
  "2026-05-01",
  "2026-08-15",
  "2026-12-16",
  "2026-12-25"
];

let dutyData = [];
let selectedSwap = null;
let swapQueue = [];
let approvalHistory = [];
let currentUser = null;

const tbody = document.getElementById("tableBody");

let summary = {
  "হাসান": { total: 0, friday: 0, holiday: 0 },
  "নেওয়াজ": { total: 0, friday: 0, holiday: 0 },
  "শফিক": { total: 0, friday: 0, holiday: 0 }
};

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isHoliday(dateStr) {
  return holidays.includes(dateStr);
}

function buildDutyData() {
  dutyData = [];
  let i = 0;
  for (let d = new Date(2026, 0, 1); d <= new Date(2026, 11, 31); d.setDate(d.getDate() + 1)) {
    dutyData.push({ date: formatDate(d), duty: staff[i % 3].name });
    i++;
  }
  localStorage.setItem("dutyData", JSON.stringify(dutyData));
}

function updateSummary() {
  document.getElementById("hasanTotal").textContent = summary["হাসান"].total;
  document.getElementById("hasanFriday").textContent = summary["হাসান"].friday;
  document.getElementById("hasanHoliday").textContent = summary["হাসান"].holiday;
  document.getElementById("newazTotal").textContent = summary["নেওয়াজ"].total;
  document.getElementById("newazFriday").textContent = summary["নেওয়াজ"].friday;
  document.getElementById("newazHoliday").textContent = summary["নেওয়াজ"].holiday;
  document.getElementById("shafiqTotal").textContent = summary["শফিক"].total;
  document.getElementById("shafiqFriday").textContent = summary["শফিক"].friday;
  document.getElementById("shafiqHoliday").textContent = summary["শফিক"].holiday;
}

function updateUserUI() {
  const loginBox = document.getElementById("loginBox");
  const userInfo = document.getElementById("userInfo");
  const currentUserName = document.getElementById("currentUserName");

  if (currentUser) {
    loginBox.style.display = "none";
    userInfo.style.display = "flex";
    currentUserName.textContent = currentUser.name;
  } else {
    loginBox.style.display = "block";
    userInfo.style.display = "none";
  }
}

function loginUser() {
  const mobile = document.getElementById("mobileInput").value.trim();
  const password = document.getElementById("passwordInput").value.trim();
  const msg = document.getElementById("loginMsg");

  if (!mobile || !password) {
    msg.textContent = "Mobile number এবং password দিতে হবে";
    return;
  }

  const user = staff.find(item => item.mobile === mobile && item.password === password);
  if (!user) {
    msg.textContent = "Invalid mobile number or password";
    return;
  }

  currentUser = user;
  localStorage.setItem("currentUser", JSON.stringify(currentUser));
  document.getElementById("mobileInput").value = "";
  document.getElementById("passwordInput").value = "";
  msg.textContent = "";
  updateUserUI();
  renderSwapQueue();
}

function logoutUser() {
  currentUser = null;
  localStorage.removeItem("currentUser");
  selectedSwap = null;
  updateUserUI();
  renderSwapQueue();
}

function renderSwapQueue() {
  const box = document.getElementById("swapQueue");

  if (!swapQueue.length) {
    box.innerHTML = "<div class='queue-item'>No pending swap request</div>";
    return;
  }

  box.innerHTML = swapQueue.map(item => {
    const canRespond = currentUser && item.to === currentUser.name && item.status === "Pending Permission";
    return `
      <div class="queue-item">
        <div>
          <strong>${item.from}</strong> → <strong>${item.to}</strong><br>
          ${item.firstDate} ↔ ${item.secondDate}
        </div>
        <div>
          <span class="badge ${item.status === "Approved" ? "badge-friday" : item.status === "Rejected" ? "badge-holiday" : "badge-normal"}">${item.status}</span>
          ${canRespond ? `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
            <button onclick="approveSwap('${item.id}')">Approve</button>
            <button class="reject-btn" onclick="rejectSwap('${item.id}')">Reject</button>
          </div>` : `<div style="margin-top:8px;font-size:12px;color:#64748b;">Only ${item.to} can respond</div>`}
        </div>
      </div>
    `;
  }).join("");
}

function renderHistory() {
  const box = document.getElementById("historyList");

  if (!approvalHistory.length) {
    box.innerHTML = "<div class='history-item'>No approval history</div>";
    return;
  }

  box.innerHTML = approvalHistory.slice().reverse().map(item => `
    <div class="history-item">
      <div>
        <strong>${item.by}</strong> ${item.action}<br>
        ${item.detail}
      </div>
      <div>${item.time}</div>
    </div>
  `).join("");
}

function filterTable() {
  const query = document.getElementById("searchInput").value.toLowerCase();
  document.querySelectorAll("#tableBody tr").forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(query) ? "" : "none";
  });
}

function generateCalendar() {
  tbody.innerHTML = "";
  summary = {
    "হাসান": { total: 0, friday: 0, holiday: 0 },
    "নেওয়াজ": { total: 0, friday: 0, holiday: 0 },
    "শফিক": { total: 0, friday: 0, holiday: 0 }
  };

  let index = 0;
  for (let d = new Date(2026, 0, 1); d <= new Date(2026, 11, 31); d.setDate(d.getDate() + 1)) {
    const row = document.createElement("tr");
    const dateStr = formatDate(d);
    const dayIndex = d.getDay();
    const dayName = days[dayIndex];
    const person = dutyData[index].duty;

    summary[person].total++;

    let status = '<span class="badge badge-normal">Normal</span>';
    if (dayIndex === 5) {
      row.classList.add("friday");
      summary[person].friday++;
      status = '<span class="badge badge-friday">Friday</span>';
    }
    if (isHoliday(dateStr)) {
      row.classList.add("holiday");
      summary[person].holiday++;
      status = '<span class="badge badge-holiday">Holiday</span>';
    }

    row.innerHTML = `
      <td>${dateStr}</td>
      <td>${dayName}</td>
      <td>${person}</td>
      <td>${status}</td>
      <td><button onclick="selectSwap(${index})">Request Swap</button></td>
    `;
    tbody.appendChild(row);
    index++;
  }

  updateSummary();
  filterTable();
}

function selectSwap(index) {
  if (!currentUser) {
    alert("আগে login করুন");
    return;
  }

  const rows = document.querySelectorAll("#tableBody tr");

  if (selectedSwap === null) {
    selectedSwap = index;
    rows[index].classList.add("selected-row");
    alert("প্রথম duty select হয়েছে। এখন দ্বিতীয় duty select করুন।");
    return;
  }

  if (selectedSwap === index) {
    rows[index].classList.remove("selected-row");
    selectedSwap = null;
    return;
  }

  const from = dutyData[selectedSwap].duty;
  const to = dutyData[index].duty;

  if (from !== currentUser.name) {
    alert("শুধু নিজের duty থেকেই request করা যাবে");
    rows.forEach(r => r.classList.remove("selected-row"));
    selectedSwap = null;
    return;
  }

  if (from === to) {
    alert("একই ব্যক্তির সাথে swap করা যাবে না");
    rows.forEach(r => r.classList.remove("selected-row"));
    selectedSwap = null;
    return;
  }

  swapQueue.push({
    id: Date.now().toString(),
    from,
    to,
    firstDate: dutyData[selectedSwap].date,
    secondDate: dutyData[index].date,
    status: "Pending Permission"
  });

  approvalHistory.push({
    by: from,
    action: "requested permission from",
    detail: `${from} -> ${to} for ${dutyData[selectedSwap].date} and ${dutyData[index].date}`,
    time: new Date().toLocaleTimeString()
  });

  renderSwapQueue();
  renderHistory();

  alert(`${to} এর অনুমতির জন্য request গেছে`);
  rows.forEach(r => r.classList.remove("selected-row"));
  selectedSwap = null;
}

function approveSwap(id) {
  if (!currentUser) return;

  const request = swapQueue.find(item => item.id === id);
  if (!request) return;

  if (request.to !== currentUser.name) {
    alert("শুধু যাকে permission চাওয়া হয়েছে, সেই approve করতে পারবে");
    return;
  }

  const i1 = dutyData.findIndex(item => item.date === request.firstDate);
  const i2 = dutyData.findIndex(item => item.date === request.secondDate);

  if (i1 !== -1 && i2 !== -1) {
    [dutyData[i1].duty, dutyData[i2].duty] = [dutyData[i2].duty, dutyData[i1].duty];
    localStorage.setItem("dutyData", JSON.stringify(dutyData));
  }

  approvalHistory.push({
    by: request.to,
    action: "approved swap",
    detail: `${request.to} approved ${request.from}'s request`,
    time: new Date().toLocaleTimeString()
  });

  swapQueue = swapQueue.filter(item => item.id !== id);
  generateCalendar();
  renderSwapQueue();
  renderHistory();
}

function rejectSwap(id) {
  if (!currentUser) return;

  const index = swapQueue.findIndex(item => item.id === id);
  if (index === -1) return;

  const request = swapQueue[index];
  if (request.to !== currentUser.name) {
    alert("শুধু যাকে permission চাওয়া হয়েছে, সেই reject করতে পারবে");
    return;
  }

  approvalHistory.push({
    by: request.to,
    action: "rejected swap",
    detail: `${request.to} rejected ${request.from}'s request`,
    time: new Date().toLocaleTimeString()
  });

  swapQueue.splice(index, 1);
  renderSwapQueue();
  renderHistory();
}

const savedDuty = localStorage.getItem("dutyData");
if (savedDuty) dutyData = JSON.parse(savedDuty);
else buildDutyData();

const savedUser = localStorage.getItem("currentUser");
if (savedUser) currentUser = JSON.parse(savedUser);

generateCalendar();
updateUserUI();
renderSwapQueue();
renderHistory();
