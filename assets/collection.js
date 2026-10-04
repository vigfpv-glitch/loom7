(() => {
  const grid = document.querySelector('#collection .grid');
  if (!grid || !window.supabase) return;
  const template = grid.querySelector('.product[data-product-key]')?.cloneNode(true);
  if (!template) return;
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
    card.querySelector('.quick-view').dataset.price = priceLabel.hidden ? '' : priceLabel.textContent;
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
    const quickView = card.querySelector('.quick-view');
    quickView.dataset.quickView = name;
    quickView.dataset.description = description;
    quickView.dataset.image = src;
    quickView.dataset.alt = alt;
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
      if (visible.error) return;
      const hiddenKeys = new Set(hidden.error ? [] : (hidden.data || []).map(row => typeof row === 'string' ? row : Object.values(row)[0]));
      const byKey = new Map();
      const added = [];
      (visible.data || []).forEach(product => {
        if (!product.name) return;
        if (product.website_key) byKey.set(product.website_key, product);
        else added.push(product);
      });
      grid.querySelectorAll('.product[data-product-key]').forEach(card => {
        const key = card.dataset.productKey;
        if (hiddenKeys.has(key)) card.remove();
        else if (byKey.has(key)) applyProduct(card, byKey.get(key));
      });
      added.forEach(product => {
        const card = template.cloneNode(true);
        delete card.dataset.productKey;
        card.dataset.productId = product.id;
        const image = card.querySelector('.product-image img');
        image.removeAttribute('src');
        applyProduct(card, product);
        grid.append(card);
      });
    } catch {
      return;
    }
  }

  loadCollection();
})();
