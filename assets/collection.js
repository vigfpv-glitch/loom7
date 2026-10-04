(() => {
  const grid = document.querySelector('#collection .grid');
  if (!grid) return;
  const pageTemplate = document.querySelector('#product-template');
  const template = grid.querySelector('.product[data-product-key]')?.cloneNode(true)
    || pageTemplate?.content.firstElementChild?.cloneNode(true);
  const pageSize = Number(grid.dataset.pageSize) || 8;
  const countLabel = document.querySelector('[data-collection-count]');
  const progress = document.querySelector('[data-collection-progress]');
  const loadMoreButton = document.querySelector('[data-collection-load-more]');
  const status = document.querySelector('[data-collection-status]');
  if (!template) {
    console.error('Unable to load collection products: no product card template was found.');
    if (status) {
      status.textContent = 'The collection could not be loaded. Please try again later.';
      status.hidden = false;
    }
    return;
  }
  const priceFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2,
  });

  function safeImage(value) {
    if (!value) return '';
    try {
      const url = new URL(value, document.baseURI);
      return ['http:', 'https:'].includes(url.protocol) ? value : '';
    } catch {
      return '';
    }
  }

  function applyProduct(card, product) {
    const name = product.name;
    const description = product.description || '';
    const message = `Hi Loom7, I'm interested in ${name}.`;
    const alt = `${name} — Loom7 collection look`;
    const link = card.querySelector('.product-card');
    link.dataset.instagramProduct = name;
    link.dataset.message = message;
    link.setAttribute('aria-label', `Message Loom7 about ${name} on Instagram`);
    card.querySelector('.product-copy h3').textContent = name;
    const price = product.price === null || product.price === undefined || product.price === ''
      ? null : Number(product.price);
    const priceLabel = card.querySelector('.product-price');
    priceLabel.hidden = !Number.isFinite(price) || price < 0;
    priceLabel.textContent = priceLabel.hidden ? '' : priceFormatter.format(price);
    const quickView = card.querySelector('.quick-view');
    if (quickView) quickView.dataset.price = priceLabel.hidden ? '' : priceLabel.textContent;
    card.querySelector('.product-copy p:not(.product-price)').textContent = description;
    const media = card.querySelector('.product-image');
    media.dataset.fallback = name;
    const image = media.querySelector('img');
    const src = safeImage(product.image_url);
    image.alt = alt;
    if (src) {
      if (image.getAttribute('src') !== src) {
        image.hidden = false;
        media.classList.remove('is-fallback');
        image.src = src;
      }
    } else {
      image.hidden = true;
      image.removeAttribute('src');
      media.classList.add('is-fallback');
    }
    if (quickView) {
      quickView.dataset.quickView = name;
      quickView.dataset.description = description;
      quickView.dataset.image = src;
      quickView.dataset.alt = alt;
    }
  }

  function makeProductCard(product) {
    const card = template.cloneNode(true);
    if (product.website_key) card.dataset.productKey = product.website_key;
    else delete card.dataset.productKey;
    card.dataset.productId = product.id;
    const image = card.querySelector('.product-image img');
    image.removeAttribute('src');
    applyProduct(card, product);
    return card;
  }

  function setupProductVisibility() {
    const cards = [...grid.querySelectorAll('.product')];
    let visibleCount = Math.min(pageSize, cards.length);

    function render() {
      cards.forEach((card, index) => {
        card.hidden = index >= visibleCount;
      });

      if (countLabel) {
        countLabel.textContent = loadMoreButton
          ? `You have viewed ${visibleCount} of ${cards.length} products`
          : `Showing ${visibleCount ? 1 : 0}–${visibleCount} of ${cards.length} pieces`;
      }
      if (progress) {
        progress.max = Math.max(cards.length, 1);
        progress.value = visibleCount;
      }
      if (loadMoreButton) loadMoreButton.hidden = visibleCount >= cards.length;
    }

    loadMoreButton?.addEventListener('click', () => {
      visibleCount = Math.min(visibleCount + pageSize, cards.length);
      render();
    });
    render();
  }

  async function loadCollection() {
    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      });
      const [visible, hidden] = await Promise.all([
        client.from('products').select('id, name, description, price, image_url, website_key')
          .eq('is_visible', true).order('created_at', {ascending: true}),
        client.rpc('hidden_website_product_keys'),
      ]);
      if (visible.error) throw visible.error;
      const hiddenKeys = new Set(hidden.error ? [] : (hidden.data || []).map(row => typeof row === 'string' ? row : Object.values(row)[0]));
      const existingByKey = new Map(
        [...grid.querySelectorAll('.product[data-product-key]')]
        .map(card => [card.dataset.productKey, card]),
      );
      grid.querySelectorAll('.product[data-product-key]').forEach(card => {
        if (hiddenKeys.has(card.dataset.productKey)) card.remove();
      });
      (visible.data || []).forEach(product => {
        if (!product.name || (product.website_key && hiddenKeys.has(product.website_key))) return;
        const existing = product.website_key && existingByKey.get(product.website_key);
        if (existing) applyProduct(existing, product);
        else {
          const card = makeProductCard(product);
          grid.append(card);
          if (product.website_key) existingByKey.set(product.website_key, card);
        }
      });
      if (status) status.hidden = true;
      setupProductVisibility();
    } catch (error) {
      console.error('Unable to load collection products.', error);
      if (status) {
        status.textContent = 'The collection could not be loaded. Please try again later.';
        status.hidden = false;
      }
      setupProductVisibility();
    }
  }

  if (window.supabase) {
    loadCollection();
  } else {
    console.error('Unable to load collection products: the Supabase client is unavailable.');
    if (status) {
      status.textContent = 'The collection could not be loaded. Please try again later.';
      status.hidden = false;
    }
    setupProductVisibility();
  }
})();
