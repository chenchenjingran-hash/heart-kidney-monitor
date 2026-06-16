"use strict";

const STORAGE_KEY = "heartKidneyMonitor.v1";
const CLOUD_DIRTY_KEY = "heartKidneyMonitor.cloudDirty.v1";
const CLOUD_LOCAL_UPDATED_KEY = "heartKidneyMonitor.localUpdatedAt.v1";
const CLOUD_REMOTE_UPDATED_KEY = "heartKidneyMonitor.remoteUpdatedAt.v1";
const CLOUD_TABLE = "family_state";
const SUPABASE_URL = "https://hnwrytbwqufiktesjbth.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LwdQ_fHZJCyxSWS4kQiCvg_mV8osjjW";
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOUD_PAYLOAD_VERSION = 4;
const JIN_PER_KG = 2;
const WEIGHT_DAILY_RANGE_RISK_JIN = 4;
const WEIGHT_THREE_DAY_GAIN_RISK_JIN = 4;
const WEEKDAYS = ["??", "??", "??", "??", "??", "??", "??"];

const fieldIds = [
  "recordDate",
  "morningWeight",
  "noonWeight",
  "nightWeight",
  "morningSystolic",
  "morningDiastolic",
  "noonSystolic",
  "noonDiastolic",
  "nightSystolic",
  "nightDiastolic",
  "morningHeartRate",
  "noonHeartRate",
  "nightHeartRate",
  "morningSpo2",
  "noonSpo2",
  "nightSpo2",
  "intake1",
  "intake2",
  "intake3",
  "intake4",
  "intake5",
  "intake6",
  "intake7",
  "intake8",
  "intake9",
  "intake10",
  "intake11",
  "intake12",
  "intake13",
  "intake14",
  "intake15",
  "urine1",
  "urine2",
  "urine3",
  "urine4",
  "urine5",
  "urine6",
  "urine7",
  "urine8",
  "urine9",
  "urine10",
  "urine11",
  "urine12",
  "urine13",
  "urine14",
  "urine15",
  "edema",
  "breathing",
  "glucose",
  "notes",
];

const numericRecordFields = [
  "morningWeight",
  "noonWeight",
  "nightWeight",
  "morningSystolic",
  "morningDiastolic",
  "noonSystolic",
  "noonDiastolic",
  "nightSystolic",
  "nightDiastolic",
  "morningHeartRate",
  "noonHeartRate",
  "nightHeartRate",
  "morningSpo2",
  "noonSpo2",
  "nightSpo2",
  "intake1",
  "intake2",
  "intake3",
  "intake4",
  "intake5",
  "intake6",
  "intake7",
  "intake8",
  "intake9",
  "intake10",
  "intake11",
  "intake12",
  "intake13",
  "intake14",
  "intake15",
  "urine1",
  "urine2",
  "urine3",
  "urine4",
  "urine5",
  "urine6",
  "urine7",
  "urine8",
  "urine9",
  "urine10",
  "urine11",
  "urine12",
  "urine13",
  "urine14",
  "urine15",
  "edema",
  "breathing",
  "glucose",
];

const weightPeriods = [
  { key: "morning", label: "?", field: "morningWeight" },
  { key: "noon", label: "?", field: "noonWeight" },
  { key: "night", label: "?", field: "nightWeight" },
];

const bloodPressurePeriods = [
  { key: "morning", label: "?", systolic: "morningSystolic", diastolic: "morningDiastolic" },
  { key: "noon", label: "?", systolic: "noonSystolic", diastolic: "noonDiastolic" },
  { key: "night", label: "?", systolic: "nightSystolic", diastolic: "nightDiastolic" },
];

const heartRatePeriods = [
  { key: "morning", label: "?", field: "morningHeartRate" },
  { key: "noon", label: "?", field: "noonHeartRate" },
  { key: "night", label: "?", field: "nightHeartRate" },
];

const spo2Periods = [
  { key: "morning", label: "?", field: "morningSpo2" },
  { key: "noon", label: "?", field: "noonSpo2" },
  { key: "night", label: "?", field: "nightSpo2" },
];

const intakeFields = Array.from({ length: 15 }, (_, index) => `intake${index + 1}`);
const urineFields = Array.from({ length: 15 }, (_, index) => `urine${index + 1}`);

const labFields = [
  "ntProbnp",
  "lvef",
  "creatinine",
  "egfr",
  "potassium",
  "sodium",
  "albumin",
  "urineProtein24h",
  "uacr",
];

