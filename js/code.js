import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, onValue, get, update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

console.log("✅ Code.js (Quick Access) loaded!");

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

function updateDynamicURL(uid, role, status) {
  let token = sessionStorage.getItem('urlToken');
  if (!token) {
      token = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
      sessionStorage.setItem('urlToken', token);
  }
  const newUrl = `${window.location.pathname}?uid=${uid}&token=${token}&role=${role}&status=${status}`;
  window.history.pushState({ path: newUrl }, '', newUrl);
}

function generateAccessID() {
  return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
}

window.show = function(id) {
  document.querySelectorAll(".glass-card > div").forEach(div => div.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// Ensure user is signed out of any previous accounts before trying to use a code
if (auth.currentUser) {
    signOut(auth);
}

// Quick Code Logic
window.quickCodeLogin = async function() {
  const code = document.getElementById("quick-code-input").value.trim();
  let nickname = document.getElementById("guest-name").value.trim();
  const btn = document.getElementById("btn-quick-login");
  
  if (!code) return alert("Please enter your access code.");
  if (!nickname) nickname = "Guest_" + Math.floor(Math.random() * 10000);

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
  btn.disabled = true;

  try {
    const codeRef = ref(db, "validCodes/" + code);
    const snapshot = await get(codeRef);

    if (snapshot.exists()) {
      const codeData = snapshot.val();
      
      if (codeData.used === true) {
         alert("❌ This code has already been used.");
         btn.innerHTML = 'Unlock Vault'; btn.disabled = false;
         return;
      }

      if (Date.now() < codeData.expiresAt) {
        // Create dummy guest account
        const randomNum = Math.floor(Math.random() * 1000000);
        const dummyEmail = `guest_${randomNum}@zonevault.site`;
        const dummyPassword = `GuestPass!${randomNum}`;

        const userCred = await createUserWithEmailAndPassword(auth, dummyEmail, dummyPassword);
        const uid = userCred.user.uid;
        const newAccessID = generateAccessID();

        // Update DB
        const userProfilePromise = update(ref(db, "users/" + uid), {
          name: nickname, telegramUsername: "Guest User", email: dummyEmail,
          bio: "I am an Access Code guest.", status: "approved", role: "guest", accessID: newAccessID
        });

        const markCodeUsedPromise = update(ref(db, "validCodes/" + code), { 
            used: true, 
            usedBy: nickname 
        });

        await Promise.all([userProfilePromise, markCodeUsedPromise]);

        // Session Setup
        sessionStorage.setItem("internalAccess", "true");
        sessionStorage.setItem("fromIndex", "true");
        sessionStorage.setItem("accessID", newAccessID);
        updateDynamicURL(uid, "guest", "approved");

        show("approved");
        setTimeout(() => { window.location.href = `home.html?access=${newAccessID}`; }, 1200);
      } else {
        alert("❌ This access code has expired.");
        btn.innerHTML = 'Unlock Vault'; btn.disabled = false;
      }
    } else {
      alert("❌ Invalid access code. Please check your spelling.");
      btn.innerHTML = 'Unlock Vault'; btn.disabled = false;
    }
  } catch (error) {
    console.error(error);
    alert("An error occurred. Please try again.");
    btn.innerHTML = 'Unlock Vault'; btn.disabled = false;
  }
};
