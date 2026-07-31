import { createClient, createAccount } from "https://esm.sh/genlayer-js@latest";
import { studionet } from "https://esm.sh/genlayer-js@latest/chains";

// ---- Configuration ----
const CONTRACT_ADDRESS = "0x713D538A4bCc0D30cF5AD2464a146E937164B8D5";

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
      <span class="h-name">${escapeHtml(item.product_name)} - $${item.seller_price}</span>
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
    }
  } catch (err) {
    console.error("Failed to load ledger from chain:", err);
  }
}

// Extracts the decoded return value (the ticket_id) from a transaction
// receipt. GenLayer's simplified receipt keeps execution results, but the
// exact field name has varied across SDK versions/examples in the docs,
// so we check the known possibilities defensively and log the raw
// receipt if none match, rather than silently guessing wrong.
function extractTicketIdFromReceipt(receipt) {
  const candidates = [
    receipt?.result,
    receipt?.output,
    receipt?.data?.result,
    receipt?.data?.output,
    receipt?.data?.execution_result,
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      const asNumber = Number(candidate);
      if (!Number.isNaN(asNumber)) return asNumber;
    }
  }
  console.warn(
    "Could not find decoded ticket_id on receipt in any known field. Raw receipt:",
    receipt
  );
  return null;
}

// Checks that a fetched record's fields actually match what THIS
// submission sent — not just "some record exists at this ticket ID".
// This is the real safety net: extracting the ticket ID from a receipt
// has proven unreliable (the exact SDK field varies), so we never trust
// an ID alone. A record is only ever shown if its content genuinely
// matches what the person submitted.
function recordMatchesSubmission(record, submission) {
  if (!record || !record.verdict) return false;
  return (
    record.product_name === submission.productName &&
    record.category === submission.category &&
    record.condition === submission.condition &&
    Number(record.seller_price) === submission.sellerPrice
  );
}

// The authoritative fetch: tries the (possibly wrong) extracted ticket ID
// first as a fast path, but always verifies the content matches before
// accepting it. If it doesn't match — or the ID extraction failed
// entirely — falls back to scanning recent history for the real match.
// Only gives up (returns null) after genuinely exhausting retries.
async function fetchVerifiedResult(ticketId, submission, maxAttempts = 20, delayMs = 4000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (ticketId !== null) {
      const candidate = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_result",
        args: [ticketId],
      });
      if (recordMatchesSubmission(candidate, submission)) {
        return candidate;
      }
    }

    const history = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_history",
      args: [20],
    });
    const match = (history || []).find((record) =>
      recordMatchesSubmission(record, submission)
    );
    if (match) return match;

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}
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

  try {
    const txHash = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "check_price",
      args: [productName, category, condition, sellerPrice],
      value: 0,
    });

    workingLabel.textContent = "Waiting for validator consensus… (this can take a minute)";

    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      status: "ACCEPTED",
      retries: 100,
      interval: 5000,
      fullTransaction: true,
    });

    workingLabel.textContent = "Fetching verdict…";

    const ticketId = extractTicketIdFromReceipt(receipt);

    // Content-verified fetch: even if ticketId is null or wrong, this
    // will find the real matching record (or honestly report it can't
    // yet), rather than ever displaying someone else's result.
    const result = await fetchVerifiedResult(ticketId, {
      productName,
      category,
      condition,
      sellerPrice,
    });

    if (result === null) {
      showOnly("error");
      errorText.textContent =
        "Your appraisal was accepted on-chain, but the app couldn't confirm the matching result yet. Refresh in a minute and check Today's Ledger — it will be there once finalized.";
    } else {
      renderResult(result);
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