let toastTimer;
let state = loadState();
let cloudClient = null;
let cloudSession = null;
let cloudPushTimer = null;
let cloudSyncing = false;
let cloudDirty = localStorage.getItem(CLOUD_DIRTY_KEY) === "1";
let lastSyncedPayload = "";

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateString, amount) {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

function dateDiff(a, b) {
  return Math.round((parseLocalDate(a) - parseLocalDate(b)) / DAY_MS);
}

function formatDate(value, includeYear = false) {
  if (!value) return "?";
  const date = parseLocalDate(value);
  const monthDay = `${date.getMonth() + 1}?${date.getDate()}?`;
  return `${includeYear ? `${date.getFullYear()}?` : ""}${monthDay}?${WEEKDAYS[date.getDay()]}?`;
}

function formatShortDate(value) {
  const date = parseLocalDate(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function sampleState() {
  const today = localDateString();
  const sampleValues = [
    { offset: -6, weight: 70.1, morningSystolic: 126, morningDiastolic: 76, noonSystolic: 124, noonDiastolic: 74, nightSystolic: 128, nightDiastolic: 76, heartRate: 80, spo2: 97, intake: 1400, urine: 1450, edema: 1, breathing: 1, glucose: 5.8, notes: "" },
    { offset: -5, weight: 70.3, morningSystolic: 128, morningDiastolic: 78, noonSystolic: 126, noonDiastolic: 76, nightSystolic: 130, nightDiastolic: 78, heartRate: 82, spo2: 97, intake: 1400, urine: 1500, edema: 1, breathing: 1, glucose: 5.6, notes: "" },
    { offset: -4, weight: 70.6, morningSystolic: 130, morningDiastolic: 80, noonSystolic: 128, noonDiastolic: 78, nightSystolic: 132, nightDiastolic: 80, heartRate: 84, spo2: 96, intake: 1400, urine: 1400, edema: 1, breathing: 2, glucose: 5.9, notes: "" },
    { offset: -3, weight: 70.6, morningSystolic: 138, morningDiastolic: 86, noonSystolic: 136, noonDiastolic: 84, nightSystolic: 140, nightDiastolic: 86, heartRate: 90, spo2: 95, intake: 1500, urine: 1150, edema: 2, breathing: 3, glucose: 6.0, notes: "????????" },
    { offset: -2, weight: 71.8, morningSystolic: 132, morningDiastolic: 82, noonSystolic: 130, noonDiastolic: 80, nightSystolic: 134, nightDiastolic: 82, heartRate: 86, spo2: 96, intake: 1400, urine: 1350, edema: 1, breathing: 2, glucose: 5.7, notes: "" },
    { offset: -1, weight: 72.0, morningSystolic: 134, morningDiastolic: 84, noonSystolic: 132, noonDiastolic: 82, nightSystolic: 136, nightDiastolic: 84, heartRate: 88, spo2: 96, intake: 1400, urine: 1300, edema: 1, breathing: 2, glucose: 5.9, notes: "???????" },
    { offset: 0, weight: 72.7, morningSystolic: 140, morningDiastolic: 88, noonSystolic: 138, noonDiastolic: 86, nightSystolic: "", nightDiastolic: "", heartRate: 92, spo2: 95, intake: 1500, urine: 1200, edema: 2, breathing: 3, glucose: 6.2, notes: "??????????????????" },
  ];

  const records = sampleValues.map((item) => ({
    date: addDays(today, item.offset),
    weightUnit: "jin",
    morningWeight: kgToJin(item.weight),
    noonWeight: "",
    nightWeight: "",
    weight: kgToJin(item.weight),
    morningSystolic: item.morningSystolic,
    morningDiastolic: item.morningDiastolic,
    noonSystolic: item.noonSystolic,
    noonDiastolic: item.noonDiastolic,
    nightSystolic: item.nightSystolic,
    nightDiastolic: item.nightDiastolic,
    morningHeartRate: item.heartRate,
    noonHeartRate: "",
    nightHeartRate: "",
    heartRate: item.heartRate,
    morningSpo2: item.spo2,
    noonSpo2: "",
    nightSpo2: "",
    spo2: item.spo2,
    ...singleValueEntries(intakeFields, item.intake),
    intake: item.intake,
    ...singleValueEntries(urineFields, item.urine),
    urine: item.urine,
    edema: item.edema,
    breathing: item.breathing,
    glucose: item.glucose,
    notes: item.notes,
    updatedAt: new Date().toISOString(),
  }));

  const medications = [
    { id: cryptoId(), name: "????", morningDose: "20 mg", noonDose: "", nightDose: "20 mg", remainingCount: 12, remainingUnit: "?", taken: {} },
    { id: cryptoId(), name: "????", morningDose: "20 mg", noonDose: "", nightDose: "", remainingCount: 18, remainingUnit: "?", taken: {} },
    { id: cryptoId(), name: "???????", morningDose: "47.5 mg", noonDose: "", nightDose: "", remainingCount: 9, remainingUnit: "?", taken: {} },
    { id: cryptoId(), name: "????????", morningDose: "50 mg", noonDose: "", nightDose: "50 mg", remainingCount: 14, remainingUnit: "?", taken: {} },
  ];

  medications.forEach((medication) => {
    for (let offset = -6; offset <= 0; offset += 1) {
      const date = addDays(today, offset);
      medication.taken[date] = {
        morning: Boolean(medication.morningDose),
        noon: Boolean(medication.noonDose),
        night: offset === 0 ? false : Boolean(medication.nightDose),
      };
    }
  });

  return {
    patient: {
      name: "??",
      age: "",
      condition: "?????? ? ??????",
    },
    records,
    medications,
    labs: [
      {
        id: cryptoId(),
        date: addDays(today, -12),
        ntProbnp: 1850,
        lvef: 42,
        creatinine: 168,
        egfr: 36,
        potassium: 4.6,
        sodium: 138,
        albumin: 35,
        urineProtein24h: 1.2,
        uacr: 420,
        notes: "????",
      },
    ],
    selectedDate: today,
    weekEnd: today,
    activeView: "daily",
    summaryDays: 7,
  };
}

function cryptoId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function kgToJin(value) {
  return populatedNumber(value) ? Number((Number(value) * JIN_PER_KG).toFixed(1)) : value;
}

function singleValueEntries(fields, firstValue = "") {
  return Object.fromEntries(fields.map((field, index) => [field, index === 0 ? firstValue : ""]));
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object") return record;
  const normalized = { ...record };
  if (
    normalized.morningWeight === undefined &&
    normalized.noonWeight === undefined &&
    normalized.nightWeight === undefined
  ) {
    normalized.morningWeight = normalized.weight ?? "";
  }
  weightPeriods.forEach(({ field }) => {
    normalized[field] ??= "";
  });
  if (normalized.weightUnit !== "jin") {
    weightPeriods.forEach(({ field }) => {
      normalized[field] = kgToJin(normalized[field]);
    });
    normalized.weight = kgToJin(normalized.weight);
    normalized.weightUnit = "jin";
  }
  if (intakeFields.every((field) => normalized[field] === undefined)) {
    normalized.intake1 = normalized.intake ?? "";
  }
  if (urineFields.every((field) => normalized[field] === undefined)) {
    normalized.urine1 = normalized.urine ?? "";
  }
  [...intakeFields, ...urineFields].forEach((field) => {
    normalized[field] ??= "";
  });
  if (
    normalized.morningHeartRate === undefined &&
    normalized.noonHeartRate === undefined &&
    normalized.nightHeartRate === undefined
  ) {
    normalized.morningHeartRate = normalized.heartRate ?? "";
  }
  heartRatePeriods.forEach(({ field }) => {
    normalized[field] ??= "";
  });
  if (
    normalized.morningSpo2 === undefined &&
    normalized.noonSpo2 === undefined &&
    normalized.nightSpo2 === undefined
  ) {
    normalized.morningSpo2 = normalized.spo2 ?? "";
  }
  spo2Periods.forEach(({ field }) => {
    normalized[field] ??= "";
  });
  normalized.weight = dailyWeight(normalized);
  normalized.intake = sumRecordFields(normalized, intakeFields);
  normalized.urine = sumRecordFields(normalized, urineFields);
  normalized.heartRate = dailyVital(normalized, heartRatePeriods);
  normalized.spo2 = dailyVital(normalized, spo2Periods);
  if (
    normalized.morningSystolic === undefined &&
    normalized.morningDiastolic === undefined &&
    (normalized.systolic !== undefined || normalized.diastolic !== undefined)
  ) {
    normalized.morningSystolic = normalized.systolic ?? "";
    normalized.morningDiastolic = normalized.diastolic ?? "";
  }
  bloodPressurePeriods.forEach(({ systolic, diastolic }) => {
    normalized[systolic] ??= "";
    normalized[diastolic] ??= "";
  });
  return normalized;
}

function normalizeRecords(records) {
  return Array.isArray(records) ? records.map(normalizeRecord) : [];
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const loaded = {
        ...sampleState(),
        ...parsed,
        selectedDate: parsed.selectedDate || localDateString(),
        weekEnd: parsed.weekEnd || localDateString(),
        activeView: "daily",
      };
      loaded.records = normalizeRecords(parsed.records || loaded.records);
      return loaded;
    }
  } catch (error) {
    console.warn("????????", error);
  }
  const initial = sampleState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(CLOUD_LOCAL_UPDATED_KEY, new Date().toISOString());
  cloudDirty = true;
  localStorage.setItem(CLOUD_DIRTY_KEY, "1");
  queueCloudPush();
}

function cloudConfigured() {
  return SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("__SUPABASE") &&
    SUPABASE_PUBLISHABLE_KEY &&
    !SUPABASE_PUBLISHABLE_KEY.includes("__SUPABASE");
}

function cloudPayload() {
  return {
    version: CLOUD_PAYLOAD_VERSION,
    patient: state.patient,
    records: state.records,
    medications: state.medications,
    labs: state.labs,
    summaryDays: state.summaryDays || 7,
  };
}

function cloudPayloadString(payload = cloudPayload()) {
  return JSON.stringify(payload);
}

function applyCloudPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  state = {
    ...state,
    patient: payload.patient || state.patient,
    records: Array.isArray(payload.records) ? normalizeRecords(payload.records) : state.records,
    medications: Array.isArray(payload.medications) ? payload.medications : state.medications,
    labs: Array.isArray(payload.labs) ? payload.labs : state.labs,
    summaryDays: Number(payload.summaryDays) || state.summaryDays || 7,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}

function setSyncUi(mode, message) {
  const dot = document.getElementById("syncDot");
  const status = document.getElementById("syncStatus");
  const accountStatus = document.getElementById("syncAccountStatus");
  if (!dot || !status) return;
  dot.className = `sync-dot${mode === "local" ? "" : ` ${mode}`}`;
  status.textContent = message;
  if (accountStatus && cloudSession) accountStatus.textContent = message;
}

function setSyncFormMessage(message = "", success = false) {
  const element = document.getElementById("syncFormMessage");
  element.textContent = message;
  element.classList.toggle("hidden", !message);
  element.classList.toggle("success", success);
}

function renderSyncAccount() {
  const signedOutPanel = document.getElementById("signedOutPanel");
  const signedInPanel = document.getElementById("signedInPanel");
  const label = document.getElementById("syncButtonLabel");
  signedOutPanel.classList.toggle("hidden", Boolean(cloudSession));
  signedInPanel.classList.toggle("hidden", !cloudSession);
  if (cloudSession) {
    const email = cloudSession.user?.email || "????";
    document.getElementById("syncAccountEmail").textContent = email;
    label.textContent = "????";
  } else {
    label.textContent = cloudConfigured() ? "????" : "????";
  }
}

function queueCloudPush() {
  if (!cloudClient || !cloudSession || cloudSyncing) {
    if (cloudConfigured() && !cloudSession) setSyncUi("local", "????");
    return;
  }
  window.clearTimeout(cloudPushTimer);
  cloudPushTimer = window.setTimeout(() => pushCloudState(), 900);
}

async function pushCloudState(options = {}) {
  if (!cloudClient || !cloudSession || cloudSyncing) return false;
  const payload = cloudPayload();
  const serialized = cloudPayloadString(payload);
  if (!options.force && serialized === lastSyncedPayload) {
    cloudDirty = false;
    localStorage.removeItem(CLOUD_DIRTY_KEY);
    setSyncUi("synced", "???");
    return true;
  }

  cloudSyncing = true;
  setSyncUi("syncing", "????");
  const updatedAt = new Date().toISOString();
  try {
    const { data, error } = await cloudClient
      .from(CLOUD_TABLE)
      .upsert({
        user_id: cloudSession.user.id,
        data: payload,
        updated_at: updatedAt,
      }, { onConflict: "user_id" })
      .select("updated_at")
      .single();
    if (error) throw error;
    lastSyncedPayload = serialized;
    cloudDirty = false;
    localStorage.removeItem(CLOUD_DIRTY_KEY);
    localStorage.setItem(CLOUD_REMOTE_UPDATED_KEY, data?.updated_at || updatedAt);
    setSyncUi("synced", `??? ${new Date(data?.updated_at || updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    return true;
  } catch (error) {
    console.warn("??????", error);
    setSyncUi("error", navigator.onLine ? "?????????" : "???????");
    return false;
  } finally {
    cloudSyncing = false;
  }
}

function hasFocusedEditor() {
  const active = document.activeElement;
  return active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
}

async function pullCloudState(options = {}) {
  if (!cloudClient || !cloudSession || cloudSyncing) return false;
  if (options.silent && hasFocusedEditor()) return false;
  cloudSyncing = true;
  setSyncUi("syncing", "????");
  try {
    const { data, error } = await cloudClient
      .from(CLOUD_TABLE)
      .select("data, updated_at")
      .eq("user_id", cloudSession.user.id)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      cloudSyncing = false;
      const uploaded = await pushCloudState({ force: true });
      if (uploaded && !options.silent) showToast("?????????????");
      return uploaded;
    }

    const localUpdatedAt = localStorage.getItem(CLOUD_LOCAL_UPDATED_KEY);
    const remoteUpdatedAt = data.updated_at;
    if (cloudDirty && localUpdatedAt && new Date(localUpdatedAt) > new Date(remoteUpdatedAt)) {
      cloudSyncing = false;
      return pushCloudState({ force: true });
    }

    const serialized = cloudPayloadString(data.data);
    if (serialized !== cloudPayloadString()) {
      applyCloudPayload(data.data);
      if (!options.silent) showToast("?????????????");
    }
    lastSyncedPayload = serialized;
    cloudDirty = false;
    localStorage.removeItem(CLOUD_DIRTY_KEY);
    localStorage.setItem(CLOUD_REMOTE_UPDATED_KEY, remoteUpdatedAt);
    setSyncUi("synced", `??? ${new Date(remoteUpdatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    return true;
  } catch (error) {
    console.warn("??????", error);
    setSyncUi("error", navigator.onLine ? "?????????" : "???????");
    return false;
  } finally {
    cloudSyncing = false;
  }
}

async function handleCloudSession(session) {
  cloudSession = session;
  renderSyncAccount();
  if (!session) {
    lastSyncedPayload = "";
    setSyncUi("local", cloudConfigured() ? "????" : "????");
    return;
  }
  await pullCloudState();
}

async function initCloudSync() {
  renderSyncAccount();
  if (!cloudConfigured()) {
    setSyncUi("local", "????");
    return;
  }
  setSyncUi("syncing", "????");
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    cloudClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    const { data, error } = await cloudClient.auth.getSession();
    if (error) throw error;
    await handleCloudSession(data.session);
    cloudClient.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => handleCloudSession(session), 0);
    });
  } catch (error) {
    console.warn("????????", error);
    setSyncUi("error", "???????");
  }
}

