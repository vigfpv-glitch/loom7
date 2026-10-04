(() => {
  const form = document.getElementById('newsletter-form');
  if (!form || !window.supabase) return;

  const emailInput = document.getElementById('newsletter-email');
  const nameInput = document.getElementById('newsletter-name');
  const consentCheckbox = document.getElementById('newsletter-consent');
  const submitButton = document.getElementById('newsletter-submit');
  const notice = document.getElementById('newsletter-notice');

  function showNotice(message, isError = false) {
    notice.textContent = message;
    notice.className = 'newsletter-notice' + (isError ? ' error' : ' success');
    notice.classList.remove('hidden');
  }

  function hideNotice() {
    notice.classList.add('hidden');
  }

  function setSubmitting(isSubmitting) {
    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? 'Subscribing…' : 'Subscribe';
    emailInput.disabled = isSubmitting;
    nameInput.disabled = isSubmitting;
    consentCheckbox.disabled = isSubmitting;
  }

  function validateEmail(email) {
    const trimmed = email.trim().toLowerCase();
    if (trimmed.length < 3 || trimmed.length > 320) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideNotice();

    const email = emailInput.value.trim();
    const name = nameInput.value.trim() || null;
    const consented = consentCheckbox.checked;

    if (!email) {
      showNotice('Please enter your email address.', true);
      emailInput.focus();
      return;
    }

    if (!validateEmail(email)) {
      showNotice('Please enter a valid email address.', true);
      emailInput.focus();
      return;
    }

    if (!consented) {
      showNotice('Please agree to receive updates from Loom7.', true);
      consentCheckbox.focus();
      return;
    }

    setSubmitting(true);

    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      });

      const {error} = await client.from('newsletter_subscribers').insert({
        email: email.toLowerCase(),
        full_name: name,
        consented_at: new Date().toISOString(),
      });

      if (error) {
        if (error.code === '23505') {
          showNotice("You're already subscribed. Thank you for being part of our community!", false);
        } else {
          showNotice('Something went wrong. Please try again.', true);
        }
      } else {
        showNotice('Welcome! You have successfully subscribed to our newsletter.', false);
        form.reset();
      }
    } catch {
      showNotice('Something went wrong. Please try again.', true);
    } finally {
      setSubmitting(false);
    }
  });

  emailInput.addEventListener('input', () => {
    if (emailInput.value && !notice.classList.contains('hidden')) {
      hideNotice();
    }
  });

  consentCheckbox.addEventListener('change', () => {
    if (consentCheckbox.checked && !notice.classList.contains('hidden')) {
      hideNotice();
    }
  });
})();
