import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// API Endpoint to provide Firebase Configuration securely from backend
app.get('/api/firebase-config', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyAs2S6iRhnYhmqNuF0QCCYu5NuzxHxIRv0",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "tvnstream-b4497.firebaseapp.com",
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://tvnstream-b4497-default-rtdb.firebaseio.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "tvnstream-b4497",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "tvnstream-b4497.appspot.com",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "308384754214",
    appId: process.env.FIREBASE_APP_ID || "1:308384754214:web:2938e76cd29b288f75d4e7",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-VFNH70R4D9"
  });
});

// Middleware to prevent stale caching of HTML, JS, CSS, and Service Workers
// Solves the issue where code updates aren't reflected without Ctrl+F5
app.use((req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();
  if (!ext || ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json' || req.path === '/sw.js') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.ico', '.woff', '.woff2'].includes(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
  }
  next();
});

// Serve static assets with support for clean URLs (e.g. /home -> /home.html)
app.use(
  express.static(__dirname, {
    extensions: ['html'],
    index: 'index.html',
    dotfiles: 'ignore',
  })
);

// Fallback to index.html for unrecognized routes
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
