import { createClient, createAccount } from "https://esm.sh/genlayer-js@latest";
import { studionet } from "https://esm.sh/genlayer-js@latest/chains";

// ---- Configuration ----
const CONTRACT_ADDRESS = "0x69Efc7293F44DB9fdb7c0B3190AE46fB9Fe024a6";

// ---- Elements ----
const form = document.getElementById("appraisalForm");
const productNameInput = document.getElementById("productName");
const conditionInput = document.getElementById("condition");
const sellerPriceInput = document.getElementById("sellerPrice");
const submitBtn = document.getElementById("submitBtn");
const btnLabel = submitBtn.querySelector(".btn-label");

const resultPlaceholder = document.getElementById("resultPlaceholder");
const workingState = document.getElementById("workingState");
const workingLabel = document.getElementById("workingLabel");
const stampedState = document.getElementById("stampedState");
const errorState = document.getElementById("errorState");
const errorText = document.getElementById("errorText");

const stampEl = document.getElementById("stampEl");
const stampText = document.getElementById("stampText");
const rangeValue = document.getElementById("rangeValue");
const reasonText = document.getElementById("reasonText");

const ticketNo = document.getElementById("ticketNo");
const netDot = document.getElementById("netDot");
const netLabel = document.getElementById("netLabel");

const historyList = document.getElementById("historyList");
const historyEmpty = document.getElementById("historyEmpty");

let ticketCount = parseInt(localStorage.getItem("spc_ticketCount") || "0", 10);
let client;

function loadHistory() {
  const saved = JSON.parse(localStorage.getItem("spc_history") || "[]");
  if (saved.length > 0) {
    historyEmpty.hidden = true;
    saved.forEach((item) => {
      const li = document.createElement("li");
      li.className = `history-item ${item.cls}`;
      li.innerHTML = `
        <span class="h-name">${item.name} — $${item.price}</span>
        <span class="h-verdict">${item.verdict}</span>
      `;
      historyList.appendChild(li);
    });
  }
  ticketNo.textContent = `TICKET #${String(ticketCount).padStart(3, "0")}`;
}

loadHistory();

// ---- Init GenLayer client ----
async function initClient() {
  try {
    const account = createAccount();
    client = createClient({
      chain: studionet,
      account: account,
    });

    netDot.classList.add("live");
    netLabel.textContent = "connected to studionet";
  } catch (err) {
    console.error("Failed to initialize GenLayer client:", err);
    netDot.classList.add("error");
    netLabel.textContent = "connection failed";
  }
}

initClient();

// ---- Helpers ----
function showOnly(section) {
  resultPlaceholder.hidden = section !== "placeholder";
  workingState.hidden = section !== "working";
  stampedState.hidden = section !== "stamped";
  errorState.hidden = section !== "error";
}

function verdictClass(verdict) {
  const v = (verdict || "").toLowerCase();
  if (v.includes("over")) return "verdict-over";
  if (v.includes("under")) return "verdict-under";
  return "verdict-fair";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function addHistoryItem(productName, sellerPrice, verdict) {
  historyEmpty.hidden = true;
  const cls = verdictClass(verdict);
  const li = document.createElement("li");
  li.className = `history-item ${cls}`;
  li.innerHTML = `
    <span class="h-name">${escapeHtml(productName)} — $${sellerPrice}</span>
    <span class="h-verdict">${escapeHtml(verdict || "—")}</span>
  `;
  historyList.prepend(li);

  const saved = JSON.parse(localStorage.getItem("spc_history") || "[]");
  saved.unshift({
    name: escapeHtml(productName),
    price: sellerPrice,
    verdict: escapeHtml(verdict || "—"),
    cls: cls,
  });
  localStorage.setItem("spc_history", JSON.stringify(saved.slice(0, 20)));
}

// ---- Form submit ----
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const productName = productNameInput.value.trim();
  const condition = conditionInput.value;
  const sellerPrice = parseInt(sellerPriceInput.value, 10);

  if (!productName || !condition || Number.isNaN(sellerPrice)) return;

  if (!client) {
    showOnly("error");
    errorText.textContent = "Still connecting to the network — try again in a moment.";
    return;
  }

  submitBtn.disabled = true;
  btnLabel.textContent = "Sending…";
  showOnly("working");
  workingLabel.textContent = "Validators are reviewing the item…";

  try {
    const txHash = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "check_price",
      args: [productName, condition, sellerPrice],
      value: 0,
    });

    workingLabel.textContent = "Waiting for validator consensus… (this can take a minute)";

    await client.waitForTransactionReceipt({
      hash: txHash,
      status: "ACCEPTED",
      retries: 100,
      interval: 5000,
    });

    workingLabel.textContent = "Fetching verdict…";

    const result = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_result",
      args: [],
    });

    renderResult(result);
    addHistoryItem(productName, sellerPrice, result.verdict);
    ticketCount += 1;
    localStorage.setItem("spc_ticketCount", String(ticketCount));
    ticketNo.textContent = `TICKET #${String(ticketCount).padStart(3, "0")}`;
  } catch (err) {
    console.error("Appraisal failed:", err);
    showOnly("error");
    errorText.textContent =
      "The appraisal couldn't be completed. Check the console for details, and make sure your contract is still deployed on studionet.";
  } finally {
    submitBtn.disabled = false;
    btnLabel.textContent = "Submit for appraisal";
  }
});

function renderResult(result) {
  const verdict = result.verdict || "Fair Price";
  const cls = verdictClass(verdict);

  stampEl.classList.remove("verdict-fair", "verdict-over", "verdict-under");
  stampEl.classList.add(cls);
  stampText.textContent = verdict.toUpperCase();

  stampEl.style.animation = "none";
  void stampEl.offsetWidth;
  stampEl.style.animation = "";

  rangeValue.textContent = `$${result.market_low} – $${result.market_high}`;
  reasonText.textContent = result.reason || "";

  showOnly("stamped");
}