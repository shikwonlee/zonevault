// ========================================================
// Zone Vault — Shared Navbar & Header Behavior
// - Header is fully visible at top
// - Auto-hides when user scrolls down, returns on scroll up
// - Mobile bottom bar auto-hides on scroll down, returns on scroll up
// - Highlights active nav link based on current URL
// ========================================================

export function initHeaderScrollBehavior() {
  let lastScrollY = window.pageYOffset || document.documentElement.scrollTop;
  let ticking = false;
  const mobileHeader = document.querySelector('.mobile-header');
  const bottomNav = document.getElementById('bottomNav');

  // Highlight active link in mobile bottom nav
  const currentPath = (window.location.pathname.split('/').pop() || 'home').replace('.html', '') || 'home';
  document.querySelectorAll('.bottom-nav-link').forEach(link => {
    const href = (link.getAttribute('href') || '').replace(/^\//, '').replace('.html', '');
    if (href === currentPath) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Highlight active link in sidebar desktop
  document.querySelectorAll('.sidebar-desktop .nav-link').forEach(link => {
    const href = (link.getAttribute('href') || '').replace(/^\//, '').replace('.html', '');
    if (href === currentPath) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  function update() {
    const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
    const delta = currentScrollY - lastScrollY;

    // Only hide when scrolling down beyond threshold
    if (Math.abs(delta) > 4) {
      if (delta > 0 && currentScrollY > 50) {
        // Scrolling down -> hide header & bottom nav
        if (mobileHeader) mobileHeader.classList.add('header-hidden');
        if (bottomNav) bottomNav.classList.add('hide-on-scroll');
      } else {
        // Scrolling up or near top -> reveal header & bottom nav
        if (mobileHeader) mobileHeader.classList.remove('header-hidden');
        if (bottomNav) bottomNav.classList.remove('hide-on-scroll');
      }
    }

    lastScrollY = currentScrollY <= 0 ? 0 : currentScrollY;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
}

// Auto-run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHeaderScrollBehavior);
} else {
  initHeaderScrollBehavior();
}
