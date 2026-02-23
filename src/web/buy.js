const params = new URLSearchParams(window.location.search);
const machineId = params.get("machineId");

const machineIdEl = document.getElementById("machine-id");
const machineStatusEl = document.getElementById("machine-status");
const amountEl = document.getElementById("amount");
const messageEl = document.getElementById("message");
const payButton = document.getElementById("pay-btn");

const state = {
  amount: 20,
  busy: false
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
  }
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

        if (verified.dispatch === "SENT") {
          setMessage("Payment verified and dispense command sent.", "success");
          setMachineStatus("DISPENSING");
        } else {
          setMessage("Payment verified, machine dispatch pending.", "success");
        }
      } catch (error) {
        setMessage(error.message, "error");
      } finally {
        setBusy(false);
      }
    },
    modal: {
      ondismiss: () => {
        setBusy(false);
        setMessage("Checkout cancelled.");
      }
    },
    theme: {
      color: "#facc15"
    }
  });

  checkout.on("payment.failed", (event) => {
    setBusy(false);
    const reason = event?.error?.description || "Payment failed. Please try again.";
    setMessage(reason, "error");
  });

  checkout.open();
}

payButton.addEventListener("click", async () => {
  if (state.busy) {
    return;
  }

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
  void fetchMachineStatus().catch((error) => {
    setMessage(error.message, "error");
  });
}

init();
