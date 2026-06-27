import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

console.log("✅ Index.js loaded: Pure Firebase Auto-Login Active");

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

const currentPath = window.location.pathname.toLowerCase();

// ==========================================
// FIREBASE AUTO-LOGIN CHECK
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // MAY ACCOUNT -> I-check ang database tapos tapon sa Home
        try {
            const userRef = ref(db, "users/" + user.uid);
            const userSnap = await get(userRef);
            
            if (userSnap.exists()) {
                const data = userSnap.val();
                const userStatus = data.status || "approved";
                const userAccessID = data.accessID || user.uid;
                
                if (userStatus === "approved") {
                    if (!currentPath.includes("home")) {
                        window.location.replace(`home?access=${userAccessID}`);
                    }
                } else {
                    if (!currentPath.includes("login")) window.location.replace("login");
                }
            } else {
                // Auto-fix for old accounts
                await set(userRef, {
                    status: "approved",
                    accessID: user.uid,
                    email: user.email || "No Email"
                });
                
                if (!currentPath.includes("home")) {
                    window.location.replace(`home?access=${user.uid}`);
                }
            }
        } catch (error) {
            console.error("Database check failed:", error);
            if (!currentPath.includes("login")) window.location.replace("login");
        }
    } else {
        // WALANG ACCOUNT -> Mag-stay lang sa Index at tanggalin ang loading
        console.log("🛑 No user detected. Showing main content.");
        
        const authLoader = document.getElementById("auth-loader");
        const mainContent = document.getElementById("main-app-content");

        // 1. I-hide yung umiikot na loading (with fade out)
        if (authLoader) {
            authLoader.style.opacity = "0";
            setTimeout(() => {
                authLoader.style.display = "none";
            }, 500); // Wait for the transition to finish
        }

        // 2. I-show yung main content ng website mo (with fade in)
        if (mainContent) {
            mainContent.style.visibility = "visible";
            mainContent.style.opacity = "1";
        }
    }
});
