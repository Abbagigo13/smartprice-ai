import { createClient, createAccount } from "https://esm.sh/genlayer-js@latest";
import { studionet } from "https://esm.sh/genlayer-js@latest/chains";

// ---- Configuration ----
const CONTRACT_ADDRESS = "0xACB2650f34832C47954B5972b0504cE8F0680b27";

// ---- Elements ----
const form = document.getElementById("appraisalForm");
const productNameInput = document.getElementById("productName");
const categoryInput = document.getElementById("category");
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

let client;
let knownTicketCount = 0;

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

function renderHistoryList(records) {
  historyList.innerHTML = "";
  if (!records || records.length === 0) {
    historyEmpty.hidden = false;
    return;
  }
  historyEmpty.hidden = true;
  records.forEach((item) => {
    const cls = verdictClass(item.verdict);
    const li = document.createElement("li");
    li.className = `history-item ${cls}`;
    li.innerHTML = `
      <span class="h-name">${escapeHtml(item.product_name)}—$${item.seller_price}</span>
      <span class="h-verdict">${escapeHtml(item.verdict || "—")}</span>
    `;
    historyList.appendChild(li);
  });
}

// ---- Ledger reads (on-chain, not localStorage) ----
async function refreshHistory() {
  try {
    const records = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_history",
      args: [20],
    });
    renderHistoryList(records);
    if (records && records.length > 0) {
      ticketNo.textContent = `TICKET #${String(records[0].ticket_id).padStart(3, "0")}`;
      knownTicketCount = records[0].ticket_id;
    }
  } catch (err) {
    console.error("Failed to load ledger from chain:", err);
  }
}

// Poll get_latest until it actually reflects a ticket newer than what we
// had before this submission, instead of trusting the very first read
// right after the transaction is accepted (which can be stale). Consensus
// can involve multiple leader rotations, so this window is generous.
async function waitForNewResult(previousTicketCount, maxAttempts = 30, delayMs = 4000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const latest = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_latest",
      args: [],
    });
    if (latest && latest.ticket_id && latest.ticket_id > previousTicketCount) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  // Genuinely timed out — do NOT silently show stale data. Signal this
  // clearly so the UI can tell the user rather than pretend it's accurate.
  return null;
}

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

    await refreshHistory();
  } catch (err) {
    console.error("Failed to initialize GenLayer client:", err);
    netDot.classList.add("error");
    netLabel.textContent = "connection failed";
  }
}

initClient();

// ---- Form submit ----
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const productName = productNameInput.value.trim();
  const category = categoryInput.value;
  const condition = conditionInput.value;
  const sellerPrice = parseInt(sellerPriceInput.value, 10);

  if (!productName || !category || !condition || Number.isNaN(sellerPrice)) return;

  if (!client) {
    showOnly("error");
    errorText.textContent = "Still connecting to the network — try again in a moment.";
    return;
  }

  submitBtn.disabled = true;
  btnLabel.textContent = "Sending…";
  showOnly("working");
  workingLabel.textContent = "Validators are reviewing the item…";

  const previousTicketCount = knownTicketCount;

  try {
    const txHash = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "check_price",
      args: [productName, category, condition, sellerPrice],
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

    const latest = await waitForNewResult(previousTicketCount);

    if (latest === null) {
      showOnly("error");
      errorText.textContent =
        "Your appraisal was accepted on-chain, but consensus is taking longer than usual to confirm. Refresh in a minute and check Today's Ledger — it will appear there once finalized.";
    } else {
      renderResult(latest);
    }
    await refreshHistory();
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
