(() => {
  const defaults = Object.freeze({
    label: 'About',
    title: 'WEAR YOUR OWN RHYTHM.',
    body: 'LOOM7 is about clothing that feels like you — not clothing that tells you who to be. Pieces designed for the way you move through every day.',
    cta_text: 'Follow on Instagram',
    cta_link: 'https://www.instagram.com/loom7.co/',
    image_url: 'assets/story-feature.webp',
    image_alt: 'Loom7 fashion collection photo',
  });
  const id = '00000000-0000-4000-8000-000000000002';

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch {
      return '';
    }
  }

  function safeImageUrl(value) {
    if (typeof value !== 'string') return '';
    if (/^assets\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(value)) return value;
    return safeUrl(value);
  }

  function normalize(content = {}) {
    return {
      label: typeof content.label === 'string' && content.label.trim() ? content.label : defaults.label,
      title: typeof content.title === 'string' && content.title.trim() ? content.title : defaults.title,
      body: typeof content.body === 'string' ? content.body : defaults.body,
      cta_text: typeof content.cta_text === 'string' && content.cta_text.trim() ? content.cta_text : defaults.cta_text,
      cta_link: safeUrl(content.cta_link) || defaults.cta_link,
      image_url: safeImageUrl(content.image_url) || defaults.image_url,
      image_alt: typeof content.image_alt === 'string' ? content.image_alt : defaults.image_alt,
    };
  }

  window.Loom7About = {defaults, id, safeUrl, normalize};

  const label = document.getElementById('story-label');
  const title = document.getElementById('story-title');
  const body = document.getElementById('story-text');
  const image = document.getElementById('story-image');
  if (!label || !title || !body || !image) return;

  image.addEventListener('error', () => {
    if (image.getAttribute('src') !== defaults.image_url) {
      image.src = defaults.image_url;
      image.alt = defaults.image_alt;
      return;
    }
    image.hidden = true;
    image.parentElement.classList.add('is-fallback');
  });

  if (!window.supabase) return;

  async function loadAbout() {
    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      });
      const {data, error} = await client.from('about_content')
        .select('label, title, body, cta_text, cta_link, image_url, image_alt')
        .eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return;
      const content = normalize(data);
      label.textContent = content.label;
      title.textContent = content.title;
      body.textContent = content.body;
      body.hidden = !content.body;
      image.alt = content.image_alt;
      image.hidden = false;
      image.parentElement.classList.remove('is-fallback');
      image.src = content.image_url;
    } catch (error) {
      console.warn('Could not load published About Section content.', error);
    }
  }

  loadAbout();
})();
