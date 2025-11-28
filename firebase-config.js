// --- firebase-config.js ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCghG7M0JHfnxWaIyeHdyWFLqVemgfhYeU",
  authDomain: "my-budget-70b48.firebaseapp.com",
  projectId: "my-budget-70b48",
  storageBucket: "my-budget-70b48.firebasestorage.app",
  messagingSenderId: "142399435768",
  appId: "1:142399435768:web:b69545dfa5c35b4471dc0d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Export ตัวแปรออกไปให้ไฟล์อื่นใช้
export { app, db };