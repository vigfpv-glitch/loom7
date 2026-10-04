(() => {
  const defaults = Object.freeze({
    image_url: 'https://raw.githubusercontent.com/vigfpv-glitch/hero-img/main/pomelli_photoshoot_image_4k_0904.png',
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
      const image_url = defaults.image_url;
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
