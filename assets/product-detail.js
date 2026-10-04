(() => {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('key');
  const id = params.get('id');
  const detail = document.querySelector('[data-product-detail]');
  const status = document.querySelector('[data-product-status]');
  const title = document.querySelector('[data-product-name]');
  const priceLabel = document.querySelector('[data-product-price]');
  const descriptionLabel = document.querySelector('[data-product-description]');
  const image = document.querySelector('[data-product-image]');
  const media = document.querySelector('[data-product-media]');
  const messageLink = document.querySelector('[data-product-message]');
  const priceFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2,
  });
  const builtInProducts = {
    'roots-01': {name: 'Roots 01', description: 'A statement piece from The Roots.', image_url: 'assets/roots-01.webp'},
    'roots-02': {name: 'Roots 02', description: 'A statement piece from The Roots.', image_url: 'assets/roots-02.webp'},
    'roots-03': {name: 'Roots 03', description: 'A statement piece from The Roots.', image_url: 'assets/roots-03.webp'},
    'roots-04': {name: 'Roots 04', description: 'A statement piece from The Roots.', image_url: 'assets/roots-04.webp'},
  };

  document.getElementById('year').textContent = new Date().getFullYear();

  function safeImage(value) {
    if (!value) return '';
    try {
      const url = new URL(value, document.baseURI);
      return ['http:', 'https:'].includes(url.protocol) ? value : '';
    } catch {
      return '';
    }
  }

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.hidden = false;
    status.classList.toggle('is-error', isError);
  }

  function renderProduct(product) {
    title.textContent = product.name;
    document.title = `${product.name} | Loom7`;
    descriptionLabel.textContent = product.description || '';

    const price = product.price === null || product.price === undefined || product.price === ''
      ? null : Number(product.price);
    priceLabel.hidden = !Number.isFinite(price) || price < 0;
    priceLabel.textContent = priceLabel.hidden ? '' : priceFormatter.format(price);

    const src = safeImage(product.image_url);
    image.alt = `${product.name} — Loom7 collection look`;
    if (src) {
      image.src = src;
      image.hidden = false;
      media.classList.remove('is-fallback');
    } else {
      image.removeAttribute('src');
      image.hidden = true;
      media.classList.add('is-fallback');
    }
    media.dataset.fallback = product.name;
    image.onerror = () => {
      image.hidden = true;
      media.classList.add('is-fallback');
    };
    image.onload = () => {
      image.hidden = false;
      media.classList.remove('is-fallback');
    };
    messageLink.href = 'https://ig.me/m/loom7.co';
    messageLink.dataset.message = `Hi Loom7, I'm interested in ${product.name}.`;
    detail.hidden = false;
    status.hidden = true;
  }

  async function loadProduct() {
    if (!key && !id) {
      showStatus('This product link is invalid.', true);
      return;
    }
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      showStatus('This product link is invalid.', true);
      return;
    }
    if (!window.supabase) {
      const fallback = key && builtInProducts[key];
      if (fallback) renderProduct(fallback);
      else showStatus('Product details are temporarily unavailable. Please try again later.', true);
      console.error('Unable to load product details: the Supabase client is unavailable.');
      return;
    }

    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      });
      const productQuery = client.from('products')
        .select('id, name, description, price, image_url, website_key')
        .eq('is_visible', true);
      const [result, hidden] = await Promise.all([
        (key ? productQuery.eq('website_key', key) : productQuery.eq('id', id)).maybeSingle(),
        key ? client.rpc('hidden_website_product_keys') : Promise.resolve({data: [], error: null}),
      ]);
      if (result.error) throw result.error;
      if (hidden.error) throw hidden.error;

      const hiddenKeys = (hidden.data || []).map(row => typeof row === 'string' ? row : Object.values(row)[0]);
      if (key && hiddenKeys.includes(key)) {
        showStatus('This product is no longer available.', true);
        return;
      }

      const product = result.data || (key && builtInProducts[key]);
      if (!product) {
        showStatus('We could not find this product. It may no longer be available.', true);
        return;
      }
      renderProduct(product);
    } catch (error) {
      console.error('Unable to load product details.', error);
      const fallback = key && builtInProducts[key];
      if (fallback) {
        renderProduct(fallback);
        showStatus('Some product details may be unavailable right now. Please message us to confirm.', true);
      } else {
        showStatus('Product details are temporarily unavailable. Please try again later.', true);
      }
    }
  }

  loadProduct();
})();
