import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, sendEmailVerification,
  signInWithPopup, GoogleAuthProvider,
  onAuthStateChanged, reload, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, onValue, set, get, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

console.log("✅ Register.js loaded: HARDENED (Email Verification & Access Guard Active)");

const firebaseConfig = {
  apiKey: "AIzaSyAs2S6iRhnYhmqNuF0QCCYu5NuzxHxIRv0",
  authDomain: "tvnstream-b4497.firebaseapp.com",
  databaseURL: "https://tvnstream-b4497-default-rtdb.firebaseio.com",
  projectId: "tvnstream-b4497",
  storageBucket: "tvnstream-b4497.appspot.com",
  messagingSenderId: "308384754214",
  appId: "1:308384754214:web:2938e76cd29b288f75d4e7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const provider = new GoogleAuthProvider();
let currentUid = null;

// Clean session unauthorized security state helper
function revokeSessionAccess() {
  sessionStorage.removeItem("internalAccess");
  sessionStorage.removeItem("fromIndex");
  sessionStorage.removeItem("accessID");
  sessionStorage.removeItem("urlToken");
}

// Maintenance Kill Switch
const maintenanceRef = ref(db, 'settings/maintenanceMode');
onValue(maintenanceRef, (snapshot) => {
  const isUnderMaintenance = snapshot.val();
  const currentPage = window.location.pathname;
  if (isUnderMaintenance === true && !currentPage.includes('maintenance')) {
    sessionStorage.setItem('returnPage', window.location.href);
    window.location.replace('maintenance.html');
  } else if (isUnderMaintenance === false && currentPage.includes('maintenance')) {
    const returnUrl = sessionStorage.getItem('returnPage') || 'index.html';
    window.location.replace(returnUrl); 
  }
});

// Dynamic URL Masking
function updateDynamicURL(uid, role, status) {
  let token = sessionStorage.getItem('urlToken');
  if (!token) {
    token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('urlToken', token);
  }
  const newUrl = `${window.location.pathname}?uid=${encodeURIComponent(uid)}&token=${token}&role=${role}&status=${status}`;
  window.history.pushState({ path: newUrl }, '', newUrl);
}

// UI Section Toggle
window.show = function(id) {
  document.querySelectorAll(".glass-card > div").forEach(div => div.classList.add("hidden"));
  const targetElement = document.getElementById(id);
  if (targetElement) {
    targetElement.classList.remove("hidden");
  }
};

// Email/Password Registration
window.register = function() {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const privacyCheck = document.getElementById("privacy-check");
  const btn = document.getElementById("btn-register");

  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";
  const privacyChecked = privacyCheck ? privacyCheck.checked : false;

  if (!privacyChecked) return alert("You must agree to the Privacy Policy.");
  if (!email || !password) return alert("Please enter both email and password.");
  if (password.length < 8 || !/\d/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return alert("Password must be at least 8 characters long and contain at least one number and one special character.");
  }

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
  btn.disabled = true;

  createUserWithEmailAndPassword(auth, email, password)
    .then(userCred => { 
      revokeSessionAccess();
      return sendEmailVerification(userCred.user);
    })
    .then(() => { 
      show("verify-section"); 
    })
    .catch(e => {
      alert("Registration error: " + e.message);
    })
    .finally(() => {
      btn.innerHTML = 'Create Account'; 
      btn.disabled = false;
    });
};

// Google Single Sign-On
window.googleLogin = async function() {
  const privacyCheck = document.getElementById("privacy-check");
  const privacyChecked = privacyCheck ? privacyCheck.checked : false;

  const authSection = document.getElementById('auth-section');
  if (authSection && !authSection.classList.contains('hidden')) {
    if (!privacyChecked) {
      return alert("You must agree to the Privacy Policy before continuing with Google.");
    }
  }

  try {
    const result = await signInWithPopup(auth, provider);
    await checkUserStatus(result.user);
  } catch (e) {
    alert("Google login error: " + e.message);
  }
};

// Manual Email Verification Check
window.reloadAndCheck = async function() {
  const user = auth.currentUser;
  if (!user) return show("auth-section");

  try {
    await reload(user);
    if (user.emailVerified) {
      await checkUserStatus(user);
    } else {
      alert("❌ Your email is still not verified. Please check your inbox or spam folder.");
    }
  } catch (error) {
    console.error("Verification re-check error:", error);
    alert("Session expired. Please sign in again.");
    await signOut(auth);
    show("auth-section");
  }
};

// Main Routing & Verification Logic
async function checkUserStatus(user) {
  currentUid = user.uid;

  // STRICT SECURITY GUARD: Password auth accounts MUST have email verified
  const isGoogle = user.providerData.some(p => p.providerId === "google.com");
  if (!isGoogle && !user.emailVerified) {
    revokeSessionAccess();
    show("verify-section");
    return;
  }

  const userRef = ref(db, "users/" + currentUid);

  try {
    // 1. Check existing approved user node
    const userSnap = await get(userRef);

    if (userSnap.exists() && userSnap.val().status === "approved") {
      const userData = userSnap.val();

      // Set authorization flags only on confirmed approval
      sessionStorage.setItem("internalAccess", "true");
      sessionStorage.setItem("fromIndex", "true");
      sessionStorage.setItem("accessID", userData.accessID);

      updateDynamicURL(currentUid, userData.role || "user", "approved");

      // Replace history state to prevent back-button routing loops
      window.location.replace(`home.html?access=${encodeURIComponent(userData.accessID)}`);
      return;
    }

    // 2. Check pending join requests
    const reqRef = ref(db, "joinRequests/" + currentUid);
    const reqSnap = await get(reqRef);

    if (!reqSnap.exists()) {
      revokeSessionAccess();
      show("form-section"); 
      return;
    }

    const data = reqSnap.val();
    updateDynamicURL(currentUid, "user", data.status);

    if (data.status === "pending") {
      revokeSessionAccess();
      show("waiting");

      // Listen for realtime account updates
      onValue(userRef, (realtimeUserSnap) => {
        if (realtimeUserSnap.exists()) {
          const userData = realtimeUserSnap.val();
          if (userData.status === "approved") {
            sessionStorage.setItem("internalAccess", "true");
            sessionStorage.setItem("fromIndex", "true");
            sessionStorage.setItem("accessID", userData.accessID);

            show("approved");
            setTimeout(() => { 
              window.location.replace(`home.html?access=${encodeURIComponent(userData.accessID)}`); 
            }, 1200);
          }
        }
      });

      onValue(reqRef, (realtimeReqSnap) => {
        if (realtimeReqSnap.exists() && realtimeReqSnap.val().status === "denied") {
          alert("❌ Your request was denied by the Admin.");
          revokeSessionAccess();
          signOut(auth).then(() => show("auth-section"));
        }
      });

    } else if (data.status === "denied") {
      alert("❌ Your request was denied.");
      revokeSessionAccess();
      signOut(auth).then(() => show("auth-section"));
    }

  } catch (error) {
    console.error("Database Authorization Check Error:", error);
    alert("Error checking account authorization. Please refresh.");
  }
}

// Submit Application Request
window.submitRequest = async function() {
  const nameInput = document.getElementById("name");
  const codeInput = document.getElementById("invite-code");
  const btn = document.getElementById("btn-submit-code");

  let telegramUsername = nameInput ? nameInput.value.trim() : "";
  const inviteCodeInput = codeInput ? codeInput.value.trim() : "";
  const user = auth.currentUser;

  if (!user) return show("auth-section");
  if (!telegramUsername) return alert("Please enter your Telegram username.");

  // Clean Telegram handle input
  telegramUsername = telegramUsername.replace(/[^a-zA-Z0-9_@]/g, '');
  if (!telegramUsername.startsWith('@')) telegramUsername = '@' + telegramUsername;

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
  btn.disabled = true;

  try {
    await set(ref(db, "joinRequests/" + currentUid), {
      telegramUsername: telegramUsername, 
      providedCode: inviteCodeInput || "No code provided", 
      email: user.email,
      provider: user.providerData[0]?.providerId || "password", 
      status: "pending",
      timestamp: serverTimestamp() 
    });

    updateDynamicURL(currentUid, "user", "pending");
    show("waiting");

  } catch (error) {
    console.error("Error submitting request:", error);
    alert("An error occurred while submitting your request. Please try again.");
  } finally {
    btn.innerHTML = 'Submit Request'; 
    btn.disabled = false;
  }
};

// Central Auth Listener Guard
onAuthStateChanged(auth, async user => {
  if (user) {
    sessionStorage.setItem("currentUid", user.uid);
    const isGuest = user.email && user.email.endsWith('@zonevault.site');

    if (!isGuest) {
      try {
        await reload(user);
        const isGoogle = user.providerData.some(p => p.providerId === "google.com");

        if (user.emailVerified || isGoogle) {
          await checkUserStatus(user);
        } else {
          // Strictly force verification view and invalidate authorization flags
          revokeSessionAccess();
          show("verify-section");
        }
      } catch (e) {
        console.warn("Corrupted session detected. Clearing storage...", e);
        revokeSessionAccess();
        indexedDB.deleteDatabase('firebaseLocalStorageDb'); 
        localStorage.clear();
        sessionStorage.clear();
        await signOut(auth);
        show("auth-section");
      }
    }
  } else {
    revokeSessionAccess();
    show("auth-section");
  }
});