async function signInToCloud(event) {
  event.preventDefault();
  if (!cloudClient) {
    setSyncFormMessage("??????????");
    return;
  }
  const email = document.getElementById("syncEmail").value.trim();
  const password = document.getElementById("syncPassword").value;
  setSyncFormMessage("");
  setSyncUi("syncing", "????");
  const button = document.getElementById("signInButton");
  button.disabled = true;
  try {
    const { error } = await cloudClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    document.getElementById("syncPassword").value = "";
    showToast("???????");
  } catch (error) {
    setSyncFormMessage(error?.message === "Invalid login credentials" ? "?????????" : `?????${error?.message || "?????"}`);
    setSyncUi("error", "????");
  } finally {
    button.disabled = false;
  }
}

async function signUpForCloud() {
  if (!cloudClient) {
    setSyncFormMessage("??????????");
    return;
  }
  const form = document.getElementById("syncAuthForm");
  if (!form.reportValidity()) return;
  const email = document.getElementById("syncEmail").value.trim();
  const password = document.getElementById("syncPassword").value;
  const button = document.getElementById("signUpButton");
  button.disabled = true;
  setSyncFormMessage("");
  setSyncUi("syncing", "????");
  try {
    const { data, error } = await cloudClient.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.href.split("#")[0] },
    });
    if (error) throw error;
    document.getElementById("syncPassword").value = "";
    if (data.session) {
      showToast("????????????");
    } else {
      setSyncFormMessage("??????????????????????", true);
      setSyncUi("local", "??????");
    }
  } catch (error) {
    setSyncFormMessage(`?????${error?.message || "?????"}`);
    setSyncUi("error", "????");
  } finally {
    button.disabled = false;
  }
}

