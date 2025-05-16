import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// Use the config injected by Flask into the HTML
const firebaseConfig = window.firebaseConfig;

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get Auth service
const auth = getAuth(app);

export { auth };

