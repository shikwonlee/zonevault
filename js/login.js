import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged,
  reload, signInWithPopup, GoogleAuthProvider, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, onValue, get, set, update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getMessaging, getToken, onMessage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

console.log("✅ Login.js loaded: DUAL-SEARCH + PURE FIREBASE AUTO-LOGIN");

const firebaseConfig = {
  apiKey: "AIzaSyAs2S6iRhnYhmqNuF0QCCYu5NuzxHxIRv0",
  authDomain: "tvnstream-b4497.firebaseapp.com",
  databaseURL: "https://tvnstream-b4497-default-rtdb.firebaseio.com",
  projectId: "tvnstream-b4497",
  storageBucket: "tvnstream-b4497.appspot.com",
  messagingSenderId: "308384754214",
  appId: "1:308384754214:web:2938e76cd29b288f75d4e7",
  measurementId: "G-VFNH70R4D9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
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
// 4. LOGIN ACTIONS
// ==========================================
window.login = function() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (!email || !password) return alert("Please enter email and password.");
  
  show("loader-section");
  signInWithEmailAndPassword(auth, email, password)
    .catch(e => {
      show("auth-section");
      alert("Login error: " + e.message);
    });
};

window.googleLogin = async function() {
  try {
    show("loader-section");
    await signInWithPopup(auth, provider);
  } catch (e) {
    show("auth-section");
    alert("Google login error: " + e.message);
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
              
              if (!userData.status || !userData.accessID) {
                  await update(userRef, { status: "approved", accessID: userAccessID });
              }
              window.location.replace(`home?access=${userAccessID}`); 
              return;
          } else if (userStatus === "denied") {
              alert("❌ Your account is denied or banned.");
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
              alert("❌ Your request was denied.");
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
      alert("Old session detected and cleared. Please login one more time.");
    }
  } else {
    // KUNG NAG LOGOUT, DITO SIYA BABAGSAK. Papakita na niya ang login form nang hindi nagre-redirect.
    show("auth-section");
  }
});
