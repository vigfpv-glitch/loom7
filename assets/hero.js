(() => {
  const defaults = Object.freeze({
    title: 'Timeless styles for modern you',
    subtitle: 'Clothing made for the way you move through every day. Explore The Roots collection and message us on Instagram to order.',
    cta_text: 'Order via Instagram DM',
    cta_link: 'https://ig.me/m/loom7.co',
    image_url: 'https://raw.githubusercontent.com/vigfpv-glitch/hero-img/main/pomelli_photoshoot_image_4k_0904.png',
    image_urls: Object.freeze([
      'https://raw.githubusercontent.com/vigfpv-glitch/hero-img/main/pomelli_photoshoot_image_4k_0904.png',
      'assets/roots-01.webp',
      'assets/roots-02.webp',
      'assets/roots-03.webp',
      'assets/roots-04.webp',
    ]),
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

  function safeImageUrl(value) {
    if (typeof value !== 'string') return '';
    if (/^assets\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(value)) return value;
    return safeUrl(value);
  }

  function isMissingImageUrlsColumn(error) {
    return error && error.code === '42703'
      && typeof error.message === 'string' && error.message.includes('image_urls');
  }

  function normalize(content = {}) {
    const imageUrl = safeImageUrl(content.image_url) || defaults.image_url;
    const imageUrls = Array.isArray(content.image_urls)
      ? content.image_urls.map(safeImageUrl).filter(Boolean)
      : [];
    return {
      title: typeof content.title === 'string' && content.title.trim() ? content.title : defaults.title,
      subtitle: typeof content.subtitle === 'string' ? content.subtitle : defaults.subtitle,
      cta_text: typeof content.cta_text === 'string' && content.cta_text.trim() ? content.cta_text : defaults.cta_text,
      cta_link: safeUrl(content.cta_link) || defaults.cta_link,
      image_url: imageUrls[0] || imageUrl,
      image_urls: imageUrls.length ? imageUrls : [imageUrl, ...defaults.image_urls.slice(1)],
    };
  }

  window.Loom7Hero = {defaults, id, safeUrl, safeImageUrl, normalize};

  const title = document.getElementById('hero-title');
  const image = document.getElementById('hero-image');
  const slideshow = image && image.parentElement;
  const indicators = slideshow && slideshow.querySelector('.hero-indicators');
  let slides = slideshow ? Array.from(slideshow.querySelectorAll('[data-hero-slide]')) : [];
  if (!title || !image || !slideshow || !indicators) return;

  let activeSlideIndex = 0;
  let slideTimer = null;

  function updateIndicators() {
    const buttons = Array.from(indicators.querySelectorAll('[data-hero-go-to]'));
    buttons.forEach((button, index) => {
      const unavailable = !slides[index] || slides[index].hidden || slides[index].classList.contains('is-unavailable');
      button.hidden = unavailable;
      button.setAttribute('aria-current', String(index === activeSlideIndex && !unavailable));
    });
    indicators.hidden = buttons.filter(button => !button.hidden).length < 2;
  }

  function showSlide(startIndex) {
    const nextOffset = slides.findIndex((_, offset) => {
      const index = (startIndex + offset) % slides.length;
      return !slides[index].hidden && !slides[index].classList.contains('is-unavailable');
    });
    const nextIndex = nextOffset < 0 ? -1 : (startIndex + nextOffset) % slides.length;
    if (nextIndex < 0) {
      slideshow.classList.add('is-fallback');
      return;
    }

    activeSlideIndex = nextIndex;
    slides.forEach((slide, index) => {
      const active = index === activeSlideIndex;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
    });
    updateIndicators();
    slideshow.classList.remove('is-fallback');
  }

  indicators.addEventListener('click', (event) => {
    const button = event.target.closest('[data-hero-go-to]');
    if (button && indicators.contains(button)) showSlide(Number(button.dataset.heroGoTo));
  });

  function handleSlideError(slide) {
    slide.addEventListener('error', () => {
      if (slide === image && image.getAttribute('src') !== defaults.image_url) {
        image.hidden = false;
        image.classList.remove('is-unavailable');
        image.src = defaults.image_url;
        return;
      }
      slide.hidden = true;
      slide.classList.add('is-unavailable');
      if (slide.classList.contains('is-active')) showSlide((slides.indexOf(slide) + 1) % slides.length);
      updateIndicators();
      if (slides.every((item) => item.hidden || item.classList.contains('is-unavailable'))) {
        slideshow.classList.add('is-fallback');
      }
    });
  }

  function setSlides(imageUrls) {
    slides.slice(1).forEach(slide => slide.remove());
    indicators.replaceChildren();
    slides = [image];
    image.hidden = false;
    image.classList.remove('is-unavailable');
    image.src = imageUrls[0] || defaults.image_url;
    image.alt = 'Model wearing a contemporary Loom7 outfit';
    image.classList.add('is-active');
    image.setAttribute('aria-hidden', 'false');

    imageUrls.slice(1).forEach((src, index) => {
      const slide = document.createElement('img');
      slide.dataset.heroSlide = '';
      slide.src = src;
      slide.alt = `Loom7 collection look ${index + 2}`;
      slide.setAttribute('aria-hidden', 'true');
      handleSlideError(slide);
      slideshow.append(slide);
      slides.push(slide);
    });
    slides.forEach((_, index) => {
      const button = document.createElement('button');
      button.className = 'hero-indicator';
      button.type = 'button';
      button.dataset.heroGoTo = String(index);
      button.setAttribute('aria-label', `Show hero image ${index + 1} of ${slides.length}`);
      button.setAttribute('aria-current', String(index === 0));
      indicators.append(button);
    });
    activeSlideIndex = 0;
    showSlide(0);
    if (slideTimer) window.clearInterval(slideTimer);
    if (slides.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      slideTimer = window.setInterval(() => showSlide((activeSlideIndex + 1) % slides.length), 4500);
    }
  }

  handleSlideError(image);
  slides.slice(1).forEach(slide => slide.remove());
  setSlides(defaults.image_urls);

  async function loadHero() {
    if (!window.supabase) return;
    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      });
      let {data, error} = await client.from('hero_content')
        .select('title, subtitle, cta_text, cta_link, image_url, image_urls').eq('id', id).maybeSingle();
      if (isMissingImageUrlsColumn(error)) {
        console.warn('The hero slideshow migration is not installed. Run supabase/hero.sql to enable saved slideshow images.');
        const legacy = await client.from('hero_content')
          .select('title, subtitle, cta_text, cta_link, image_url').eq('id', id).maybeSingle();
        data = legacy.data;
        error = legacy.error;
      }
      if (error) throw error;
      if (!data) return;
      const content = normalize(data);
      title.textContent = content.title;
      const subtitle = document.getElementById('hero-subtitle');
      subtitle.textContent = content.subtitle;
      subtitle.hidden = !content.subtitle;
      setSlides(content.image_urls);
    } catch (error) {
      console.warn('Could not load published Hero Section content.', error);
    }
  }

  loadHero();
})();
