import {
  createUserWithEmailAndPassword, sendEmailVerification,
  signInWithPopup, GoogleAuthProvider,
  onAuthStateChanged, reload, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref, onValue, set, get, update, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { auth, db } from "./firebase-init.js";
import { showToast } from "./toast.js";

console.log("✅ Register.js loaded: FIXED (Token Nuke Active)");
const provider = new GoogleAuthProvider();
let currentUid = null;

// Maintenance Kill Switch
const maintenanceRef = ref(db, 'settings/maintenanceMode');
onValue(maintenanceRef, (snapshot) => {
    const isUnderMaintenance = snapshot.val();
    const currentPage = window.location.pathname;
    if (isUnderMaintenance === true && !currentPage.includes('maintenance')) {
        sessionStorage.setItem('returnPage', window.location.href);
        window.location.href = 'maintenance.html';
    } else if (isUnderMaintenance === false && currentPage.includes('maintenance')) {
        window.location.href = sessionStorage.getItem('returnPage') || 'index.html'; 
    }
});

// Dynamic URL Update
function updateDynamicURL(uid, role, status) {
  let token = sessionStorage.getItem('urlToken');
  if (!token) {
      token = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
      sessionStorage.setItem('urlToken', token);
  }
  const newUrl = `${window.location.pathname}?uid=${uid}&token=${token}&role=${role}&status=${status}`;
  window.history.pushState({ path: newUrl }, '', newUrl);
}

// UI Helper
window.show = function(id) {
  document.querySelectorAll(".glass-card > div").forEach(div => div.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// Password Strength & Toggle Logic
function setupPasswordStrength() {
  const passwordInput = document.getElementById("password");
  const toggleBtn = document.getElementById("togglePassword");
  const criteriaList = document.getElementById("passwordCriteria");
  const meter = document.getElementById("strengthMeter");
  const reqLength = document.getElementById("req-length");
  const reqNumber = document.getElementById("req-number");
  const reqSpecial = document.getElementById("req-special");
  const reqCase = document.getElementById("req-case");
  const strengthText = document.getElementById("strengthText");
  const bar1 = document.getElementById("bar1");
  const bar2 = document.getElementById("bar2");
  const bar3 = document.getElementById("bar3");
  const bar4 = document.getElementById("bar4");

  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      toggleBtn.classList.toggle("fa-eye", !isPassword);
      toggleBtn.classList.toggle("fa-eye-slash", isPassword);
    });
  }

  if (passwordInput && criteriaList && meter) {
    passwordInput.addEventListener("input", () => {
      const val = passwordInput.value;
      if (!val) {
        criteriaList.classList.remove("active");
        meter.classList.remove("active");
        return;
      }
      criteriaList.classList.add("active");
      meter.classList.add("active");

      const hasLength = val.length >= 8;
      const hasNumber = /\d/.test(val);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>\-_=+[\]\\/~`]/.test(val);
      const hasCase = /[A-Z]/.test(val) && /[a-z]/.test(val);

      if (reqLength) reqLength.className = hasLength ? "valid" : "invalid";
      if (reqNumber) reqNumber.className = hasNumber ? "valid" : "invalid";
      if (reqSpecial) reqSpecial.className = hasSpecial ? "valid" : "invalid";
      if (reqCase) reqCase.className = hasCase ? "valid" : "invalid";

      let score = 0;
      if (hasLength) score++;
      if (hasNumber) score++;
      if (hasSpecial) score++;
      if (hasCase) score++;
      if (val.length >= 12) score = Math.min(score + 1, 4);

      // Reset bars
      [bar1, bar2, bar3, bar4].forEach(b => {
        if (b) {
          b.style.backgroundColor = "rgba(255, 255, 255, 0.12)";
          b.style.boxShadow = "none";
        }
      });

      if (score === 0 || score === 1) {
        strengthText.innerText = "Weak";
        strengthText.style.color = "var(--color-weak)";
        if (bar1) bar1.style.backgroundColor = "var(--color-weak)";
      } else if (score === 2) {
        strengthText.innerText = "Fair";
        strengthText.style.color = "var(--color-medium)";
        if (bar1) bar1.style.backgroundColor = "var(--color-medium)";
        if (bar2) bar2.style.backgroundColor = "var(--color-medium)";
      } else if (score === 3) {
        strengthText.innerText = "Good";
        strengthText.style.color = "#84cc16";
        if (bar1) bar1.style.backgroundColor = "#84cc16";
        if (bar2) bar2.style.backgroundColor = "#84cc16";
        if (bar3) bar3.style.backgroundColor = "#84cc16";
      } else {
        strengthText.innerText = "Strong";
        strengthText.style.color = "var(--color-strong)";
        [bar1, bar2, bar3, bar4].forEach(b => {
          if (b) {
            b.style.backgroundColor = "var(--color-strong)";
            b.style.boxShadow = "0 0 6px rgba(34, 197, 94, 0.5)";
          }
        });
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupPasswordStrength);
} else {
  setupPasswordStrength();
}

// Register Flow (Email/Password)
window.register = function() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const privacyChecked = document.getElementById("privacy-check").checked;
  const btn = document.getElementById("btn-register");
  
  if (!privacyChecked) return showToast("You must agree to the Privacy Policy.", "warning");
  if (!email || !password) return showToast("Please enter email and password.", "warning");
  if (password.length < 8 || !/\d/.test(password) || !/[!@#$%^&*(),.?":{}|<>\-_=+[\]\\/~`]/.test(password)) {
    return showToast("Password does not meet the minimum security requirements.", "warning");
  }

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
  btn.disabled = true;

  createUserWithEmailAndPassword(auth, email, password)
    .then(userCred => { 
        sendEmailVerification(userCred.user).then(() => { show("verify-section"); }); 
    })
    .catch(e => {
        showToast("Registration error: " + e.message, "error");
        btn.innerHTML = 'Create Account'; btn.disabled = false;
    });
};

// Google Login Flow
window.googleLogin = async function() {
  const privacyChecked = document.getElementById("privacy-check").checked;
  if (!privacyChecked) {
      if(!document.getElementById('auth-section').classList.contains('hidden')) {
          return showToast("You must agree to the Privacy Policy before continuing with Google.", "warning");
      }
  }

  try {
    const result = await signInWithPopup(auth, provider);
    checkUserStatus(result.user);
  } catch (e) {
    showToast("Google login error: " + e.message, "error");
  }
};

window.reloadAndCheck = function() {
  const user = auth.currentUser;
  if (user) {
    reload(user).then(() => {
      if (user.emailVerified) checkUserStatus(user);
      else showToast("Your email is still not verified.", "info");
    });
  }
};

// Main Routing Logic: Improved
async function checkUserStatus(user) {
  currentUid = user.uid;
  console.log("Checking UID:", currentUid);

  const userRef = ref(db, "users/" + currentUid);
  
  try {
      // 1. Check users node FIRST
      const userSnap = await get(userRef);
      
      if (userSnap.exists() && userSnap.val().status === "approved") {
          const userData = userSnap.val();
          console.log("Profile Found:", userData.status);
          updateDynamicURL(currentUid, userData.role || "user", "approved");
          sessionStorage.setItem("internalAccess", "true");
          sessionStorage.setItem("fromIndex", "true");
          sessionStorage.setItem("accessID", userData.accessID);
          window.location.href = `home.html?access=${userData.accessID}`; // DERECHO SA HOME
          return;
      }

      // 2. If not approved, check joinRequests
      const reqRef = ref(db, "joinRequests/" + currentUid);
      const reqSnap = await get(reqRef);
      
      if (!reqSnap.exists()) {
          console.log("No profile and no request found. Showing form.");
          show("form-section"); 
          return;
      }

      const data = reqSnap.val();
      updateDynamicURL(currentUid, "user", data.status);

      if (data.status === "pending") {
          show("waiting");
          
          // Realtime Listeners
          onValue(userRef, (realtimeUserSnap) => {
              if (realtimeUserSnap.exists()) {
                  const userData = realtimeUserSnap.val();
                  if (userData.status === "approved") {
                      sessionStorage.setItem("internalAccess", "true");
                      sessionStorage.setItem("fromIndex", "true");
                      sessionStorage.setItem("accessID", userData.accessID);
                      show("approved");
                      setTimeout(() => { window.location.href = `home.html?access=${userData.accessID}`; }, 1200);
                  }
              }
          });

          onValue(reqRef, (realtimeReqSnap) => {
              if (realtimeReqSnap.exists() && realtimeReqSnap.val().status === "denied") {
                  showToast("Your request was denied by the Admin.", "error");
                  signOut(auth).then(() => show("auth-section"));
              }
          });
          
      } 
      else if (data.status === "denied") { 
          showToast("Your request was denied.", "error"); 
          signOut(auth).then(() => show("auth-section")); 
      }
      
  } catch (error) {
      console.error("Database Error:", error);
      showToast("Error checking account. Please refresh.", "error");
  }
}

// Submit Request for Approval
window.submitRequest = async function() {
  let telegramUsername = document.getElementById("name").value.trim();
  const inviteCodeInput = document.getElementById("invite-code").value.trim() || "No code provided";
  const user = auth.currentUser;
  const btn = document.getElementById("btn-submit-code");
  
  if (!telegramUsername) return showToast("Please enter your Telegram username.", "warning");
  if (!telegramUsername.startsWith('@')) telegramUsername = '@' + telegramUsername;

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
  btn.disabled = true;

  try {
    await set(ref(db, "joinRequests/" + currentUid), {
      telegramUsername: telegramUsername, 
      providedCode: inviteCodeInput, 
      email: user.email,
      provider: user.providerData[0]?.providerId || "password", 
      status: "pending",
      timestamp: serverTimestamp() 
    });

    updateDynamicURL(currentUid, "user", "pending");
    show("waiting"); 
    checkUserStatus(user);
    
  } catch (error) {
    console.error(error);
    showToast("An error occurred. Please try again.", "error");
    btn.innerHTML = 'Submit Request'; btn.disabled = false;
  }
};

// Auth State Listener
onAuthStateChanged(auth, async user => {
  if (user) {
    sessionStorage.setItem("currentUid", user.uid);
    const isGuest = user.email && user.email.endsWith('@zonevault.site');
    
    if (!isGuest) {
        try {
            await reload(user);
            if (user.emailVerified || user.providerData.some(p => p.providerId === "google.com")) {
              checkUserStatus(user);
            } else {
              show("verify-section");
            }
        } catch (e) {
            console.warn("Corrupted session on Register. Wiping token...", e);
            indexedDB.deleteDatabase('firebaseLocalStorageDb'); 
            localStorage.clear();
            sessionStorage.clear();
            await signOut(auth);
            show("auth-section");
        }
    }
  } else {
    show("auth-section");
  }
});
