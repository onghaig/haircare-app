/* Fuller site. Plain JS, no build step. */

/* ---- Settings: fill these in before launch ---------------------------------
 * WAITLIST_ENDPOINT: a form endpoint that accepts a POST with an "email" field and
 *   answers JSON, for example a Formspree form URL (https://formspree.io/f/xxxxxxx).
 *   Leave it empty and the form falls back to opening an email to CONTACT_EMAIL.
 * CONTACT_EMAIL: the support inbox shown on the site.
 */
const WAITLIST_ENDPOINT = '';
const CONTACT_EMAIL = '';
/* -------------------------------------------------------------------------- */

document.documentElement.classList.remove('no-js');

// Nav border once the page scrolls.
const nav = document.querySelector('.nav');
if (nav) {
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

// Reveal blocks as they come into view.
const reveal = document.querySelectorAll('.rv');
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.remove('pending');
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  reveal.forEach((el) => {
    // Anything already on screen stays visible; only blocks further down fade in.
    if (el.getBoundingClientRect().top > window.innerHeight) el.classList.add('pending');
    io.observe(el);
  });
} else {
  document.documentElement.classList.add('no-io');
  reveal.forEach((el) => el.classList.add('in'));
}

// Contact email, wherever the page asks for it.
if (CONTACT_EMAIL) {
  document.querySelectorAll('[data-email]').forEach((el) => {
    el.textContent = CONTACT_EMAIL;
    if (el.tagName === 'A') el.href = `mailto:${CONTACT_EMAIL}`;
    el.classList.remove('fill');
  });
}

// Waitlist forms.
document.querySelectorAll('form.waitlist').forEach((form) => {
  const note = form.parentElement.querySelector('.form-note');
  const say = (text, kind) => {
    if (!note) return;
    note.textContent = text;
    note.className = `form-note ${kind || ''}`;
  };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = form.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      say('That email looks off. Check it and try again.', 'err');
      return;
    }
    if (!WAITLIST_ENDPOINT) {
      if (CONTACT_EMAIL) {
        window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Fuller waitlist')}&body=${encodeURIComponent(`Add me: ${email}`)}`;
        say('Your email app should open. Hit send and you’re on the list.', 'ok');
      } else {
        say('The waitlist opens in a few days. Check back soon.', 'err');
      }
      return;
    }
    const btn = form.querySelector('button');
    btn.disabled = true;
    say('Adding you…');
    try {
      const res = await fetch(WAITLIST_ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      say('You’re on the list. One email when it’s out, nothing else.', 'ok');
    } catch {
      say('That didn’t go through. Try again in a minute.', 'err');
    } finally {
      btn.disabled = false;
    }
  });
});

document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())));