async function signOutFromCloud() {
  if (!cloudClient) return;
  const { error } = await cloudClient.auth.signOut();
  if (error) {
    showToast("??????????");
    return;
  }
  document.getElementById("syncDialog").close();
  showToast("???????????????");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function getRecord(date) {
  return state.records.find((record) => record.date === date);
}

function sortRecordsDesc(records = state.records) {
  return [...records].sort((a, b) => b.date.localeCompare(a.date));
}

function populatedNumber(value) {
  return value !== "" && value !== undefined && value !== null && Number.isFinite(Number(value));
}

function formatNumber(value, maxDigits = 1) {
  if (!populatedNumber(value)) return "?";
  return Number(value).toLocaleString("zh-CN", {
    maximumFractionDigits: maxDigits,
    minimumFractionDigits: 0,
  });
}

function sumRecordFields(record, fields) {
  const values = fields.map((field) => record?.[field]).filter(populatedNumber).map(Number);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : "";
}

function weightReadings(record) {
  return weightPeriods
    .map((period) => ({ ...period, value: record?.[period.field] }))
    .filter((reading) => populatedNumber(reading.value));
}

function vitalReadings(record, periods) {
  return periods
    .map((period) => ({ ...period, value: record?.[period.field] }))
    .filter((reading) => populatedNumber(reading.value));
}

function dailyVital(record, periods) {
  return vitalReadings(record, periods)[0]?.value ?? "";
}

function formatVital(record, periods, suffix = "") {
  const readings = vitalReadings(record, periods);
  if (!readings.length) return "?";
  return readings
    .map((reading) => `${reading.label} ${formatNumber(reading.value)}${suffix}`)
    .join(" ? ");
}

function dailyWeight(record) {
  return weightReadings(record)[0]?.value ?? "";
}

function formatWeight(record, includeLabels = true) {
  const readings = weightReadings(record);
  if (!readings.length) return "?";
  return readings
    .map((reading) => `${includeLabels ? `${reading.label} ` : ""}${formatNumber(reading.value, 1)}`)
    .join(" ? ");
}

function getDailyWeightRangeAlert(record) {
  const values = weightReadings(record).map((reading) => Number(reading.value));
  if (values.length < 2) return null;
  const range = Math.max(...values) - Math.min(...values);
  if (range > WEIGHT_DAILY_RANGE_RISK_JIN) {
    return {
      key: "weightDailyRange",
      label: `?????? ${formatNumber(range, 1)} ?`,
      detail: `???? ${formatNumber(Math.min(...values), 1)} ???? ${formatNumber(Math.max(...values), 1)} ?????? 4 ??? 2 kg??`,
    };
  }
  return null;
}

function getThreeDayWeightAlert(record) {
  const currentReading = weightReadings(record)[0];
  const currentWeight = currentReading?.value;
  if (!populatedNumber(currentWeight)) return null;
  const previous = state.records
    .filter((item) => item.date < record.date && dateDiff(record.date, item.date) <= 3 && populatedNumber(dailyWeight(item)))
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  if (!previous) return null;
  const previousWeight = Number(dailyWeight(previous));
  const increase = Number(currentWeight) - previousWeight;
  if (increase >= WEIGHT_THREE_DAY_GAIN_RISK_JIN) {
    return {
      key: currentReading.field,
      label: `3 ?????? ${formatNumber(increase, 1)} ?`,
      detail: `${formatShortDate(previous.date)} ? ${formatNumber(previousWeight, 1)} ????? ${formatNumber(currentWeight, 1)} ??`,
    };
  }
  return null;
}

function getAlerts(record) {
  if (!record) return [];
  const alerts = [];
  const dailyWeightAlert = getDailyWeightRangeAlert(record);
  const threeDayWeightAlert = getThreeDayWeightAlert(record);
  if (dailyWeightAlert) alerts.push(dailyWeightAlert);
  if (threeDayWeightAlert) alerts.push(threeDayWeightAlert);
  vitalReadings(record, spo2Periods).forEach(({ label, field, value }) => {
    if (Number(value) < 92) alerts.push({ key: field, label: `${label}??? ${formatNumber(value, 1)}% ?? 92%`, detail: "???????????" });
  });
  if (populatedNumber(record.urine) && Number(record.urine) < 500) alerts.push({ key: "urineTotal", label: `?? ${formatNumber(record.urine, 2)} ml ?? 500 ml/?`, detail: "????????????????" });
  vitalReadings(record, heartRatePeriods).forEach(({ label, field, value }) => {
    if (Number(value) > 120) alerts.push({ key: field, label: `${label}??? ${formatNumber(value, 1)} ?/??? 120`, detail: "?????????" });
  });
  bloodPressurePeriods.forEach(({ label, systolic }) => {
    const value = record[systolic];
    if (value !== "" && value !== undefined && Number(value) < 90) {
      alerts.push({ key: systolic, label: `${label}???? ${value} mmHg ?? 90`, detail: "????????????" });
    }
  });
  if (Number(record.breathing) >= 3) alerts.push({ key: "breathing", label: `???? ${record.breathing} ?`, detail: "????????????????" });
  return alerts;
}

function recordStatus(record) {
  if (!record) return { label: "???", className: "status-empty" };
  const alerts = getAlerts(record);
  if (alerts.length) return { label: "??", className: "status-risk" };
  if (Number(record.edema) >= 2 || Number(record.breathing) === 2) return { label: "??", className: "status-warning" };
  return { label: "??", className: "status-normal" };
}

function renderPatientHeader() {
  document.getElementById("patientName").textContent = state.patient.name || "??";
  const age = state.patient.age ? `${state.patient.age} ? ? ` : "";
  document.getElementById("patientDetail").textContent = `${age}${state.patient.condition || "?????? ? ??????"}`;
  document.getElementById("headerDate").textContent = formatDate(localDateString(), true);
}

function renderNavigation() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
  document.querySelectorAll(".app-view").forEach((view) => view.classList.add("hidden"));
  document.getElementById(`${state.activeView}View`).classList.remove("hidden");
}

function renderWeekStrip() {
  const strip = document.getElementById("weekStrip");
  const end = state.weekEnd || localDateString();
  const days = Array.from({ length: 7 }, (_, index) => addDays(end, index - 6));
  strip.innerHTML = days
    .map((date) => {
      const record = getRecord(date);
      const status = recordStatus(record);
      const selected = date === state.selectedDate ? "selected" : "";
      return `
        <button class="day-tile ${selected}" type="button" data-date="${date}">
          <span class="day-date">${formatShortDate(date)} ${WEEKDAYS[parseLocalDate(date).getDay()]}</span>
          <span class="day-status ${status.className}">${status.label}</span>
          <span class="day-value">${record && populatedNumber(dailyWeight(record)) ? `${formatNumber(dailyWeight(record), 1)} ?` : "????"}</span>
        </button>
      `;
    })
    .join("");

  strip.querySelectorAll(".day-tile").forEach((button) => {
    button.addEventListener("click", () => selectDate(button.dataset.date));
  });
  document.getElementById("nextWeekButton").disabled = state.weekEnd >= localDateString();
}

function renderAlertBanner() {
  const banner = document.getElementById("alertBanner");
  const record = getRecord(state.selectedDate);
  const alerts = getAlerts(record);
  if (!alerts.length) {
    banner.classList.add("hidden");
    banner.innerHTML = "";
    return;
  }
  banner.classList.remove("hidden");
  banner.innerHTML = `
    <div>
      <strong>${alerts[0].label}</strong>
      <p>${alerts.map((alert) => alert.detail).join(" ")}</p>
    </div>
    <span class="alert-count">${alerts.length} ???</span>
  `;
}

function renderTimeline() {
  const list = document.getElementById("timelineList");
  const records = sortRecordsDesc().slice(0, 30);
  if (!records.length) {
    list.innerHTML = `<div class="empty-state">????????<br />???????????</div>`;
    return;
  }

  list.innerHTML = records
    .map((record) => {
      const alerts = getAlerts(record);
      const status = recordStatus(record);
      const selected = record.date === state.selectedDate ? "selected" : "";
      const risk = alerts.length ? "risk" : "";
      const bloodPressureRisk = alerts.some((alert) => alert.key.endsWith("Systolic"));
      const weightRisk = alerts.some((alert) => alert.key === "weightDailyRange" || alert.key.endsWith("Weight"));
      const heartRateRisk = alerts.some((alert) => alert.key.endsWith("HeartRate"));
      const spo2Risk = alerts.some((alert) => alert.key.endsWith("Spo2"));
      return `
        <button class="timeline-row ${selected} ${risk}" type="button" data-date="${record.date}">
          <span class="timeline-date">${formatShortDate(record.date)}<br />${WEEKDAYS[parseLocalDate(record.date).getDay()]}</span>
          <span class="timeline-main">
            <span class="timeline-metric">??<strong class="${weightRisk ? "status-risk" : ""}">${formatWeight(record)} ?</strong></span>
            <span class="timeline-metric">??<strong class="${bloodPressureRisk ? "status-risk" : ""}">${formatBloodPressure(record)}</strong></span>
            <span class="timeline-metric">??<strong class="${heartRateRisk ? "status-risk" : ""}">${formatVital(record, heartRatePeriods)}</strong></span>
            <span class="timeline-secondary">
              ?? ${formatNumber(record.urine)} ml?|??? ${formatNumber(record.intake)} ml?|?SpO? <span class="${spo2Risk ? "status-risk" : ""}">${formatVital(record, spo2Periods, "%")}</span>?|??? ${record.edema || 0}+?|??? ${record.breathing || 0}?
            </span>
          </span>
          <span class="timeline-status ${status.className}">${status.label}</span>
        </button>
      `;
    })
    .join("");

  list.querySelectorAll(".timeline-row").forEach((button) => {
    button.addEventListener("click", () => selectDate(button.dataset.date));
  });
}

