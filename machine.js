import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";
import dotenv from "dotenv";

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app, process.env.FIREBASE_DATABASE_URL);

const machineId = process.env.MACHINE_ID || "MO1";

console.log("🤖 Vending machine simulator started...");
console.log("Listening for commands...");

const commandRef = ref(db, `machines/${machineId}/command`);
// onValue(ref(db, `machines/${machineId}`), (snap) => {
//   console.log("FULL MACHINE DATA:", snap.val());
// });

onValue(
  commandRef,
  async (snapshot) => {
    const command = snapshot.val();

    console.log("🔥 Snapshot triggered");

    if (!command) {
      console.log("⚠️ Command is null");
      return;
    }

    console.log("📩 Command received:", command);

    if (command.type === "DISPENSE") {
      console.log("🟢 DISPENSING ITEM...");
      await new Promise((r) => setTimeout(r, 2000));
      console.log("✅ DISPENSE COMPLETE");

      await set(ref(db, `machines/${machineId}/state`), {
        status: "IDLE",
      });
    }

    if (command.type === "WAIT_PAY") {
      console.log("🟡 Waiting for payment...");
    }
  },
  (error) => {
    console.error("❌ Firebase listener error:", error);
  }
);

// onValue(commandRef, async (snapshot) => {
//   const command = snapshot.val();

//   if (!command) return;

//   console.log("📩 Command received:", command);

//   if (command.type === "DISPENSE") {
//     console.log("🟢 DISPENSING ITEM...");

//     // simulate motor delay
//     await new Promise((r) => setTimeout(r, 2000));

//     console.log("✅ DISPENSE COMPLETE");

//     // machine updates its state
//     await set(ref(db, `machines/${machineId}/state`), {
//       status: "IDLE",
//     });
//   }

//   if (command.type === "WAIT_PAY") {
//     console.log("🟡 Waiting for payment...");
//   }
// });
