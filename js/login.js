import {
  signInWithEmailAndPassword, onAuthStateChanged,
  reload, signInWithPopup, GoogleAuthProvider, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref, onValue, get, set, update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getMessaging, getToken, onMessage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { app, auth, db } from "./firebase-init.js";
import { setCachedUser } from "./user-cache.js";
import { showToast } from "./toast.js";

console.log("✅ Login.js loaded: DUAL-SEARCH + PURE FIREBASE AUTO-LOGIN");

const provider = new GoogleAuthProvider();
const messaging = getMessaging(app);

setPersistence(auth, browserLocalPersistence).catch(error => {
  console.error("Persistence error:", error);
});

let currentUid = null;

// ==========================================
// 1. MAINTENANCE KILL SWITCH
// ==========================================
const maintenanceRef = ref(db, 'settings/maintenanceMode');
onValue(maintenanceRef, (snapshot) => {
    const isUnderMaintenance = snapshot.val();
    const currentPage = window.location.pathname.toLowerCase();
    if (isUnderMaintenance === true && !currentPage.includes('maintenance')) {
        localStorage.setItem('returnPage', window.location.href);
        window.location.replace('maintenance');
    } 
    else if (isUnderMaintenance === false && currentPage.includes('maintenance')) {
        const returnUrl = localStorage.getItem('returnPage') || 'index';
        window.location.replace(returnUrl); 
    }
});

// ==========================================
// 2. DYNAMIC URL PARAMETERS
// ==========================================
function updateDynamicURL(uid, role, status) {
  let token = localStorage.getItem('urlToken');
  if (!token) {
      token = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
      localStorage.setItem('urlToken', token);
  }
  const newUrl = `${window.location.pathname}?uid=${uid}&token=${token}&role=${role}&status=${status}`;
  window.history.pushState({ path: newUrl }, '', newUrl);
}

// ==========================================
// 3. UI HELPER
// ==========================================
window.show = function(id) {
  document.querySelectorAll(".glass-card > div").forEach(div => div.classList.add("hidden"));
  const target = document.getElementById(id);
  if (target) target.classList.remove("hidden");
}

// ==========================================
// 4. LOGIN ACTIONS & SECURITY COOLDOWN
// ==========================================
let isLoggingIn = false;
let lastLoginAttemptTime = 0;
let cooldownIntervalId = null;

function getCooldownRemaining() {
  const expiry = parseInt(sessionStorage.getItem('zv_login_cooldown_expiry') || '0', 10);
  const remaining = Math.ceil((expiry - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

function startCooldownTimer(seconds) {
  if (cooldownIntervalId) clearInterval(cooldownIntervalId);

  const banner = document.getElementById("login-cooldown-banner");
  const timerText = document.getElementById("cooldown-timer");
  const btn = document.getElementById("btn-login");
  const googleBtn = document.getElementById("btn-google-login");

  if (banner) banner.classList.remove("hidden");
  if (btn) btn.disabled = true;
  if (googleBtn) googleBtn.disabled = true;

  const updateDisplay = (remaining) => {
    if (timerText) timerText.innerText = `${remaining}s`;
    if (btn) btn.innerText = `Please wait ${remaining}s`;
  };

  updateDisplay(seconds);

  cooldownIntervalId = setInterval(() => {
    const remaining = getCooldownRemaining();
    if (remaining <= 0) {
      clearInterval(cooldownIntervalId);
      cooldownIntervalId = null;
      sessionStorage.removeItem('zv_login_cooldown_expiry');
      if (banner) banner.classList.add("hidden");
      if (btn) {
        btn.disabled = false;
        btn.innerText = "Sign In";
      }
      if (googleBtn) googleBtn.disabled = false;
      showToast("Cooldown expired. You may try logging in again.", "info");
    } else {
      updateDisplay(remaining);
    }
  }, 1000);
}

function triggerFailedAttemptCooldown() {
  let failed = parseInt(sessionStorage.getItem('zv_login_failed_count') || '0', 10) + 1;
  sessionStorage.setItem('zv_login_failed_count', failed.toString());

  // Progressive cooldown: 3 failures = 15s, 4 failures = 30s, >=5 failures = 60s
  if (failed >= 3) {
    const cooldownSeconds = failed === 3 ? 15 : (failed === 4 ? 30 : 60);
    const expiry = Date.now() + (cooldownSeconds * 1000);
    sessionStorage.setItem('zv_login_cooldown_expiry', expiry.toString());
    startCooldownTimer(cooldownSeconds);
    showToast(`Too many failed attempts. Security cooldown active for ${cooldownSeconds} seconds.`, "warning");
  }
}

function clearLoginCooldown() {
  sessionStorage.removeItem('zv_login_failed_count');
  sessionStorage.removeItem('zv_login_cooldown_expiry');
  if (cooldownIntervalId) clearInterval(cooldownIntervalId);
}

// Check cooldown on load & init handlers
function initLoginSecurity() {
  if (sessionStorage.getItem("revocationNotice")) {
    sessionStorage.removeItem("revocationNotice");
    setTimeout(() => {
      showToast("Access Revoked: Your session was closed by administration.", "error");
    }, 400);
  }

  const remaining = getCooldownRemaining();
  if (remaining > 0) {
    startCooldownTimer(remaining);
  }

  // Password visibility toggle
  const toggleBtn = document.getElementById("toggleLoginPassword");
  const passwordInput = document.getElementById("password");
  const emailInput = document.getElementById("email");

  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener("click", () => {
      const isPass = passwordInput.type === "password";
      passwordInput.type = isPass ? "text" : "password";
      toggleBtn.classList.toggle("fa-eye", !isPass);
      toggleBtn.classList.toggle("fa-eye-slash", isPass);
    });
  }

  // Enter key submission
  [emailInput, passwordInput].forEach(inp => {
    if (inp) {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          window.login();
        }
      });
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLoginSecurity);
} else {
  initLoginSecurity();
}

window.login = function() {
  const remainingCooldown = getCooldownRemaining();
  if (remainingCooldown > 0) {
    return showToast(`Security cooldown active. Please wait ${remainingCooldown}s.`, "warning");
  }

  // Debounce check: block rapid clicks
  const now = Date.now();
  if (isLoggingIn || (now - lastLoginAttemptTime < 1200)) {
    return;
  }
  lastLoginAttemptTime = now;

  const email = (document.getElementById("email").value || "").trim();
  const password = document.getElementById("password").value;
  const btn = document.getElementById("btn-login");

  if (!email || !password) return showToast("Please enter email and password.", "warning");

  isLoggingIn = true;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
  }
  show("loader-section");

  signInWithEmailAndPassword(auth, email, password)
    .then(() => {
      isLoggingIn = false;
      clearLoginCooldown();
    })
    .catch(e => {
      isLoggingIn = false;
      show("auth-section");
      if (btn) {
        btn.disabled = false;
        btn.innerText = "Sign In";
      }
      triggerFailedAttemptCooldown();
      showToast("Login error: " + e.message, "error");
    });
};

window.googleLogin = async function() {
  const remainingCooldown = getCooldownRemaining();
  if (remainingCooldown > 0) {
    return showToast(`Security cooldown active. Please wait ${remainingCooldown}s.`, "warning");
  }

  try {
    show("loader-section");
    await signInWithPopup(auth, provider);
    clearLoginCooldown();
  } catch (e) {
    show("auth-section");
    showToast("Google login error: " + e.message, "error");
  }
};

// ==========================================
// 5. STRICT DUAL-DATABASE CHECK
// ==========================================
async function checkJoinRequest(user) {
  currentUid = user.uid;

  try {
      const userRef = ref(db, "users/" + currentUid);
      const reqRef = ref(db, "joinRequests/" + currentUid);
      
      const [userSnap, reqSnap] = await Promise.all([get(userRef), get(reqRef)]);

      // SCENARIO A: Nakita sa "users" database
      if (userSnap.exists()) {
          const userData = userSnap.val();
          const userStatus = userData.status || "approved"; 
          const userAccessID = userData.accessID || currentUid;

          if (userStatus === "approved") {
              updateDynamicURL(currentUid, userData.role || "user", "approved");
              
              setCachedUser({
                  uid: currentUid,
                  email: user.email,
                  name: userData.name || userData.telegramUsername || "Vault Member",
                  profilePicture: userData.profilePicture || "https://via.placeholder.com/150",
                  status: userStatus,
                  role: userData.role || "member",
                  accessID: userAccessID,
                  isAdmin: (userData.role || "").toLowerCase() === 'admin'
              });

              if (!userData.status || !userData.accessID) {
                  await update(userRef, { status: "approved", accessID: userAccessID });
              }
              window.location.replace(`home?access=${userAccessID}`); 
              return;
          } else if (userStatus === "denied") {
              showToast("Your account is denied or banned.", "error");
              signOut(auth).then(() => show("auth-section"));
              return;
          }
      }

      // SCENARIO B: Nakita sa "joinRequests" database
      if (reqSnap.exists()) {
          const reqData = reqSnap.val();
          updateDynamicURL(currentUid, "user", reqData.status);

          if (reqData.status === "approved") {
              await set(userRef, { status: "approved", accessID: currentUid, email: user.email, role: "user" });
              window.location.replace(`home?access=${currentUid}`);
              return;
          } else if (reqData.status === "pending") {
              show("waiting");
              onValue(userRef, (realtimeUserSnap) => {
                  if (realtimeUserSnap.exists() && realtimeUserSnap.val().status === "approved") {
                      show("approved");
                      setTimeout(() => window.location.replace(`home?access=${realtimeUserSnap.val().accessID}`), 1200);
                  }
              });
              return;
          } else if (reqData.status === "denied") {
              showToast("Your request was denied.", "error");
              signOut(auth).then(() => show("auth-section"));
              return;
          }
      }

      // SCENARIO C: Wala sa dalawang table (Old Account Auto-Fix)
      console.log("🔄 Old account detected in Auth but missing in DB. Auto-fixing...");
      await set(userRef, {
          status: "approved",
          accessID: currentUid,
          email: user.email || "No Email",
          role: "user"
      });
      window.location.replace(`home?access=${currentUid}`);

  } catch (error) {
      console.error("Status Check Error:", error);
      show("auth-section");
  }
}

// ==========================================
// 6. ACTIVITY TRACKING & NOTIFICATIONS
// ==========================================
function logActivity(action, details) {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  set(ref(db, `userActivities/${uid}/${Date.now()}`), {
    action: action, details: details || window.location.pathname, timestamp: Date.now(), email: auth.currentUser.email
  }).catch(() => {});
}

window.addEventListener("load", () => logActivity("Page Visit", document.title));

async function subscribeToNotifications(userId) {
  try {
    if(Notification.permission === "default") await Notification.requestPermission();
    const token = await getToken(messaging, { vapidKey: "BKIRidsAoqVkU5UwhUq17FGUMLriCTBs9407EC6BNuZ6zgiyaypFVGD7UNGN5JT1SB7iry0t9_jmqJwe94n_T6g" });
    if (token) await update(ref(db, "users/" + userId), { fcmToken: token });
  } catch (err) {}
}

onMessage(messaging, payload => {
  new Notification(payload.notification?.title || "Update", { body: payload.notification?.body });
});

// ==========================================
// 7. AUTH LISTENER (AUTO-LOGIN TRIGGER)
// ==========================================
onAuthStateChanged(auth, async user => {
  if (user) {
    currentUid = user.uid;
    try {
      await reload(user);
      if (user.emailVerified || user.providerData.some(p => p.providerId === "google.com")) {
        checkJoinRequest(user);
        subscribeToNotifications(user.uid);
      } else {
        show("verify-section");
      }
    } catch (e) {
      console.warn("Corrupted old token detected. Wiping cache to fix...");
      indexedDB.deleteDatabase('firebaseLocalStorageDb'); 
      localStorage.clear();
      sessionStorage.clear();
      await signOut(auth);
      show("auth-section");
      showToast("Session refreshed. Please login.", "info");
    }
  } else {
    // KUNG NAG LOGOUT, DITO SIYA BABAGSAK. Papakita na niya ang login form nang hindi nagre-redirect.
    show("auth-section");
  }
});
