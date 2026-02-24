const params = new URLSearchParams(window.location.search);
const machineId = params.get("machineId");

const machineIdEl = document.getElementById("machine-id");
const machineStatusEl = document.getElementById("machine-status");
const amountEl = document.getElementById("amount");
const messageEl = document.getElementById("message");
const payButton = document.getElementById("pay-btn");

const ORDER_POLL_INTERVAL_MS = 2000;
const ORDER_POLL_TIMEOUT_MS = 90000;
const MACHINE_STATUS_POLL_INTERVAL_MS = 5000;

const state = {
  amount: 20,
  currency: "INR",
  upiScannerMode: true,
  busy: false,
  activeOrderId: null,
  pollTimeoutId: null,
  pollDeadlineAt: 0,
  machineStatusIntervalId: null
};

function setMessage(message, tone = "default") {
  messageEl.textContent = message;
  messageEl.classList.remove("success", "error");
  if (tone === "success") {
    messageEl.classList.add("success");
  } else if (tone === "error") {
    messageEl.classList.add("error");
  }
}

function setMachineStatus(statusText) {
  const status = String(statusText || "UNKNOWN").toLowerCase();
  machineStatusEl.textContent = status.toUpperCase();
  machineStatusEl.className = `machine-status ${status}`;
}

function setBusy(busy) {
  state.busy = busy;
  payButton.disabled = busy;
  payButton.textContent = busy ? "Processing..." : "Pay Now";
}

function clearOrderPolling() {
  if (state.pollTimeoutId) {
    clearTimeout(state.pollTimeoutId);
  }

  state.pollTimeoutId = null;
  state.activeOrderId = null;
  state.pollDeadlineAt = 0;
}

async function fetchMachineStatus() {
  const response = await fetch(`/machine/status?machineId=${encodeURIComponent(machineId)}`);

  if (!response.ok) {
    throw new Error("Unable to read machine status");
  }

  const data = await response.json();
  setMachineStatus(data.status);

  if (data.status === "OFFLINE") {
    payButton.disabled = true;
    setMessage("Machine is offline right now. Please try again shortly.", "error");
  } else if (!state.upiScannerMode && !state.busy) {
    payButton.disabled = false;
  }
}

function startMachineStatusPolling() {
  if (state.machineStatusIntervalId) {
    clearInterval(state.machineStatusIntervalId);
  }

  state.machineStatusIntervalId = setInterval(() => {
    void fetchMachineStatus().catch(() => {});
  }, MACHINE_STATUS_POLL_INTERVAL_MS);
}

async function fetchPublicConfig() {
  const response = await fetch("/config/public");
  const data = await response.json();

  if (!response.ok) {
    throw new Error("Unable to load checkout configuration");
  }

  state.amount = Number(data.orderAmountInr ?? state.amount);
  state.currency = String(data.orderCurrency ?? state.currency);
  state.upiScannerMode = Boolean(data.upiScannerMode);

  amountEl.textContent = `Rs ${state.amount}`;
}

async function createOrder() {
  const response = await fetch("/orders/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ machineId })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? "Unable to create order");
  }

  return data;
}

