import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

console.log("✅ Maintenance.js loaded!");

// --- 1. FIREBASE SETUP & KILL SWITCH AUTO-REDIRECT ---
const firebaseConfig = {
    apiKey: "AIzaSyAs2S6iRhnYhmqNuF0QCCYu5NuzxHxIRv0",
    authDomain: "tvnstream-b4497.firebaseapp.com",
    databaseURL: "https://tvnstream-b4497-default-rtdb.firebaseio.com",
    projectId: "tvnstream-b4497"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app); 

// Listen to the Kill Switch.
const maintenanceRef = ref(db, 'settings/maintenanceMode');
onValue(maintenanceRef, (snapshot) => {
    const isUnderMaintenance = snapshot.val();
    
    // KUNG TAPOS NA ANG MAINTENANCE (false)
    if (isUnderMaintenance === false) {
        // Kunin ang na-save na link kung saan sila galing (e.g., /collection)
        const returnUrl = sessionStorage.getItem('returnPage');
        
        if (returnUrl) {
            // Kung may na-save, ibalik doon at burahin sa storage
            sessionStorage.removeItem('returnPage');
            window.location.replace(returnUrl); 
        } else {
            // Kung walang na-save (halimbawa: nag-type sila diretso ng /maintenance), ibalik sa index
            window.location.replace('index');
        }
    }
});

// --- 2. THEME LOGIC (To match their previous setting) ---
function initTheme() {
    const savedTheme = localStorage.getItem('zoneTheme') || 'dark';
    if (savedTheme === 'light') document.body.classList.add('light-mode');
}
initTheme();

// --- 3. UI PARTICLES LOGIC ---
const container = document.getElementById("particle-container");
if (container) {
    const particleCount = 40;
    for(let i = 0; i < particleCount; i++){
      const particle = document.createElement("div");
      particle.classList.add("particle");
      const size = Math.random() * 3 + 1;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.top = `${Math.random() * 100}%`;
      particle.style.animationDuration = `${30 + Math.random() * 30}s`; 
      particle.style.animationDelay = `${Math.random() * 15}s`;
      container.appendChild(particle);
    }
}
