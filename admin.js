const ADMIN_SESSION_KEY = "duty_roster_admin";

let isAdmin = false;
let adjustmentBusy = false;
let lastDutySignature = "";

function updateAdminUI() {
  document.getElementById("downloadDutyBtn")
    ?.classList.toggle("d-none", !isAdmin);

  document.querySelector(".top-tabs")
    ?.classList.toggle("admin-active", isAdmin);

  updateMonthSelector();
  updateMoneyDownloadButton();
}

function setAdminAccess(allowed) {
  isAdmin = Boolean(allowed);

  if (isAdmin) sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
  else sessionStorage.removeItem(ADMIN_SESSION_KEY);

  updateAdminUI();
  if (typeof renderAll === "function") renderAll();
}

function getMonthRange() {
  const now = new Date();
  return {
    start: formatDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: formatDate(new Date(now.getFullYear(), now.getMonth() + 2, 0))
  };
}

function getDownloadableDutyData() {
  const { start, end } = getMonthRange();

  return dutyData
    .filter(item => item.date >= start && item.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getCurrentAndNextMonths() {
  const now = new Date();

  return [
    formatDate(new Date(now.getFullYear(), now.getMonth(), 1)).slice(0, 7),
    formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 1)).slice(0, 7)
  ];
}

function getMonthLabel(month) {
  const [year, monthNumber] = month.split("-");

  return new Intl.DateTimeFormat("bn-BD", {
    year: "numeric",
    month: "long"
  }).format(new Date(Number(year), Number(monthNumber) - 1, 1));
}

function getAnnualDates() {
  const start = new Date(`${todayISO()}T00:00:00`);
  const dates = [];

  for (let i = 0; i < 365; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(formatDate(date));
  }

  return dates;
}

function getAvailableForDate(date) {
  return typeof getAvailableMembers === "function"
    ? getAvailableMembers(date)
    : members.slice();
}

function canUseDuty(sortedData, index, duty) {
  if (!duty) return false;

  const item = sortedData[index];
  if (!getAvailableForDate(item.date).includes(duty)) return false;

  const previous = sortedData[index - 1]?.duty;
  return previous !== duty;
}

function getFridayNumber(date, sortedData) {
  const month = date.slice(0, 7);

  return sortedData.filter(item => {
    const d = new Date(`${item.date}T00:00:00`);
    return item.date.startsWith(month) && d.getDay() === 5;
  }).findIndex(item => item.date === date) + 1;
}

function trySwapFridayDuty(sortedData, fridayIndex, previousFridayDuty) {
  const friday = sortedData[fridayIndex];

  if (!friday || friday.duty !== previousFridayDuty) return false;
  if (friday.date < todayISO()) return false;

  const fridayDate = new Date(`${friday.date}T00:00:00`);

  for (const offset of [-1, 1]) {
    const adjacentDate = new Date(fridayDate);
    adjacentDate.setDate(fridayDate.getDate() + offset);

    const adjacentIndex = sortedData.findIndex(
      item => item.date === formatDate(adjacentDate)
    );

    if (adjacentIndex < 0) continue;

    const adjacent = sortedData[adjacentIndex];
    const oldFridayDuty = friday.duty;
    const oldAdjacentDuty = adjacent.duty;

    if (!oldAdjacentDuty || oldAdjacentDuty === oldFridayDuty) continue;

    friday.duty = oldAdjacentDuty;
    adjacent.duty = oldFridayDuty;

    const fridayValid = canUseDuty(sortedData, fridayIndex, friday.duty);
    const adjacentValid = canUseDuty(
      sortedData,
      adjacentIndex,
      adjacent.duty
    );

    const nextToFriday = sortedData[fridayIndex + 1]?.duty;
    const nextToAdjacent = sortedData[adjacentIndex + 1]?.duty;

    if (
      fridayValid &&
      adjacentValid &&
      nextToFriday !== friday.duty &&
      nextToAdjacent !== adjacent.duty
    ) {
      return true;
    }

    friday.duty = oldFridayDuty;
    adjacent.duty = oldAdjacentDuty;
  }

  return false;
}

