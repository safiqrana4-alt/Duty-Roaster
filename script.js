const staff = ["হাসান", "নেওয়াজ", "শফিক"];
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
let loggedInUser = "";
let loggedInRole = "";
let otpVerified = false;
let currentOtp = "";
let swapQueue = [];
let approvalHistory = [];

const adminAccount = { user: "admin", pass: "admin123" };

const defaultUsers = {
  হাসান: { username: "hasan", password: "1111", mobile: "01700000001" },
  নেওয়াজ: { username: "newaz", password: "2222", mobile: "01700000002" },
  শফিক: { username: "shafiq", password: "3333", mobile: "01700000003" }
};

function getUsers() {
  return JSON.parse(localStorage.getItem("users")) || defaultUsers;
}

function saveUsers(users) {
  localStorage.setItem("users", JSON.stringify(users));
}

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

function adminLogin() {
  const user = document.getElementById("adminUser").value.trim();
  const pass = document.getElementById("adminPass").value.trim();
  const status = document.getElementById("adminStatus");

  if (user === adminAccount.user && pass === adminAccount.pass) {
    loggedInRole = "admin";
    status.textContent = "Admin logged in";
    status.style.color = "#166534";
  } else {
    loggedInRole = "";
    status.textContent = "Admin login failed";
    status.style.color = "#b91c1c";
    alert("Invalid admin credentials");
  }
}

function adminLogout() {
  loggedInRole = "";
  document.getElementById("adminUser").value = "";
  document.getElementById("adminPass").value = "";
  const status = document.getElementById("adminStatus");
  status.textContent = "Admin not logged in";
  status.style.color = "#475569";
}

function setUserPassword() {
  if (loggedInRole !== "admin") {
    alert("Admin login required");
    return;
  }

  const target = document.getElementById("targetUser").value;
  const username = document.getElementById("newUsername").value.trim();
  const password = document.getElementById("newPassword").value.trim();

  if (!username || !password) {
    alert("Enter username and password");
    return;
  }

  const users = getUsers();
  users[target] = { ...(users[target] || {}), username, password };
  saveUsers(users);

  document.getElementById("adminActionStatus").textContent = `${target} credentials updated`;
  document.getElementById("adminActionStatus").style.color = "#166534";
  document.getElementById("newUsername").value = "";
  document.getElementById("newPassword").value = "";
}

function loginUser() {
  const username = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value.trim();
  const status = document.getElementById("loginStatus");
  const users = getUsers();

  const matched = Object.keys(users).find(key => users[key].username === username && users[key].password === pass);

  if (matched) {
    loggedInUser = matched;
    loggedInRole = "user";
    otpVerified = false;
    currentOtp = "";
    document.getElementById("otpStatus").textContent = "OTP not verified";
    document.getElementById("otpStatus").style.color = "#475569";
    status.textContent = `Logged in as ${matched}`;
    status.style.color = "#166534";
  } else {
    loggedInUser = "";
    status.textContent = "Login failed";
    status.style.color = "#b91c1c";
    alert("Invalid username or password");
  }
}

function logoutUser() {
  loggedInUser = "";
  loggedInRole = "";
  otpVerified = false;
  currentOtp = "";
  document.getElementById("loginUser").value = "";
  document.getElementById("loginPass").value = "";
  document.getElementById("mobileNumber").value = "";
  document.getElementById("otpInput").value = "";
  document.getElementById("loginStatus").textContent = "Not logged in";
  document.getElementById("loginStatus").style.color = "#475569";
  document.getElementById("otpStatus").textContent = "OTP not verified";
  document.getElementById("otpStatus").style.color = "#475569";
}

function sendOtp() {
  if (!loggedInUser) {
    alert("Login first");
    return;
  }

  const users = getUsers();
  const mobile = document.getElementById("mobileNumber").value.trim();
  if (!mobile) {
    alert("Enter mobile number");
    return;
  }

  if (users[loggedInUser].mobile !== mobile) {
    alert("Mobile number does not match user");
    return;
  }

  currentOtp = String(Math.floor(100000 + Math.random() * 900000));
  document.getElementById("otpStatus").textContent = `OTP sent to ${mobile} (demo: ${currentOtp})`;
  document.getElementById("otpStatus").style.color = "#b45309";
}

function verifyOtp() {
  const otp = document.getElementById("otpInput").value.trim();
  const status = document.getElementById("otpStatus");

  if (!currentOtp) {
    alert("Send OTP first");
    return;
  }

  if (otp === currentOtp) {
    otpVerified = true;
    status.textContent = "OTP verified successfully";
    status.style.color = "#166534";
  } else {
    otpVerified = false;
    status.textContent = "OTP verification failed";
    status.style.color = "#b91c1c";
  }
}

