import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "",
  authDomain: "aitinerary-2f93e.firebaseapp.com",
  projectId: "aitinerary-2f93e",
  storageBucket: "aitinerary-2f93e.firebasestorage.app",
  messagingSenderId: "735103404793",
  appId: "1:735103404793:web:46f2decc1bb059239e3028",
  measurementId: "G-ESKL6GZQHJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get Auth service
const auth = getAuth(app);

export { auth };
