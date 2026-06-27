import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, sendEmailVerification,
  signInWithPopup, GoogleAuthProvider,
  onAuthStateChanged, reload, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, onValue, set, get, update, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

console.log("✅ Register.js loaded: FIXED (Token Nuke Active)");

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

// Register Flow (Email/Password)
window.register = function() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const privacyChecked = document.getElementById("privacy-check").checked;
  const btn = document.getElementById("btn-register");
  
  if (!privacyChecked) return alert("You must agree to the Privacy Policy.");
  if (password.length < 8 || !/\d/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) return alert("Password criteria not met.");
  if (!email || !password) return alert("Please enter email and password.");

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
  btn.disabled = true;

  createUserWithEmailAndPassword(auth, email, password)
    .then(userCred => { 
        sendEmailVerification(userCred.user).then(() => { show("verify-section"); }); 
    })
    .catch(e => {
        alert("Registration error: " + e.message);
        btn.innerHTML = 'Create Account'; btn.disabled = false;
    });
};

// Google Login Flow
window.googleLogin = async function() {
  const privacyChecked = document.getElementById("privacy-check").checked;
  if (!privacyChecked) {
      if(!document.getElementById('auth-section').classList.contains('hidden')) {
          return alert("You must agree to the Privacy Policy before continuing with Google.");
      }
  }

  try {
    const result = await signInWithPopup(auth, provider);
    checkUserStatus(result.user);
  } catch (e) {
    alert("Google login error: " + e.message);
  }
};

window.reloadAndCheck = function() {
  const user = auth.currentUser;
  if (user) {
    reload(user).then(() => {
      if (user.emailVerified) checkUserStatus(user);
      else alert("❌ Your email is still not verified.");
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
                  alert("❌ Your request was denied by the Admin.");
                  signOut(auth).then(() => show("auth-section"));
              }
          });
          
      } 
      else if (data.status === "denied") { 
          alert("❌ Your request was denied."); 
          signOut(auth).then(() => show("auth-section")); 
      }
      
  } catch (error) {
      console.error("Database Error:", error);
      alert("Error checking account. Please refresh.");
  }
}

// Submit Request for Approval
window.submitRequest = async function() {
  let telegramUsername = document.getElementById("name").value.trim();
  const inviteCodeInput = document.getElementById("invite-code").value.trim() || "No code provided";
  const user = auth.currentUser;
  const btn = document.getElementById("btn-submit-code");
  
  if (!telegramUsername) return alert("Please enter your Telegram username.");
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
    alert("An error occurred. Please try again.");
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