function enforceMonthlyFridayRotation(sortedData) {
  let changed = false;

  const months = [...new Set(
    sortedData.map(item => item.date.slice(0, 7))
  )].sort();

  months.forEach((month, index) => {
    if (!index) return;

    const previousMonth = months[index - 1];

    const previousFridays = sortedData.filter(item => {
      const d = new Date(`${item.date}T00:00:00`);
      return item.date.startsWith(previousMonth) && d.getDay() === 5;
    });

    const currentFridays = sortedData.filter(item => {
      const d = new Date(`${item.date}T00:00:00`);
      return item.date.startsWith(month) && d.getDay() === 5;
    });

    currentFridays.forEach(friday => {
      const number = getFridayNumber(friday.date, sortedData);
      const previousFriday = previousFridays[number - 1];

      if (!previousFriday || friday.duty !== previousFriday.duty) return;

      const fridayIndex = sortedData.findIndex(
        item => item.date === friday.date
      );

      if (trySwapFridayDuty(
        sortedData,
        fridayIndex,
        previousFriday.duty
      )) {
        changed = true;
      }
    });
  });

  return changed;
}

function buildAnnualSchedule() {
  if (!members.length || !Array.isArray(dutyData)) return;

  const today = todayISO();
  const annualDates = getAnnualDates();
  const existing = new Map(dutyData.map(item => [item.date, item.duty]));

  const sorted = dutyData
    .map(item => ({ ...item }))
    .sort((a, b) => a.date.localeCompare(b.date));

  annualDates.forEach(date => {
    if (!sorted.some(item => item.date === date)) {
      sorted.push({ date, duty: "" });
    }
  });

  sorted.sort((a, b) => a.date.localeCompare(b.date));

  const annualItems = sorted.filter(item =>
    annualDates.includes(item.date)
  );

  const counts = Object.fromEntries(
    members.map(member => [member, 0])
  );

  const targetBase = Math.floor(365 / members.length);
  const remainder = 365 % members.length;

  const historicalCounts = Object.fromEntries(
    members.map(member => [member, 0])
  );

  sorted.forEach(item => {
    if (
      item.date < today &&
      members.includes(item.duty)
    ) {
      historicalCounts[item.duty]++;
    }
  });

  const priority = members
    .slice()
    .sort((a, b) =>
      historicalCounts[a] - historicalCounts[b] ||
      members.indexOf(a) - members.indexOf(b)
    );

  const targets = Object.fromEntries(
    members.map(member => [member, targetBase])
  );

  priority.slice(0, remainder).forEach(member => {
    targets[member]++;
  });

  let previousDuty = sorted.find(item => item.date === today - 1)?.duty || null;

  annualItems.forEach((item, index) => {
    const available = getAvailableForDate(item.date);

    const candidates = available
      .filter(member => member !== previousDuty)
      .sort((a, b) =>
        (targets[a] - counts[a]) -
        (targets[b] - counts[b]) ||
        counts[a] - counts[b] ||
        historicalCounts[a] - historicalCounts[b] ||
        members.indexOf(a) - members.indexOf(b)
      );

    const selected =
      candidates[0] ||
      available[0] ||
      members[index % members.length];

    item.duty = selected;
    counts[selected]++;
    previousDuty = selected;
  });

  enforceMonthlyFridayRotation(sorted);

  const signature = sorted
    .map(item => `${item.date}:${item.duty}`)
    .join("|");

  const oldSignature = dutyData
    .map(item => `${item.date}:${item.duty}`)
    .join("|");

  if (signature === oldSignature || signature === lastDutySignature) return;

  lastDutySignature = signature;
  dutyData = sorted;
  adjustmentBusy = true;

  saveToDB("dutyData", dutyData).finally(() => {
    adjustmentBusy = false;
    renderAll();
  });
}

function balanceMonthlyDuty() {
  buildAnnualSchedule();
}

function csvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(rows, filename) {
  const csv = "\uFEFF" + rows
    .map(row => row.map(csvValue).join(","))
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function updateMonthSelector() {
  const downloadButton = document.getElementById("downloadDutyBtn");

  if (!downloadButton || !isAdmin) return;

  let select = document.getElementById("downloadMonthSelect");

  if (!select) {
    select = document.createElement("select");
    select.id = "downloadMonthSelect";
    select.className = "form-select";
    select.style.maxWidth = "240px";
    select.title = "মাস নির্বাচন করুন";

    downloadButton.parentElement?.insertBefore(select, downloadButton);
  }

  const oldValue = select.value;
  const months = getCurrentAndNextMonths();

  select.innerHTML = `
    <option value="">রানিং মাস + পরের মাস</option>
    ${months.map(month => `
      <option value="${month}">${getMonthLabel(month)}</option>
    `).join("")}
  `;

  if (months.includes(oldValue)) select.value = oldValue;
}

function downloadDutyData() {
  if (!isAdmin) {
    showToast("ডাউনলোড করার অনুমতি নেই", "danger");
    return;
  }

  const selectedMonth =
    document.getElementById("downloadMonthSelect")?.value || "";

  let data = getDownloadableDutyData();

  if (selectedMonth) {
    data = data.filter(item => item.date.startsWith(selectedMonth));
  }

  if (!data.length) {
    showToast("ডাউনলোড করার মতো ডিউটি পাওয়া যায়নি", "warning");
    return;
  }

  const rows = [
    ["তারিখ", "বার", "ডিউটি"],
    ...data.map(item => {
      const date = new Date(`${item.date}T00:00:00`);
      return [item.date, days[date.getDay()], item.duty || "-"];
    })
  ];

  downloadCsv(
    rows,
    selectedMonth
      ? `duty-roster-${selectedMonth}.csv`
      : "duty-roster-current-and-next-month.csv"
  );

  showToast("ডিউটি ডাউনলোড হয়েছে", "success");
}

function updateMoneyDownloadButton() {
  const moneyPage = document.getElementById("moneyPage");
  if (!moneyPage) return;

  let button = document.getElementById("downloadMoneyBtn");

  if (!isAdmin) {
    button?.remove();
    return;
  }

  if (!button) {
    button = document.createElement("button");
    button.id = "downloadMoneyBtn";
    button.type = "button";
    button.className = "btn btn-success mb-3";
    button.innerHTML =
      '<i class="bi bi-download me-1"></i>টাকার হিসাব ডাউনলোড';

    moneyPage.firstElementChild?.before(button);
    button.addEventListener("click", downloadMoneyData);
  }
}

function downloadMoneyData() {
  if (!isAdmin) {
    showToast("ডাউনলোড করার অনুমতি নেই", "danger");
    return;
  }

  const rows = [
    ["টাকার হিসাব"],
    [],
    ["বর্তমান মোট জমা", getTotalDeposit()],
    ["প্রতি সদস্যের শেয়ার", getShare()],
    [],
    ["বর্তমান বকেয়া হিসাব"],
    ["দিবে", "পাবে", "Amount"],
    ...getBaseSettlement().map(item => [
      item.from,
      item.to,
      item.amount
    ]),
    [],
    ["Transaction History"],
    ["Date", "Type", "নাম", "পেল/দিল", "Amount"],
    ...deposits.map(item => [
      item.date,
      "জমা",
      item.member,
      "পেল",
      item.amount
    ]),
    ...settlements.map(item => [
      item.date,
      "পরিশোধ",
      `${item.from} → ${item.to}`,
      "দিল",
      item.amount
    ])
  ];

  downloadCsv(rows, `money-report-${todayISO()}.csv`);
  showToast("টাকার হিসাব ডাউনলোড হয়েছে", "success");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("downloadDutyBtn")
    ?.addEventListener("click", downloadDutyData);

  const waitForFirebase = setInterval(() => {
    if (
      typeof dbRef !== "function" ||
      typeof firebase === "undefined"
    ) {
      return;
    }

    clearInterval(waitForFirebase);

    dbRef("swapAllowed").on("value", snapshot => {
      setAdminAccess(snapshot.val() === true);
    });

    dbRef("dutyData").on("value", snapshot => {
      if (adjustmentBusy) return;

      const data = snapshot.val();

      if (Array.isArray(data) && data.length) {
        dutyData = data;
        balanceMonthlyDuty();
      }
    });
  }, 100);
});