async function fetchOrderStatus(orderId) {
  const response = await fetch(`/orders/${encodeURIComponent(orderId)}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? "Unable to fetch order status");
  }

  return data;
}

async function verifyPayment(paymentPayload) {
  const response = await fetch("/payments/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(paymentPayload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? "Payment verification failed");
  }

  return data;
}

function openRazorpayCheckout(order) {
  if (typeof window.Razorpay !== "function") {
    throw new Error("Razorpay checkout script did not load");
  }

  const checkout = new window.Razorpay({
    key: order.razorpayKeyId,
    amount: Math.round(order.amount * 100),
    currency: order.currency,
    name: "Smart Vending",
    description: `Order from machine ${order.machineId}`,
    order_id: order.razorpayOrderId,
    handler: async (response) => {
      setMessage("Payment received. Triggering machine...", "success");

      try {
        const verified = await verifyPayment({
          orderId: order.orderId,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature
        });

        if (verified.status === "COMPLETED") {
          setMessage("Dispense complete. Please collect your kit.", "success");
          setMachineStatus("IDLE");
          setBusy(false);
          return;
        }

        if (verified.status === "FAILED") {
          setMessage("Payment verified but dispense failed. Please contact support.", "error");
          setMachineStatus("IDLE");
          setBusy(false);
          return;
        }

        if (verified.dispatch !== "SENT") {
          setMessage("Payment verified, machine dispatch pending.", "success");
          setBusy(false);
          return;
        }

        setMessage("Payment verified. Machine is dispensing your kit...", "success");
        setMachineStatus("DISPENSING");
        startOrderPolling(order.orderId);
      } catch (error) {
        setMessage(error.message, "error");
        setBusy(false);
      }
    },
    modal: {
      ondismiss: () => {
        clearOrderPolling();
        setBusy(false);
        setMessage("Checkout cancelled.");
      }
    },
    theme: {
      color: "#facc15"
    }
  });

  checkout.on("payment.failed", (event) => {
    clearOrderPolling();
    setBusy(false);
    const reason = event?.error?.description || "Payment failed. Please try again.";
    setMessage(reason, "error");
  });

  checkout.open();
}

function startOrderPolling(orderId) {
  clearOrderPolling();
  state.activeOrderId = orderId;
  state.pollDeadlineAt = Date.now() + ORDER_POLL_TIMEOUT_MS;

  const poll = async () => {
    if (state.activeOrderId !== orderId) {
      return;
    }

    try {
      const order = await fetchOrderStatus(orderId);

      if (order.status === "DISPENSING") {
        setMachineStatus("DISPENSING");
      } else if (order.status === "COMPLETED") {
        setMachineStatus("IDLE");
        setMessage("Dispense complete. Please collect your kit.", "success");
        clearOrderPolling();
        setBusy(false);
        return;
      } else if (order.status === "FAILED") {
        setMachineStatus("IDLE");
        const reason = order.failureCode ? ` (${order.failureCode})` : "";
        setMessage(`Dispense failed${reason}. Please contact support.`, "error");
        clearOrderPolling();
        setBusy(false);
        return;
      }
    } catch {
      setMessage("Unable to refresh order status. Retrying...", "error");
    }

    if (Date.now() >= state.pollDeadlineAt) {
      setMessage(`Still waiting for machine confirmation for order ${orderId}.`, "error");
      clearOrderPolling();
      setBusy(false);
      return;
    }

    state.pollTimeoutId = setTimeout(() => {
      void poll();
    }, ORDER_POLL_INTERVAL_MS);
  };

  void poll();
}

payButton.addEventListener("click", async () => {
  if (state.upiScannerMode) {
    setMessage(
      "Use GPay/PhonePe scanner to scan the printed UPI QR on machine. Dispense starts automatically after payment.",
      "success"
    );
    return;
  }

  if (state.busy) {
    return;
  }

  clearOrderPolling();
  setBusy(true);
  setMessage("Creating order...");

  try {
    const order = await createOrder();
    state.amount = order.amount;
    amountEl.textContent = `Rs ${order.amount}`;
    setMessage("Opening secure payment gateway...");
    openRazorpayCheckout(order);
  } catch (error) {
    setMessage(error.message, "error");
    setBusy(false);
  }
});

function init() {
  if (!machineId) {
    setMachineStatus("OFFLINE");
    machineIdEl.textContent = "Invalid";
    payButton.disabled = true;
    setMessage("Missing machineId in URL. Use /buy?machineId=M01", "error");
    return;
  }

  machineIdEl.textContent = machineId;
  amountEl.textContent = `Rs ${state.amount}`;

  void (async () => {
    try {
      await fetchPublicConfig();

      if (state.upiScannerMode) {
        payButton.disabled = true;
        payButton.textContent = "Use UPI Scanner";
        setMessage(
          "Scan printed UPI QR on machine using GPay/PhonePe. Machine will dispense automatically after payment.",
          "success"
        );
      }

      await fetchMachineStatus();
      startMachineStatusPolling();
    } catch (error) {
      setMessage(error.message, "error");
    }
  })();
}

init();
