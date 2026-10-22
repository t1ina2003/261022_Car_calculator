/**
 * 買車 vs 搭計程車 通勤成本計算器
 * 所有金額單位：新台幣（元）
 */

// 自用小客車 牌照稅 / 燃料費（元/年），依排氣量
const TAX_TABLE = {
  1200: { license: 4320, fuel: 2880 },
  1800: { license: 7120, fuel: 4800 },
  2400: { license: 11230, fuel: 6210 },
  3000: { license: 15210, fuel: 7200 },
};

const WAIT_FEE_PER_MIN = 5; // 延滯計費：每 60 秒 5 元
const COLORS = {
  taxi: "hsl(45, 100%, 58%)",
  car: "hsl(195, 95%, 60%)",
  grid: "hsla(230, 60%, 80%, 0.08)",
  text: "hsl(228, 15%, 72%)",
  stack: ["#7dd3fc", "#38bdf8", "#a78bfa", "#f472b6", "#34d399", "#fb923c", "#94a3b8"],
};

let mode = "dep"; // dep = 折舊成本、cash = 現金支出
const charts = {};
const $ = (id) => document.getElementById(id);

/* ---------- 格式化工具 ---------- */
const fmt = (n) => "NT$ " + Math.round(n).toLocaleString("zh-TW");
const fmtWan = (n) => {
  const abs = Math.abs(n);
  return abs >= 10000 ? (n / 10000).toFixed(abs >= 1e6 ? 0 : 1) + " 萬" : Math.round(n).toLocaleString("zh-TW");
};

/* ---------- 讀取參數 ---------- */
function readParams() {
  const num = (id) => parseFloat($(id).value) || 0;
  return {
    distance: num("distance"),
    workdays: num("workdays"),
    years: num("years"),
    taxiBase: num("taxiBase"),
    taxiBaseKm: num("taxiBaseKm"),
    taxiPer200: num("taxiPer200"),
    taxiWait: num("taxiWait"),
    carPrice: num("carPrice"),
    depRate: num("depRate") / 100,
    cc: $("cc").value,
    kmpl: Math.max(num("kmpl"), 0.1),
    fuelPrice: num("fuelPrice"),
    insurance: num("insurance"),
    maintenance: num("maintenance"),
    parkHome: num("parkHome"),
    parkWork: num("parkWork"),
    misc: num("misc"),
  };
}

/* ---------- 計程車計算 ---------- */
function taxiTripFare(p, d = p.distance) {
  const extraKm = Math.max(0, d - p.taxiBaseKm);
  const jumps = Math.ceil(extraKm / 0.2 - 1e-9); // 每 200 公尺跳一次
  return p.taxiBase + jumps * p.taxiPer200 + p.taxiWait * WAIT_FEE_PER_MIN;
}
const taxiYearly = (p, d = p.distance) => taxiTripFare(p, d) * 2 * p.workdays;

/* ---------- 買車計算 ---------- */
function carOperating(p, d = p.distance) {
  const tax = TAX_TABLE[p.cc];
  return {
    fuel: ((d * 2 * p.workdays) / p.kmpl) * p.fuelPrice,
    parking: (p.parkHome + p.parkWork) * 12,
    tax: tax.license + tax.fuel,
    insurance: p.insurance,
    maintenance: p.maintenance,
    misc: p.misc,
  };
}
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

/** 持有 t 年（可為小數）的車輛本身成本 */
function carCapitalCost(p, t) {
  if (mode === "cash") return t >= 0 ? p.carPrice : 0;
  return p.carPrice * (1 - Math.pow(1 - p.depRate, t)); // 定率遞減折舊
}
const carTotal = (p, t, d = p.distance) => carCapitalCost(p, t) + sum(carOperating(p, d)) * t;
const taxiTotal = (p, t, d = p.distance) => taxiYearly(p, d) * t;

/** 找出 N 年內使買車較划算的最短單程距離 */
function breakEvenDistance(p) {
  for (let d = 0.5; d <= 100; d += 0.1) {
    if (taxiTotal(p, p.years, d) >= carTotal(p, p.years, d)) return d;
  }
  return null;
}

