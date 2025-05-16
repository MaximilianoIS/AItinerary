// Import the functions you need from the SDKs you need
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { auth } from '/static/firebase-config.js'


const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const loginSubmit = document.getElementById('loginSubmit');
const signupSubmit = document.getElementById('signupSubmit');
const loginError = document.getElementById('loginError');
const signupError = document.getElementById('signupError');

loginBtn.addEventListener('click', () => {
  loginForm.classList.remove('hidden');
  signupForm.classList.add('hidden');
  loginBtn.classList.add('bg-indigo-500', 'text-white');
  signupBtn.classList.remove('bg-indigo-500', 'text-white');
  signupBtn.classList.add('text-gray-600');
});

signupBtn.addEventListener('click', () => {
  signupForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  signupBtn.classList.add('bg-indigo-500', 'text-white');
  loginBtn.classList.remove('bg-indigo-500', 'text-white');
  loginBtn.classList.add('text-gray-600');
});

signupSubmit.addEventListener('click', async (e) => {
e.preventDefault();
const email = document.getElementById('signupEmail').value;
const password = document.getElementById('signupPassword').value;
const username = document.getElementById('signupUsername').value;

try {
const userCredential = await createUserWithEmailAndPassword(auth, email, password);
const user = userCredential.user;

// 🔥 Set the displayName to the username
await updateProfile(user, {
  displayName: username
});
console.log('Signup successful:', user);
//signupError.textContent = ''; // Clear any previous errors
window.location.href = '/'; // Redirect after signup
} catch (error) {
const errorCode = error.code;
const errorMessage = error.message;
console.error('Signup error:', errorCode, errorMessage);
signupError.textContent = errorMessage;
}
});

loginSubmit.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log('Login successful:', user);
    //loginError.textContent = ''; // Clear any previous errors
    window.location.href = '/dashboard'; // Redirect after login
  } catch (error) {
    const errorCode = error.code;
    const errorMessage = error.message;
    console.error('Login error:', errorCode, errorMessage);
    loginError.textContent = errorMessage;
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in. If they are on the login page, redirect to dashboard.
    console.log('User is signed in:', user);
    if (window.location.pathname.endsWith('login') || window.location.pathname === '/') {
      window.location.href = '/';
    }
  } else {
    // User is signed out. If they are not on the login page, redirect to it.
    console.log('User is signed out');
    if (!window.location.pathname.endsWith('login')) {
      window.location.href = 'login';
    }
  }
});