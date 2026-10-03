(() => {
  const defaults = Object.freeze({
    title: 'Timeless styles for modern you',
    subtitle: 'Clothing made for the way you move through every day. Explore The Roots collection and message us on Instagram to order.',
    cta_text: 'Order via Instagram DM',
    cta_link: 'https://ig.me/m/loom7.co',
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

  function normalize(content = {}) {
    return {
      title: typeof content.title === 'string' && content.title.trim() ? content.title : defaults.title,
      subtitle: typeof content.subtitle === 'string' ? content.subtitle : defaults.subtitle,
      cta_text: typeof content.cta_text === 'string' && content.cta_text.trim() ? content.cta_text : defaults.cta_text,
      cta_link: safeUrl(content.cta_link) || defaults.cta_link,
      image_url: safeUrl(content.image_url) || defaults.image_url,
    };
  }

  window.Loom7Hero = {defaults, id, safeUrl, normalize};

  const title = document.getElementById('hero-title');
  if (!title || !window.supabase) return;
  const image = document.getElementById('hero-image');
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
        .select('title, subtitle, cta_text, cta_link, image_url').eq('id', id).maybeSingle();
      if (error || !data) return;
      const content = normalize(data);
      title.textContent = content.title;
      document.getElementById('hero-subtitle').textContent = content.subtitle;
      const button = document.getElementById('hero-cta');
      button.textContent = content.cta_text;
      button.href = content.cta_link;
      if (content.image_url !== image.getAttribute('src')) {
        image.hidden = false;
        image.parentElement.classList.remove('is-fallback');
        image.src = content.image_url;
      }
    } catch {
      return;
    }
  }

  loadHero();
})();
