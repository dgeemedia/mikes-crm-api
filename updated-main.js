// =============================================
//   mikes-site/js/main.js — main JS file for Mikes Constructions Group Ltd website
//   Updated: contact form now posts to CRM backend in addition to Formspree
// =============================================

// ── CRM endpoint — update this to your deployed CRM URL ──
const CRM_ENDPOINT = 'https://your-crm-url.railway.app/api/enquiry';
// e.g. 'https://mikes-crm.railway.app/api/enquiry'

document.addEventListener('DOMContentLoaded', () => {

  // ── Hero badge tap to reveal (mobile) ──
  const badgeItems = document.querySelectorAll('.badge-item');
  badgeItems.forEach(badge => {
    badge.addEventListener('click', () => {
      const isActive = badge.classList.contains('active');
      badgeItems.forEach(b => b.classList.remove('active'));
      if (!isActive) badge.classList.add('active');
    });
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.badge-item')) {
      badgeItems.forEach(b => b.classList.remove('active'));
    }
  });

  // ── Navbar scroll behaviour ──
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 60);
    });
  }

  // ── Mobile menu — fullscreen overlay ──
  const hamburger = document.querySelector('.hamburger');
  const navLinks  = document.querySelector('.nav-links');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      const isOpen = navLinks.classList.contains('open');
      navLinks.classList.toggle('open');
      hamburger.classList.toggle('open');
      document.body.classList.toggle('menu-open', !isOpen);
    });

    navLinks.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => {
        navLinks.classList.remove('open');
        hamburger.classList.remove('open');
        document.body.classList.remove('menu-open');
      })
    );
  }

  // ── Active nav link ──
  const currentPage = location.pathname.split('/').filter(Boolean).pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === currentPage) a.classList.add('active');
  });

  // ── Scroll reveal ──
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('revealed'); observer.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(el => observer.observe(el));
  }

  // ── FAQ accordion ──
  document.querySelectorAll('.faq-item.open .faq-toggle').forEach(toggle => {
    toggle.textContent = '−';
  });

  document.addEventListener('click', e => {
    const question = e.target.closest('.faq-question');
    if (!question) return;
    const item = question.closest('.faq-item');
    if (!item) return;

    const isOpen = item.classList.contains('open');

    document.querySelectorAll('.faq-item').forEach(i => {
      i.classList.remove('open');
      const t = i.querySelector('.faq-toggle');
      if (t) t.textContent = '+';
    });

    if (!isOpen) {
      item.classList.add('open');
      const toggle = item.querySelector('.faq-toggle');
      if (toggle) toggle.textContent = '−';
    }
  });

  // ── Contact form — Formspree + CRM integration ──────────────────────────
  //
  // How it works:
  //   1. Form submits to Formspree as before (George still gets the email)
  //   2. Same data is also sent to the CRM backend
  //   3. CRM saves the enquiry, sends auto-reply to customer, and notifies team
  //
  // The form fields expected by the CRM:
  //   first_name, last_name, email, phone (optional), project_type, message
  //
  // If your contact.html has a single "name" field instead of first/last,
  // see the splitName() helper below — it splits "Mike Smith" → first/last.
  // ─────────────────────────────────────────────────────────────────────────

  function splitName(fullName) {
    const parts = (fullName || '').trim().split(/\s+/);
    const first = parts[0] || '';
    const last  = parts.slice(1).join(' ') || '';
    return { first, last };
  }

  const form = document.getElementById('contact-form');
  if (form) {
    if (window.location.search.includes('sent=true')) {
      const msg = document.getElementById('form-success');
      if (msg) {
        msg.style.display = 'block';
        msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('.form-submit');
      const msg = document.getElementById('form-success');
      btn.textContent = 'Sending…';
      btn.disabled = true;

      // ── Collect form values ──
      const data = new FormData(form);

      // Support both split first/last fields and a single "name" field
      let firstName = data.get('first_name') || '';
      let lastName  = data.get('last_name')  || '';
      if (!firstName) {
        const split = splitName(data.get('name') || '');
        firstName = split.first;
        lastName  = split.last;
      }

      const crmPayload = {
        first_name:   firstName,
        last_name:    lastName,
        email:        data.get('email')        || '',
        phone:        data.get('phone')        || '',
        project_type: data.get('project_type') || data.get('service') || '',
        message:      data.get('message')      || '',
      };

      // ── Run Formspree + CRM in parallel ──
      const [formspreeRes] = await Promise.allSettled([

        // 1. Formspree (unchanged)
        fetch(form.action, {
          method: 'POST',
          body: data,
          headers: { 'Accept': 'application/json' },
        }),

        // 2. CRM backend (fire-and-forget; won't block the user)
        fetch(CRM_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(crmPayload),
        }).catch(err => {
          // CRM failure is silent — Formspree still handles the enquiry
          console.warn('CRM submission failed:', err.message);
        }),

      ]);

      // ── Handle result based on Formspree response ──
      const formspreeOk =
        formspreeRes.status === 'fulfilled' && formspreeRes.value?.ok;

      btn.textContent = 'Send Message';
      btn.disabled = false;

      if (formspreeOk) {
        form.reset();
        if (msg) {
          msg.style.display = 'block';
          msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => { msg.style.display = 'none'; }, 6000);
        }
      } else {
        alert('Sorry, something went wrong. Please email us directly at enquiry@mikes-constructions.co.uk');
      }
    });
  }

  // ── Smooth scroll for anchor links ──
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });

  // ── Stats counter animation ──
  window.runStatsCounters = function () {
    const statNums = document.querySelectorAll('.stat-number[data-count]');
    if (!statNums.length) return;

    const countObs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseInt(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const prefix = el.dataset.prefix || '';
        let start = 0;
        const step = Math.ceil(target / 50);
        const interval = setInterval(() => {
          start = Math.min(start + step, target);
          el.innerHTML = prefix + start + suffix;
          if (start >= target) clearInterval(interval);
        }, 30);
        countObs.unobserve(el);
      });
    }, { threshold: 0.5 });

    statNums.forEach(n => {
      const prefix = n.dataset.prefix || '';
      const suffix = n.dataset.suffix || '';
      n.textContent = prefix + '0' + suffix;
      countObs.observe(n);
    });
  };

  window.runStatsCounters();

  // ── Project filter tabs ──
  const filterTabs = document.querySelectorAll('.filter-btn');
  if (filterTabs.length) {
    filterTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        filterTabs.forEach(b => {
          b.classList.remove('active', 'btn-dark');
          b.style.background = 'var(--light)';
          b.style.color = 'var(--text)';
          b.style.border = '1px solid var(--border)';
        });
        btn.classList.add('active', 'btn-dark');
        btn.style.background = '';
        btn.style.color = '';
        btn.style.border = '';

        const filter = btn.dataset.filter;
        const items  = document.querySelectorAll('.gallery-item');

        items.forEach(item => {
          const cat = item.dataset.category || '';
          const show = filter === 'all' || cat === filter;

          if (show) {
            item.style.display = '';
            item.classList.remove('revealed');
            setTimeout(() => {
              const revealObs = new IntersectionObserver(entries => {
                entries.forEach(e => {
                  if (e.isIntersecting) { e.target.classList.add('revealed'); revealObs.unobserve(e.target); }
                });
              }, { threshold: 0.1 });
              revealObs.observe(item);
            }, 10);
          } else {
            item.style.display = 'none';
          }
        });
      });
    });
  }

});