function buildDutyData() {
  dutyData = [];
  let i = 0;

  for (let d = new Date(2026, 0, 1); d <= new Date(2026, 11, 31); d.setDate(d.getDate() + 1)) {
    dutyData.push({
      date: formatDate(d),
      duty: staff[i % 3]
    });
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

function updatePolicyBanner() {
  let banner = document.getElementById("policyBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "policyBanner";
    banner.className = "policy-banner";
    document.querySelector(".container").insertBefore(banner, document.querySelector(".dashboard"));
  }

  banner.innerHTML = `
    <strong>Duty Policy:</strong> user login + OTP verification + admin final approval required.
  `;
}

function renderSwapQueue() {
  const box = document.getElementById("swapQueue");
  if (!swapQueue.length) {
    box.innerHTML = "<div class='queue-item'>No pending swap request</div>";
    return;
  }

  box.innerHTML = swapQueue.map((item, idx) => `
    <div class="queue-item">
      <div>
        <strong>${item.requester}</strong> wants swap with <strong>${item.approver}</strong><br>
        ${item.firstDate} ↔ ${item.secondDate}
      </div>
      <div>
        <div>${item.status}</div>
        ${item.status === "Pending" && loggedInRole === "admin" ? `<button onclick="adminApproveSwap(${idx})">Approve</button>` : ""}
      </div>
    </div>
  `).join("");
}

function adminApproveSwap(idx) {
  if (loggedInRole !== "admin") {
    alert("Admin login required");
    return;
  }

  const item = swapQueue[idx];
  if (!item || item.status !== "Pending") return;

  performSwap(item.firstIndex, item.secondIndex);
  item.status = "Approved by admin";

  approvalHistory.push({
    by: "admin",
    action: "approved",
    date: item.secondDate,
    detail: `${item.requester} ↔ ${item.approver}`,
    time: new Date().toLocaleTimeString()
  });

  renderSwapQueue();
  renderHistory();
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
        <strong>${item.by}</strong> ${item.action} swap on ${item.date}<br>
        ${item.detail}
      </div>
      <div>${item.time}</div>
    </div>
  `).join("");
}

function filterTable() {
  const query = document.getElementById("searchInput").value.toLowerCase();
  const rows = document.querySelectorAll("#tableBody tr");

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? "" : "none";
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
      <td><button onclick="selectSwap(${index})">Swap</button></td>
    `;

    tbody.appendChild(row);
    index++;
  }

  updateSummary();
  updatePolicyBanner();
  filterTable();
}

function selectSwap(index) {
  if (!loggedInUser || !otpVerified) {
    alert("Login and OTP verification required");
    return;
  }

  const rows = document.querySelectorAll("#tableBody tr");

  if (selectedSwap === null) {
    selectedSwap = index;
    rows[index].classList.add("selected-row");
    alert("প্রথম দিন নির্বাচন হয়েছে। এখন দ্বিতীয় দিন নির্বাচন করুন।");
    return;
  }

  if (selectedSwap === index) {
    rows[index].classList.remove("selected-row");
    selectedSwap = null;
    return;
  }

  const requester = dutyData[selectedSwap].duty;
  const approver = dutyData[index].duty;

  if (loggedInUser !== approver) {
    alert("Approval শুধুমাত্র সংশ্লিষ্ট duty holder দিতে পারবে");
    rows.forEach(r => r.classList.remove("selected-row"));
    selectedSwap = null;
    return;
  }

  swapQueue.push({
    requester,
    approver,
    firstDate: dutyData[selectedSwap].date,
    secondDate: dutyData[index].date,
    firstIndex: selectedSwap,
    secondIndex: index,
    status: "Pending"
  });
  renderSwapQueue();

  approvalHistory.push({
    by: approver,
    action: "requested",
    date: dutyData[index].date,
    detail: `${requester} ↔ ${approver}`,
    time: new Date().toLocaleTimeString()
  });
  renderHistory();

  alert("Swap request created. এখন admin approve করবে।");
  rows.forEach(r => r.classList.remove("selected-row"));
  selectedSwap = null;
}

function performSwap(firstIndex, secondIndex) {
  const p1 = dutyData[firstIndex].duty;
  const p2 = dutyData[secondIndex].duty;

  if (
    (firstIndex > 0 && dutyData[firstIndex - 1].duty === p2) ||
    (firstIndex < dutyData.length - 1 && dutyData[firstIndex + 1].duty === p2)
  ) {
    alert("এই Swap করলে পরপর একই ব্যক্তির ডিউটি হতে পারে।");
    return;
  }

  if (
    (secondIndex > 0 && dutyData[secondIndex - 1].duty === p1) ||
    (secondIndex < dutyData.length - 1 && dutyData[secondIndex + 1].duty === p1)
  ) {
    alert("এই Swap করলে পরপর একই ব্যক্তির ডিউটি হতে পারে।");
    return;
  }

  dutyData[firstIndex].duty = p2;
  dutyData[secondIndex].duty = p1;

  localStorage.setItem("dutyData", JSON.stringify(dutyData));
  generateCalendar();
  renderSwapQueue();
}

const savedDuty = localStorage.getItem("dutyData");
if (savedDuty) {
  dutyData = JSON.parse(savedDuty);
} else {
  buildDutyData();
}

generateCalendar();
renderSwapQueue();
renderHistory();