/** 找出累積成本交叉的月份（買車開始較省） */
function crossoverMonth(p) {
  for (let m = 1; m <= p.years * 12; m++) {
    if (carTotal(p, m / 12) <= taxiTotal(p, m / 12)) return m;
  }
  return null;
}

/* ---------- 更新畫面 ---------- */
function updateOutputs(p) {
  $("out-distance").textContent = p.distance + " km";
  $("out-workdays").textContent = p.workdays + " 天";
  $("out-years").textContent = p.years + " 年";
}

function updateKpis(p) {
  const N = p.years;
  const totalDays = N * p.workdays;
  const taxiN = taxiTotal(p, N);
  const carN = carTotal(p, N);
  const diff = carN - taxiN;

  $("kpi-taxi-day").textContent = fmt(taxiTripFare(p) * 2);
  $("kpi-taxi-trip").textContent = `單趟 ${fmt(taxiTripFare(p))}｜年 ${fmtWan(taxiYearly(p))}`;
  $("kpi-car-day").textContent = fmt(carN / totalDays);
  $("kpi-car-year").textContent = `${N} 年平均每年 ${fmtWan(carN / N)}`;

  $("kpi-diff").textContent = fmtWan(Math.abs(diff));
  $("kpi-diff-sub").textContent = diff > 0 ? `${N} 年搭計程車省下` : `${N} 年買車省下`;

  const be = breakEvenDistance(p);
  $("kpi-even").textContent = be ? be.toFixed(1) + " km" : "> 100 km";

  // 結論文字
  const cross = crossoverMonth(p);
  const v = $("verdict");
  if (diff > 0) {
    v.innerHTML = `🚕 以單程 <strong>${p.distance} km</strong> 計算，${N} 年內<span class="taxi-c">搭計程車比較划算</span>，可省下 <strong class="taxi-c">${fmt(diff)}</strong>。`;
  } else {
    const when = cross ? `從第 <strong>${Math.floor((cross - 1) / 12) + 1}</strong> 年第 <strong>${((cross - 1) % 12) + 1}</strong> 個月起` : "";
    v.innerHTML = `🚗 以單程 <strong>${p.distance} km</strong> 計算，${when}<span class="car-c">買車比較划算</span>，${N} 年共省下 <strong class="car-c">${fmt(-diff)}</strong>。`;
  }
  v.style.animation = "none";
  void v.offsetWidth; // 重新觸發動畫
  v.style.animation = "";
}

/* ---------- 圖表 ---------- */
function baseOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 450 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: COLORS.text, font: { family: "Noto Sans TC" }, usePointStyle: true } },
      tooltip: {
        backgroundColor: "hsla(232, 38%, 12%, 0.95)",
        borderColor: "hsla(230, 60%, 80%, 0.2)",
        borderWidth: 1,
        padding: 12,
        callbacks: { label: (c) => ` ${c.dataset.label}：${fmt(c.parsed.y ?? c.parsed.x)}` },
      },
    },
    scales: {
      x: { ticks: { color: COLORS.text }, grid: { color: COLORS.grid } },
      y: { ticks: { color: COLORS.text, callback: (v) => fmtWan(v) }, grid: { color: COLORS.grid } },
    },
    ...extra,
  };
}

function renderCumulative(p) {
  const labels = [], taxi = [], car = [];
  for (let m = 0; m <= p.years * 12; m++) {
    labels.push(m % 12 === 0 ? `第 ${m / 12} 年` : `${Math.floor(m / 12)} 年 ${m % 12} 月`);
    taxi.push(taxiTotal(p, m / 12));
    car.push(carTotal(p, m / 12));
  }
  const ds = [
    { label: "🚕 計程車累積", data: taxi, borderColor: COLORS.taxi, backgroundColor: "hsla(45,100%,58%,0.12)", fill: true },
    { label: "🚗 買車累積", data: car, borderColor: COLORS.car, backgroundColor: "hsla(195,95%,60%,0.12)", fill: true },
  ].map((d) => ({ ...d, tension: 0.25, pointRadius: 0, borderWidth: 3 }));

  if (charts.cum) {
    charts.cum.data.labels = labels;
    charts.cum.data.datasets.forEach((d, i) => (d.data = ds[i].data));
    charts.cum.update();
    return;
  }
  const opts = baseOptions();
  opts.scales.x.ticks.autoSkip = false;
  opts.scales.x.ticks.callback = function (v, i) {
    return i % 12 === 0 ? this.getLabelForValue(v) : null;
  };
  charts.cum = new Chart($("cumChart"), { type: "line", data: { labels, datasets: ds }, options: opts });
}

