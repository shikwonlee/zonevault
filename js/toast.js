// ========================================================
// Zone Vault — Universal Toast & Non-blocking Confirm Dialog
// ========================================================

export function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let toastContainer = null;

export function showToast(message, type = 'info', duration = 3500) {
  if (typeof document === 'undefined') return;

  if (!toastContainer) {
    toastContainer = document.querySelector('.zv-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'zv-toast-container';
      document.body.appendChild(toastContainer);
    }
  }

  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle'
  };

  // Detect type if not explicitly provided
  let detectedType = type;
  if (type === 'info') {
    if (/error|failed|denied|banned|invalid/i.test(message)) detectedType = 'error';
    else if (/warning|criteria|caution/i.test(message)) detectedType = 'warning';
    else if (/success|granted|copied|updated|welcome/i.test(message)) detectedType = 'success';
  }

  const cleanMsg = typeof message === 'string' ? message.replace(/^([❌⚠️✅ℹ️\s]+)/, '') : String(message);
  const iconClass = icons[detectedType] || icons.info;

  const toast = document.createElement('div');
  toast.className = `zv-toast ${detectedType}`;
  toast.innerHTML = `
    <div class="zv-toast-icon"><i class="${iconClass}"></i></div>
    <div class="zv-toast-msg">${escapeHTML(cleanMsg)}</div>
  `;

  toastContainer.appendChild(toast);

  // Trigger GPU-accelerated enter animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('zv-toast-visible');
    });
  });

  const dismiss = () => {
    if (!toast.classList.contains('zv-toast-hiding')) {
      toast.classList.add('zv-toast-hiding');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 350);
    }
  };

  toast.addEventListener('click', dismiss);
  setTimeout(dismiss, duration);
}

// Custom async confirmation dialog (replaces native confirm())
export function showConfirm(options = {}) {
  return new Promise((resolve) => {
    const title = options.title || 'Confirm Action';
    const text = options.text || (typeof options === 'string' ? options : 'Are you sure you want to proceed?');
    const confirmText = options.confirmText || 'Confirm';
    const cancelText = options.cancelText || 'Cancel';
    const isDanger = options.danger !== false;

    let overlay = document.getElementById('zv-confirm-dialog');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'zv-confirm-dialog';
      overlay.className = 'zv-confirm-overlay';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div class="zv-confirm-box">
        <div class="zv-confirm-icon"><i class="fas fa-${isDanger ? 'sign-out-alt' : 'question-circle'}"></i></div>
        <div class="zv-confirm-title">${escapeHTML(title)}</div>
        <div class="zv-confirm-text">${escapeHTML(text)}</div>
        <div class="zv-confirm-actions">
          <button class="zv-btn zv-btn-cancel" id="zv-confirm-no">${escapeHTML(cancelText)}</button>
          <button class="zv-btn ${isDanger ? 'zv-btn-danger' : 'zv-btn-confirm'}" id="zv-confirm-yes">${escapeHTML(confirmText)}</button>
        </div>
      </div>
    `;

    requestAnimationFrame(() => {
      overlay.classList.add('zv-active');
    });

    const cleanup = (result) => {
      overlay.classList.remove('zv-active');
      setTimeout(() => {
        resolve(result);
      }, 250);
    };

    document.getElementById('zv-confirm-no').onclick = () => cleanup(false);
    document.getElementById('zv-confirm-yes').onclick = () => cleanup(true);
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
    };
  });
}

// Attach to window for seamless global availability across all pages
if (typeof window !== 'undefined') {
  window.showToast = showToast;
  window.showConfirm = showConfirm;
  window.escapeHTML = escapeHTML;
}
