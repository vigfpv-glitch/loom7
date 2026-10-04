(() => {
  const defaults = Object.freeze({
    image_url: 'assets/hero-static.webp',
  });
  const id = '00000000-0000-4000-8000-000000000001';

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch {
      return '';
    }
  }

  window.Loom7Hero = {defaults, id, safeUrl};

  const image = document.getElementById('hero-image');
  if (!image || !window.supabase) return;

  image.onerror = () => {
    if (image.getAttribute('src') !== defaults.image_url) {
      image.src = defaults.image_url;
    } else {
      image.hidden = true;
      image.parentElement.classList.add('is-fallback');
    }
  };

  async function loadHero() {
    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      });
      const {data, error} = await client.from('hero_content')
        .select('image_url').eq('id', id).maybeSingle();
      if (error || !data) return;
      const image_url = safeUrl(data.image_url) || defaults.image_url;
      if (image_url !== image.getAttribute('src')) {
        image.hidden = false;
        image.parentElement.classList.remove('is-fallback');
        image.src = image_url;
      }
    } catch {
      return;
    }
  }

  loadHero();
})();