function renderBreakdown(p) {
  const op = carOperating(p);
  const capital = carCapitalCost(p, p.years) / p.years;
  const parts = [
    [mode === "cash" ? "購車款(攤提)" : "折舊", capital],
    ["油費", op.fuel],
    ["停車", op.parking],
    ["稅金", op.tax],
    ["保險", op.insurance],
    ["保養", op.maintenance],
    ["雜支", op.misc],
  ];
  const datasets = parts.map(([label, v], i) => ({
    label, data: [v, 0], backgroundColor: COLORS.stack[i], borderRadius: 6, stack: "s",
  }));
  datasets.push({ label: "車資", data: [0, taxiYearly(p)], backgroundColor: COLORS.taxi, borderRadius: 6, stack: "s" });

  if (charts.brk) {
    charts.brk.data.datasets.forEach((d, i) => { d.data = datasets[i].data; d.label = datasets[i].label; });
    charts.brk.update();
    return;
  }
  const opts = baseOptions({ indexAxis: "y" });
  opts.interaction = { mode: "nearest", intersect: true };
  opts.scales = {
    x: { stacked: true, ticks: { color: COLORS.text, callback: (v) => fmtWan(v) }, grid: { color: COLORS.grid } },
    y: { stacked: true, ticks: { color: COLORS.text, font: { size: 14 } }, grid: { display: false } },
  };
  opts.plugins.legend.labels.boxWidth = 10;
  opts.plugins.legend.labels.filter = (item, data) => data.datasets[item.datasetIndex].data.some((x) => x > 0);
  opts.plugins.tooltip.callbacks.label = (c) => (c.parsed.x ? ` ${c.dataset.label}：${fmt(c.parsed.x)}` : null);
  charts.brk = new Chart($("breakChart"), { type: "bar", data: { labels: ["🚗 買車", "🚕 計程車"], datasets }, options: opts });
}

function renderDistance(p) {
  const labels = [], taxi = [], car = [];
  for (let d = 1; d <= 40; d++) {
    labels.push(d + " km");
    taxi.push(taxiTotal(p, p.years, d) / p.years);
    car.push(carTotal(p, p.years, d) / p.years);
  }
  const ds = [
    { label: "🚕 計程車／年", data: taxi, borderColor: COLORS.taxi },
    { label: "🚗 買車／年", data: car, borderColor: COLORS.car },
  ].map((d) => ({ ...d, tension: 0.2, pointRadius: 0, borderWidth: 3 }));

  if (charts.dist) {
    charts.dist.data.datasets.forEach((d, i) => (d.data = ds[i].data));
    charts.dist.update();
    return;
  }
  charts.dist = new Chart($("distChart"), { type: "line", data: { labels, datasets: ds }, options: baseOptions() });
}

/* ---------- 主流程 ---------- */
function update() {
  const p = readParams();
  updateOutputs(p);
  updateKpis(p);
  if (window.Chart) {
    renderCumulative(p);
    renderBreakdown(p);
    renderDistance(p);
  }
}

function init() {
  if (window.Chart) {
    Chart.defaults.font.family = "Outfit, 'Noto Sans TC', sans-serif";
  }
  document.querySelectorAll("input, select").forEach((el) => el.addEventListener("input", update));
  document.querySelectorAll(".toggle").forEach((btn) =>
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      document.querySelectorAll(".toggle").forEach((b) => b.classList.toggle("active", b === btn));
      update();
    })
  );
  update();
}

document.addEventListener("DOMContentLoaded", init);
