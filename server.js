import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Security & iFrame preview compatibility
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');

  // Anti-cache headers: ensures user side gets latest commit changes immediately
  const p = req.path.toLowerCase();
  if (p.endsWith('.html') || !path.extname(p) || p === '/') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (p.endsWith('.js') || p.endsWith('.css')) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
  }

  next();
});

// Centralized API Endpoint for Firebase configuration (keeps keys hidden from frontend code)
app.get('/api/firebase-config', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyAs2S6iRhnYhmqNuF0QCCYu5NuzxHxIRv0",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "tvnstream-b4497.firebaseapp.com",
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://tvnstream-b4497-default-rtdb.firebaseio.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "tvnstream-b4497",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "tvnstream-b4497.appspot.com",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "308384754214",
    appId: process.env.FIREBASE_APP_ID || "1:308384754214:web:2938e76cd29b288f75d4e7",
    measurementId: "G-VFNH70R4D9"
  });
});

// Helper for caching headers
const applyStaticHeaders = (res, filePath) => {
  if (filePath.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
  }
};

// Clean URLs handler: seamlessly connects pages/ directory while index.html is outside at root
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  // Remove trailing slashes (except root)
  const normalizedPath = req.path.length > 1 && req.path.endsWith('/') ? req.path.slice(0, -1) : req.path;
  const relativePath = normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath;

  if (!relativePath) {
    return next();
  }

  // Check candidates in order:
  // 1. pages/<path>.html
  // 2. pages/<path>
  // 3. <path>.html
  // 4. <path>
  const candidates = [
    path.resolve(__dirname, relativePath + '.html'),
    path.resolve(__dirname, relativePath),
    path.resolve(__dirname, 'pages', relativePath + '.html'),
    path.resolve(__dirname, 'pages', relativePath)
  ];

  for (const candidate of candidates) {
    if (candidate.startsWith(__dirname) && fs.existsSync(candidate)) {
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile()) {
          applyStaticHeaders(res, candidate);
          return res.sendFile(candidate);
        }
      } catch {
        // proceed
      }
    }
  }

  next();
});

// Serve assets from pages directory
app.use('/pages', express.static(path.join(__dirname, 'pages'), {
  extensions: ['html'],
  setHeaders: applyStaticHeaders
}));

// Serve static assets from project root (index.html, css/, js/)
app.use(express.static(__dirname, {
  extensions: ['html'],
  index: 'index.html',
  setHeaders: applyStaticHeaders
}));

// Fallback: root or unknown route handling
app.use((req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).send('Not Found');
  }
  const indexHtml = path.resolve(__dirname, 'index.html');
  if (fs.existsSync(indexHtml)) {
    applyStaticHeaders(res, indexHtml);
    res.sendFile(indexHtml);
  } else {
    res.status(404).send('Not Found');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Zone Vault server running on http://0.0.0.0:${PORT}`);
});