function populateDailyForm() {
  const record = getRecord(state.selectedDate);
  document.getElementById("recordHeading").textContent = `${formatDate(state.selectedDate)}??`;
  document.getElementById("recordDate").value = state.selectedDate;

  fieldIds.slice(1).forEach((id) => {
    const element = document.getElementById(id);
    element.value = record?.[id] ?? "";
    element.classList.remove("risk-field");
  });

  if (!record) {
    document.getElementById("edema").value = "0";
    document.getElementById("breathing").value = "0";
  }

  const alerts = getAlerts(record);
  alerts.forEach((alert) => {
    if (alert.key === "weightDailyRange") {
      weightPeriods.forEach(({ field }) => document.getElementById(field).classList.add("risk-field"));
      return;
    }
    if (alert.key === "urineTotal") {
      urineFields.forEach((field) => document.getElementById(field).classList.add("risk-field"));
      return;
    }
    const target = document.getElementById(alert.key);
    if (target) target.classList.add("risk-field");
  });
  document.getElementById("deleteRecordButton").classList.toggle("hidden", !record);
  document.getElementById("saveStatus").textContent = record
    ? `??? ? ${new Date(record.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
    : "????";
  updateFluidTotals();
  updateWeightHint();
}

function bloodPressureReadings(record) {
  return bloodPressurePeriods
    .map((period) => ({
      ...period,
      systolicValue: record?.[period.systolic],
      diastolicValue: record?.[period.diastolic],
    }))
    .filter((reading) =>
      reading.systolicValue !== "" &&
      reading.systolicValue !== undefined &&
      reading.diastolicValue !== "" &&
      reading.diastolicValue !== undefined
    );
}

function formatBloodPressure(record, includeLabels = true) {
  const readings = bloodPressureReadings(record);
  if (!readings.length) return "?";
  return readings
    .map((reading) => `${includeLabels ? `${reading.label} ` : ""}${reading.systolicValue}/${reading.diastolicValue}`)
    .join(" ? ");
}

function validateBloodPressure() {
  let hasCompleteReading = false;
  let valid = true;

  bloodPressurePeriods.forEach(({ label, systolic, diastolic }) => {
    const systolicInput = document.getElementById(systolic);
    const diastolicInput = document.getElementById(diastolic);
    systolicInput.setCustomValidity("");
    diastolicInput.setCustomValidity("");
    const hasSystolic = systolicInput.value !== "";
    const hasDiastolic = diastolicInput.value !== "";

    if (hasSystolic && hasDiastolic) hasCompleteReading = true;
    if (hasSystolic !== hasDiastolic) {
      const missingInput = hasSystolic ? diastolicInput : systolicInput;
      missingInput.setCustomValidity(`?????${label}????????`);
      valid = false;
    }
  });

  if (!hasCompleteReading && valid) {
    document.getElementById("morningSystolic").setCustomValidity("??????????????");
    valid = false;
  }
  if (!valid) document.getElementById("dailyForm").reportValidity();
  return valid;
}

function validateWeight() {
  const inputs = weightPeriods.map(({ field }) => document.getElementById(field));
  inputs.forEach((input) => input.setCustomValidity(""));
  if (inputs.some((input) => input.value !== "")) return true;
  inputs[0].setCustomValidity("?????????");
  document.getElementById("dailyForm").reportValidity();
  return false;
}

function validateUrineEntries() {
  const inputs = urineFields.map((field) => document.getElementById(field));
  inputs.forEach((input) => input.setCustomValidity(""));
  if (inputs.some((input) => input.value !== "")) return true;
  inputs[0].setCustomValidity("?????????");
  document.getElementById("dailyForm").reportValidity();
  return false;
}

function sumInputFields(fields) {
  const values = fields
    .map((field) => document.getElementById(field).value)
    .filter((value) => value !== "")
    .map(Number)
    .filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : 0;
}

function updateFluidTotals() {
  const intakeTotal = sumInputFields(intakeFields);
  const urineTotal = sumInputFields(urineFields);
  document.getElementById("intakeTotalDisplay").value = `${formatNumber(intakeTotal, 2)} ml`;
  document.getElementById("urineTotalDisplay").value = `${formatNumber(urineTotal, 2)} ml`;
  const hasUrineEntry = urineFields.some((field) => document.getElementById(field).value !== "");
  const urineRisk = hasUrineEntry && urineTotal < 500;
  urineFields.forEach((field) => {
    const input = document.getElementById(field);
    input.classList.toggle("risk-field", urineRisk && input.value !== "");
  });
}

function updateWeightHint() {
  const date = document.getElementById("recordDate").value || state.selectedDate;
  const currentEntries = weightPeriods
    .map(({ field }) => ({ field, value: document.getElementById(field).value }))
    .filter((entry) => entry.value !== "" && Number.isFinite(Number(entry.value)));
  const currentReadings = currentEntries.map((entry) => Number(entry.value));
  const currentWeight = currentReadings[0];
  const currentWeightField = currentEntries[0]?.field;
  const hint = document.getElementById("weightHint");
  const previous = state.records
    .filter((item) => item.date < date && dateDiff(date, item.date) <= 3 && populatedNumber(dailyWeight(item)))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const dailyRange = currentReadings.length >= 2 ? Math.max(...currentReadings) - Math.min(...currentReadings) : null;
  const threeDayChange = previous && Number.isFinite(currentWeight)
    ? currentWeight - Number(dailyWeight(previous))
    : null;
  const dailyRisk = dailyRange !== null && dailyRange > WEIGHT_DAILY_RANGE_RISK_JIN;
  const threeDayRisk = threeDayChange !== null && threeDayChange >= WEIGHT_THREE_DAY_GAIN_RISK_JIN;

  weightPeriods.forEach(({ field }) => {
    const input = document.getElementById(field);
    input.classList.toggle("risk-field", dailyRisk || (field === currentWeightField && threeDayRisk));
    input.setCustomValidity("");
  });

  const messages = [];
  if (dailyRange !== null) messages.push(`???? ${formatNumber(dailyRange, 1)} ?`);
  if (threeDayChange !== null) {
    messages.push(`? ${formatShortDate(previous.date)} ${threeDayChange >= 0 ? "??" : "??"} ${formatNumber(Math.abs(threeDayChange), 1)} ?`);
  }
  hint.textContent = messages.length
    ? messages.join("?")
    : "??????????? 4 ??? 2 kg?????";
}

function renderDailyMedicationList() {
  const container = document.getElementById("dailyMedicationList");
  if (!state.medications.length) {
    container.innerHTML = `<div class="empty-state">??????????????????</div>`;
    return;
  }

  container.innerHTML = `
    <div class="data-table-wrap">
      <table class="medication-check-list">
        <thead>
          <tr>
            <th>??</th>
            <th>?</th>
            <th>?</th>
            <th>?</th>
            <th>??</th>
          </tr>
        </thead>
        <tbody>
          ${state.medications.map((medication) => {
            const taken = medication.taken?.[state.selectedDate] || {};
            return `
              <tr>
                <td><strong>${escapeHtml(medication.name)}</strong></td>
                ${["morning", "noon", "night"].map((period) => {
                  const dose = medication[`${period}Dose`];
                  if (!dose) return "<td>?</td>";
                  return `
                    <td>
                      <label class="dose-check">
                        <input type="checkbox" data-medication-id="${medication.id}" data-period="${period}" ${taken[period] ? "checked" : ""} />
                        ${escapeHtml(dose)}
                      </label>
                    </td>
                  `;
                }).join("")}
                <td>${medication.remainingCount ?? "?"} ${escapeHtml(medication.remainingUnit || "")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const medication = state.medications.find((item) => item.id === checkbox.dataset.medicationId);
      medication.taken ||= {};
      medication.taken[state.selectedDate] ||= {};
      medication.taken[state.selectedDate][checkbox.dataset.period] = checkbox.checked;
      saveState();
      renderMedicationTable();
      renderSummary();
      showToast("???????");
    });
  });
}

function renderDailyView() {
  renderWeekStrip();
  renderAlertBanner();
  renderTimeline();
  populateDailyForm();
  renderDailyMedicationList();
}

function selectDate(date) {
  state.selectedDate = date;
  if (date > state.weekEnd || dateDiff(state.weekEnd, date) > 6) state.weekEnd = date;
  saveState();
  renderDailyView();
}

function formRecord() {
  const record = {};
  fieldIds.forEach((id) => {
    record[id === "recordDate" ? "date" : id] = document.getElementById(id).value;
  });
  record.date ||= state.selectedDate || localDateString();
  numericRecordFields.forEach((key) => {
    record[key] = record[key] === "" ? "" : Number(record[key]);
  });
  record.weightUnit = "jin";
  record.weight = dailyWeight(record);
  record.intake = sumRecordFields(record, intakeFields);
  record.urine = sumRecordFields(record, urineFields);
  record.heartRate = dailyVital(record, heartRatePeriods);
  record.spo2 = dailyVital(record, spo2Periods);
  record.updatedAt = new Date().toISOString();
  return record;
}

function saveDailyRecord(event) {
  event.preventDefault();
  const record = formRecord();
  const existingIndex = state.records.findIndex((item) => item.date === record.date);
  if (existingIndex >= 0) state.records[existingIndex] = record;
  else state.records.push(record);
  state.selectedDate = record.date;
  state.weekEnd = record.date > localDateString() ? localDateString() : record.date;
  saveState();
  renderAll();
  showToast(getAlerts(record).length ? "????????????????" : "???????");
}

function deleteDailyRecord() {
  if (!window.confirm(`???? ${formatDate(state.selectedDate)} ?????`)) return;
  state.records = state.records.filter((record) => record.date !== state.selectedDate);
  saveState();
  renderAll();
  showToast("?????");
}

function renderMedicationTable() {
  const body = document.getElementById("medicationTableBody");
  if (!state.medications.length) {
    body.innerHTML = `<tr><td colspan="7"><div class="empty-state">????????</div></td></tr>`;
    return;
  }
  const today = localDateString();
  body.innerHTML = state.medications
    .map((medication) => {
      const taken = medication.taken?.[today] || {};
      const scheduled = ["morning", "noon", "night"].filter((period) => medication[`${period}Dose`]);
      const done = scheduled.filter((period) => taken[period]).length;
      return `
        <tr>
          <td><strong>${escapeHtml(medication.name)}</strong></td>
          <td>${escapeHtml(medication.morningDose || "?")}</td>
          <td>${escapeHtml(medication.noonDose || "?")}</td>
          <td>${escapeHtml(medication.nightDose || "?")}</td>
          <td class="${done === scheduled.length && scheduled.length ? "status-normal" : "status-warning"}">${done}/${scheduled.length}</td>
          <td>${medication.remainingCount ?? "?"} ${escapeHtml(medication.remainingUnit || "")}</td>
          <td>
            <div class="table-actions">
              <button type="button" data-edit-medication="${medication.id}">??</button>
              <button type="button" data-delete-medication="${medication.id}">??</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll("[data-edit-medication]").forEach((button) => {
    button.addEventListener("click", () => openMedicationForm(button.dataset.editMedication));
  });
  body.querySelectorAll("[data-delete-medication]").forEach((button) => {
    button.addEventListener("click", () => deleteMedication(button.dataset.deleteMedication));
  });
}

function openMedicationForm(id = "") {
  const form = document.getElementById("medicationForm");
  const medication = state.medications.find((item) => item.id === id);
  form.classList.remove("hidden");
  document.getElementById("medicationId").value = medication?.id || "";
  document.getElementById("medicationName").value = medication?.name || "";
  document.getElementById("morningDose").value = medication?.morningDose || "";
  document.getElementById("noonDose").value = medication?.noonDose || "";
  document.getElementById("nightDose").value = medication?.nightDose || "";
  document.getElementById("remainingCount").value = medication?.remainingCount ?? "";
  document.getElementById("remainingUnit").value = medication?.remainingUnit || "?";
  document.getElementById("medicationName").focus();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function saveMedication(event) {
  event.preventDefault();
  const id = document.getElementById("medicationId").value;
  const existing = state.medications.find((item) => item.id === id);
  const medication = {
    id: id || cryptoId(),
    name: document.getElementById("medicationName").value.trim(),
    morningDose: document.getElementById("morningDose").value.trim(),
    noonDose: document.getElementById("noonDose").value.trim(),
    nightDose: document.getElementById("nightDose").value.trim(),
    remainingCount: numberOrBlank(document.getElementById("remainingCount").value),
    remainingUnit: document.getElementById("remainingUnit").value.trim() || "?",
    taken: existing?.taken || {},
  };
  if (existing) Object.assign(existing, medication);
  else state.medications.push(medication);
  saveState();
  document.getElementById("medicationForm").classList.add("hidden");
  renderMedicationTable();
  renderDailyMedicationList();
  renderSummary();
  showToast("???????");
}

function deleteMedication(id) {
  const medication = state.medications.find((item) => item.id === id);
  if (!window.confirm(`?????${medication.name}???`)) return;
  state.medications = state.medications.filter((item) => item.id !== id);
  saveState();
  renderMedicationTable();
  renderDailyMedicationList();
  renderSummary();
  showToast("?????");
}

function renderLabTable() {
  const body = document.getElementById("labTableBody");
  const labs = [...state.labs].sort((a, b) => b.date.localeCompare(a.date));
  if (!labs.length) {
    body.innerHTML = `<tr><td colspan="11"><div class="empty-state">????????</div></td></tr>`;
    return;
  }
  body.innerHTML = labs
    .map((lab) => `
      <tr>
        <td><strong>${formatShortDate(lab.date)}</strong></td>
        <td>${displayValue(lab.ntProbnp)}</td>
        <td>${displayValue(lab.lvef)}</td>
        <td>${displayValue(lab.creatinine)}</td>
        <td>${displayValue(lab.egfr)}</td>
        <td>${displayValue(lab.potassium)}</td>
        <td>${displayValue(lab.sodium)}</td>
        <td>${displayValue(lab.albumin)}</td>
        <td>${displayValue(lab.urineProtein24h)}</td>
        <td>${displayValue(lab.uacr)}</td>
        <td>
          <div class="table-actions">
            <button type="button" data-edit-lab="${lab.id}">??</button>
            <button type="button" data-delete-lab="${lab.id}">??</button>
          </div>
        </td>
      </tr>
    `)
    .join("");

  body.querySelectorAll("[data-edit-lab]").forEach((button) => {
    button.addEventListener("click", () => openLabForm(button.dataset.editLab));
  });
  body.querySelectorAll("[data-delete-lab]").forEach((button) => {
    button.addEventListener("click", () => deleteLab(button.dataset.deleteLab));
  });
}

function openLabForm(id = "") {
  const form = document.getElementById("labForm");
  const lab = state.labs.find((item) => item.id === id);
  form.classList.remove("hidden");
  document.getElementById("labId").value = lab?.id || "";
  document.getElementById("labDate").value = lab?.date || localDateString();
  labFields.forEach((field) => {
    document.getElementById(field).value = lab?.[field] ?? "";
  });
  document.getElementById("labNotes").value = lab?.notes || "";
  document.getElementById("labDate").focus();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function saveLab(event) {
  event.preventDefault();
  const id = document.getElementById("labId").value;
  const lab = {
    id: id || cryptoId(),
    date: document.getElementById("labDate").value,
    notes: document.getElementById("labNotes").value.trim(),
  };
  labFields.forEach((field) => {
    lab[field] = numberOrBlank(document.getElementById(field).value);
  });
  const existingIndex = state.labs.findIndex((item) => item.id === id);
  if (existingIndex >= 0) state.labs[existingIndex] = lab;
  else state.labs.push(lab);
  saveState();
  document.getElementById("labForm").classList.add("hidden");
  renderLabTable();
  renderSummary();
  showToast("???????");
}

function deleteLab(id) {
  if (!window.confirm("????????????")) return;
  state.labs = state.labs.filter((item) => item.id !== id);
  saveState();
  renderLabTable();
  renderSummary();
  showToast("???????");
}

function periodRecords(days) {
  const end = localDateString();
  const start = addDays(end, -(days - 1));
  return state.records
    .filter((record) => record.date >= start && record.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function average(records, key, digits = 0) {
  const values = records.map((record) => record[key]).filter(populatedNumber).map(Number);
  if (!values.length) return "?";
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(digits);
}

function weightValues(records) {
  return records.flatMap((record) => weightReadings(record).map((reading) => Number(reading.value)));
}

function weightReadingCount(records) {
  return weightValues(records).length;
}

function weightMinMax(records) {
  const values = weightValues(records);
  if (!values.length) return "?";
  return `${Math.min(...values).toFixed(1)}?${Math.max(...values).toFixed(1)}`;
}

function vitalValues(records, periods) {
  return records.flatMap((record) => vitalReadings(record, periods).map((reading) => Number(reading.value)));
}

function vitalReadingCount(records, periods) {
  return vitalValues(records, periods).length;
}

function averageVital(records, periods, digits = 0) {
  return averageValues(vitalValues(records, periods), digits);
}

function bloodPressureValues(records, valueKey) {
  return records.flatMap((record) =>
    bloodPressureReadings(record)
      .map((reading) => Number(reading[valueKey]))
      .filter(Number.isFinite)
  );
}

function averageValues(values, digits = 0) {
  if (!values.length) return "?";
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(digits);
}

function averageBloodPressure(records) {
  const systolicValues = bloodPressureValues(records, "systolicValue");
  const diastolicValues = bloodPressureValues(records, "diastolicValue");
  return `${averageValues(systolicValues)}/${averageValues(diastolicValues)}`;
}

function bloodPressureReadingCount(records) {
  return records.reduce((count, record) => count + bloodPressureReadings(record).length, 0);
}

function minMax(records, key, digits = 0) {
  const values = records.map((record) => record[key]).filter(populatedNumber).map(Number);
  if (!values.length) return "?";
  return `${Math.min(...values).toFixed(digits)}?${Math.max(...values).toFixed(digits)}`;
}

function medicationAdherence(records) {
  let scheduled = 0;
  let taken = 0;
  records.forEach((record) => {
    state.medications.forEach((medication) => {
      ["morning", "noon", "night"].forEach((period) => {
        if (!medication[`${period}Dose`]) return;
        scheduled += 1;
        if (medication.taken?.[record.date]?.[period]) taken += 1;
      });
    });
  });
  return {
    scheduled,
    taken,
    rate: scheduled ? Math.round((taken / scheduled) * 100) : null,
  };
}

function renderSummary() {
  const days = state.summaryDays || 7;
  const records = periodRecords(days);
  const content = document.getElementById("summaryContent");
  const start = addDays(localDateString(), -(days - 1));
  const allAlerts = records.flatMap((record) => getAlerts(record).map((alert) => ({ ...alert, date: record.date })));
  const adherence = medicationAdherence(records);
  const latestLab = [...state.labs].sort((a, b) => b.date.localeCompare(a.date))[0];
  const firstWeight = records.find((record) => populatedNumber(dailyWeight(record)));
  const lastWeight = [...records].reverse().find((record) => populatedNumber(dailyWeight(record)));
  const weightChange = firstWeight && lastWeight
    ? Number(dailyWeight(lastWeight)) - Number(dailyWeight(firstWeight))
    : null;

  document.querySelectorAll("[data-summary-days]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.summaryDays) === days);
  });

  content.innerHTML = `
    <header class="summary-sheet-header">
      <div>
        <p class="section-kicker">????????</p>
        <h2>${escapeHtml(state.patient.name || "??")} ? ? ${days} ?</h2>
        <p>${escapeHtml(state.patient.condition || "??????")}</p>
      </div>
      <div class="summary-meta">
        <div>${formatDate(start, true)} ? ${formatDate(localDateString(), true)}</div>
        <div>??? ${records.length}/${days} ?</div>
      </div>
    </header>

    <div class="summary-metrics">
      <div class="summary-metric">
        <span>????</span>
        <strong>${weightMinMax(records)} ?</strong>
      </div>
      <div class="summary-metric">
        <span>??????</span>
        <strong class="${weightChange >= WEIGHT_THREE_DAY_GAIN_RISK_JIN ? "status-risk" : ""}">${weightChange === null ? "?" : `${weightChange >= 0 ? "+" : ""}${formatNumber(weightChange, 1)} ?`}</strong>
      </div>
      <div class="summary-metric">
        <span>????</span>
        <strong>${averageBloodPressure(records)}</strong>
      </div>
      <div class="summary-metric">
        <span>????</span>
        <strong>${averageVital(records, spo2Periods, 1)}%</strong>
      </div>
      <div class="summary-metric">
        <span>????</span>
        <strong>${averageVital(records, heartRatePeriods)} ?/?</strong>
      </div>
      <div class="summary-metric">
        <span>??????</span>
        <strong>${average(records, "urine")} ml</strong>
      </div>
      <div class="summary-metric">
        <span>??????</span>
        <strong>${records.length ? Math.max(...records.map((record) => Number(record.breathing) || 0)) : "?"} ?</strong>
      </div>
      <div class="summary-metric">
        <span>?????</span>
        <strong>${adherence.rate === null ? "?" : `${adherence.rate}%`}</strong>
      </div>
    </div>

    <h3>????</h3>
    ${allAlerts.length
      ? `<ul class="summary-alert-list">${allAlerts.map((alert) => `<li><span>${formatShortDate(alert.date)} ? ${escapeHtml(alert.label)}</span><strong>???</strong></li>`).join("")}</ul>`
      : `<p>?????????????????</p>`}

    <h3>????</h3>
    <p>
      ${records.length
        ? `????? ${records.length} ??????? ${weightReadingCount(records)} ???? ${weightMinMax(records)} ??????? ${bloodPressureReadingCount(records)} ?????? ${averageBloodPressure(records)} mmHg?????? ${vitalReadingCount(records, heartRatePeriods)} ?????? ${averageVital(records, heartRatePeriods)} ?/??????? ${vitalReadingCount(records, spo2Periods)} ?????? ${averageVital(records, spo2Periods, 1)}%?????? ${average(records, "intake")} ml/?????? ${average(records, "urine")} ml/??`
        : "????????????"}
      ${adherence.rate === null ? "???????????" : `???? ${adherence.scheduled} ????? ${adherence.taken} ????? ${adherence.rate}%?`}
    </p>

    <h3>??????</h3>
    ${latestLab ? `
      <p>${formatDate(latestLab.date, true)}</p>
      <div class="summary-lab-grid">
        ${summaryLabItem("NT-proBNP", latestLab.ntProbnp, "pg/ml")}
        ${summaryLabItem("LVEF", latestLab.lvef, "%")}
        ${summaryLabItem("??", latestLab.creatinine, "?mol/L")}
        ${summaryLabItem("eGFR", latestLab.egfr, "ml/min")}
        ${summaryLabItem("??", latestLab.potassium, "mmol/L")}
        ${summaryLabItem("??", latestLab.sodium, "mmol/L")}
        ${summaryLabItem("???", latestLab.albumin, "g/L")}
        ${summaryLabItem("24?????", latestLab.urineProtein24h, "g/24h")}
        ${summaryLabItem("UACR", latestLab.uacr, "mg/g")}
      </div>
    ` : `<p>?????????</p>`}

    <h3>???????</h3>
    <p>${records.filter((record) => record.notes).map((record) => `${formatShortDate(record.date)}?${escapeHtml(record.notes)}`).join("<br />") || "????????"}</p>
    <p><strong>???</strong>?????????????????????????????????????</p>
  `;
}

function summaryLabItem(label, value, unit) {
  return `<div class="summary-lab-item"><span>${label}</span><strong>${displayValue(value)} ${value === "" || value === undefined ? "" : unit}</strong></div>`;
}

function summaryPlainText() {
  const days = state.summaryDays || 7;
  const records = periodRecords(days);
  const alerts = records.flatMap((record) => getAlerts(record).map((alert) => `${formatShortDate(record.date)} ${alert.label}`));
  const adherence = medicationAdherence(records);
  const latestLab = [...state.labs].sort((a, b) => b.date.localeCompare(a.date))[0];
  return [
    `${state.patient.name || "??"} ? ? ${days} ???????`,
    `?????${records.length}/${days}`,
    `?????${weightReadingCount(records)} ?`,
    `?????${weightMinMax(records)} ?`,
    `?????${bloodPressureReadingCount(records)} ?`,
    `?????${averageBloodPressure(records)} mmHg`,
    `?????${vitalReadingCount(records, heartRatePeriods)} ?`,
    `?????${averageVital(records, heartRatePeriods)} ?/?`,
    `?????${vitalReadingCount(records, spo2Periods)} ?`,
    `?????${averageVital(records, spo2Periods, 1)}%`,
    `??????${average(records, "intake")} ml/?`,
    `?????${average(records, "urine")} ml/?`,
    `??????${adherence.rate === null ? "?" : `${adherence.rate}%`}`,
    `???${alerts.length ? alerts.join("?") : "?"}`,
    latestLab ? `?????${latestLab.date}?NT-proBNP ${displayValue(latestLab.ntProbnp)}?LVEF ${displayValue(latestLab.lvef)}%??? ${displayValue(latestLab.creatinine)}?eGFR ${displayValue(latestLab.egfr)}??? ${displayValue(latestLab.potassium)}??? ${displayValue(latestLab.sodium)}???? ${displayValue(latestLab.albumin)}?24????? ${displayValue(latestLab.urineProtein24h)}?UACR ${displayValue(latestLab.uacr)}` : "???????",
    "???????????????????????",
  ].join("\n");
}

async function copySummary() {
  const text = summaryPlainText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  showToast("???????");
}

function switchView(view) {
  state.activeView = view;
  saveState();
  renderNavigation();
  if (view === "daily") renderDailyView();
  if (view === "medications") renderMedicationTable();
  if (view === "labs") renderLabTable();
  if (view === "summary") renderSummary();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderAll() {
  renderPatientHeader();
  renderNavigation();
  renderDailyView();
  renderMedicationTable();
  renderLabTable();
  renderSummary();
}

function numberOrBlank(value) {
  return value === "" ? "" : Number(value);
}

function displayValue(value) {
  return value === "" || value === undefined || value === null ? "?" : value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bindEvents() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.getElementById("recordTodayButton").addEventListener("click", () => {
    state.weekEnd = localDateString();
    selectDate(localDateString());
    switchView("daily");
    document.getElementById("morningWeight").focus();
  });
  document.getElementById("jumpTodayButton").addEventListener("click", () => {
    state.weekEnd = localDateString();
    selectDate(localDateString());
  });
  document.getElementById("openSummaryButton").addEventListener("click", () => switchView("summary"));
  document.getElementById("manageMedicationsButton").addEventListener("click", () => switchView("medications"));
  document.getElementById("previousWeekButton").addEventListener("click", () => {
    state.weekEnd = addDays(state.weekEnd, -7);
    saveState();
    renderWeekStrip();
  });
  document.getElementById("nextWeekButton").addEventListener("click", () => {
    state.weekEnd = addDays(state.weekEnd, 7);
    if (state.weekEnd > localDateString()) state.weekEnd = localDateString();
    saveState();
    renderWeekStrip();
  });

  document.getElementById("dailyForm").addEventListener("submit", saveDailyRecord);
  document.getElementById("deleteRecordButton").addEventListener("click", deleteDailyRecord);
  weightPeriods.forEach(({ field }) => {
    document.getElementById(field).addEventListener("input", updateWeightHint);
  });
  intakeFields.forEach((field) => {
    document.getElementById(field).addEventListener("input", updateFluidTotals);
  });
  urineFields.forEach((field) => {
    document.getElementById(field).addEventListener("input", (event) => {
      event.target.setCustomValidity("");
      updateFluidTotals();
    });
  });
  document.getElementById("recordDate").addEventListener("change", updateWeightHint);
  [
    "breathing",
    ...spo2Periods.map((period) => period.field),
    ...heartRatePeriods.map((period) => period.field),
    ...bloodPressurePeriods.map((period) => period.systolic),
  ].forEach((id) => {
    document.getElementById(id).addEventListener("input", (event) => {
      const value = Number(event.target.value);
      const isRisk =
        (id.endsWith("Spo2") && value < 92) ||
        (id.endsWith("HeartRate") && value > 120) ||
        (id.endsWith("Systolic") && value < 90) ||
        (id === "breathing" && value >= 3);
      event.target.classList.toggle("risk-field", event.target.value !== "" && isRisk);
      if (id.endsWith("Systolic")) event.target.setCustomValidity("");
    });
  });
  bloodPressurePeriods.forEach(({ systolic, diastolic }) => {
    document.getElementById(diastolic).addEventListener("input", (event) => event.target.setCustomValidity(""));
  });

  document.getElementById("newMedicationButton").addEventListener("click", () => openMedicationForm());
  document.getElementById("cancelMedicationButton").addEventListener("click", () => document.getElementById("medicationForm").classList.add("hidden"));
  document.getElementById("medicationForm").addEventListener("submit", saveMedication);
  document.getElementById("newLabButton").addEventListener("click", () => openLabForm());
  document.getElementById("cancelLabButton").addEventListener("click", () => document.getElementById("labForm").classList.add("hidden"));
  document.getElementById("labForm").addEventListener("submit", saveLab);

  document.querySelectorAll("[data-summary-days]").forEach((button) => {
    button.addEventListener("click", () => {
      state.summaryDays = Number(button.dataset.summaryDays);
      saveState();
      renderSummary();
    });
  });
  document.getElementById("copySummaryButton").addEventListener("click", copySummary);
  document.getElementById("printSummaryButton").addEventListener("click", () => window.print());

  const syncDialog = document.getElementById("syncDialog");
  document.getElementById("openSyncButton").addEventListener("click", async () => {
    renderSyncAccount();
    setSyncFormMessage("");
    syncDialog.showModal();
    if (cloudSession) await pullCloudState({ silent: true });
  });
  document.getElementById("closeSyncDialog").addEventListener("click", () => syncDialog.close());
  document.getElementById("syncAuthForm").addEventListener("submit", signInToCloud);
  document.getElementById("signUpButton").addEventListener("click", signUpForCloud);
  document.getElementById("syncNowButton").addEventListener("click", async () => {
    const success = cloudDirty ? await pushCloudState({ force: true }) : await pullCloudState();
    if (success) showToast("???????");
  });
  document.getElementById("signOutButton").addEventListener("click", signOutFromCloud);

  const dialog = document.getElementById("patientDialog");
  document.getElementById("editPatientButton").addEventListener("click", () => {
    document.getElementById("patientNameInput").value = state.patient.name || "";
    document.getElementById("patientAgeInput").value = state.patient.age || "";
    document.getElementById("patientConditionInput").value = state.patient.condition || "";
    dialog.showModal();
  });
  document.getElementById("closePatientDialog").addEventListener("click", () => dialog.close());
  document.getElementById("patientForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.patient = {
      name: document.getElementById("patientNameInput").value.trim() || "??",
      age: numberOrBlank(document.getElementById("patientAgeInput").value),
      condition: document.getElementById("patientConditionInput").value.trim() || "?????? ? ??????",
    };
    saveState();
    dialog.close();
    renderPatientHeader();
    renderSummary();
    showToast("???????");
  });

  document.getElementById("resetDemoButton").addEventListener("click", () => {
    if (!window.confirm("???????????????????????????")) return;
    state = sampleState();
    saveState();
    renderAll();
    showToast("???????");
  });

  window.addEventListener("online", () => {
    if (cloudSession) queueCloudPush();
  });
  window.addEventListener("focus", () => {
    if (cloudSession) pullCloudState({ silent: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && cloudSession) pullCloudState({ silent: true });
  });
}

bindEvents();
renderAll();
initCloudSync();
