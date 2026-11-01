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
  const mediaGrid = document.querySelector('[data-product-media-grid]');
  const messageButton = document.querySelector('[data-product-message]');
  const enquiryStatus = document.querySelector('[data-enquiry-status]');
  const sizeStatus = document.querySelector('[data-size-status]');
  const sizeOptions = [...document.querySelectorAll('input[name="product-size"]')];
  const priceFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2,
  });
  const builtInProducts = {
    'roots-01': {name: 'Roots 01', description: 'A statement piece from The Roots.', image_url: 'assets/roots-01.webp', available_sizes: ['S', 'M', 'L', 'XL']},
    'roots-02': {name: 'Roots 02', description: 'A statement piece from The Roots.', image_url: 'assets/roots-02.webp', available_sizes: ['S', 'M', 'L', 'XL']},
    'roots-03': {name: 'Roots 03', description: 'A statement piece from The Roots.', image_url: 'assets/roots-03.webp', available_sizes: ['S', 'M', 'L', 'XL']},
    'roots-04': {name: 'Roots 04', description: 'A statement piece from The Roots.', image_url: 'assets/roots-04.webp', available_sizes: ['S', 'M', 'L', 'XL']},
  };

  document.getElementById('year').textContent = new Date().getFullYear();

  function setMeta(selector, attribute, value) {
    const element = document.head.querySelector(selector);
    if (element) element.setAttribute(attribute, value);
  }

  function updateProductMetadata(product) {
    const url = new URL('/product', window.location.origin);
    if (key) {
      url.search = `?key=${encodeURIComponent(key)}`;
    } else if (id) {
      url.search = `?id=${encodeURIComponent(id)}`;
    }
    const canonical = url.href;
    const description = `${product.name} from Loom7's Roots clothing collection. ${product.description || 'Explore product details and ask about sizes, price, and availability.'}`
      .replace(/\s+/g, ' ').slice(0, 160);
    const productImage = safeImage(product.image_url);
    const socialImage = productImage ? new URL(productImage, window.location.href).href
      : 'https://loom7.pages.dev/LOOM7_logo_transparent.png';

    document.title = `${product.name} | Loom7`;
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[name="robots"]', 'content', 'index,follow');
    setMeta('link[rel="canonical"]', 'href', canonical);
    setMeta('meta[property="og:type"]', 'content', 'product');
    setMeta('meta[property="og:url"]', 'content', canonical);
    setMeta('meta[property="og:title"]', 'content', document.title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:image"]', 'content', socialImage);
    setMeta('meta[property="og:image:alt"]', 'content', `${product.name} — Loom7 clothing`);
    setMeta('meta[name="twitter:title"]', 'content', document.title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta('meta[name="twitter:image"]', 'content', socialImage);

    const price = product.price === null || product.price === undefined || product.price === ''
      ? null : Number(product.price);
    const availableStock = product.stock_by_size && typeof product.stock_by_size === 'object'
      && Object.entries(product.stock_by_size).some(([size, quantity]) =>
        ['S', 'M', 'L', 'XL'].includes(size) && Number.isInteger(Number(quantity)) && Number(quantity) > 0);
    const structuredProduct = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.description || `${product.name} from Loom7's Roots clothing collection.`,
      image: productImage ? [socialImage] : undefined,
      sku: product.website_key || undefined,
      brand: {'@type': 'Brand', name: 'Loom7'},
      offers: Number.isFinite(price) && price >= 0 && product.stock_by_size
        ? {
          '@type': 'Offer',
          url: canonical,
          priceCurrency: 'INR',
          price: price.toFixed(2),
          availability: availableStock
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          seller: {'@type': 'Organization', name: 'Loom7'},
        }
        : undefined,
    };
    let structuredData = document.getElementById('product-structured-data');
    if (!structuredData) {
      structuredData = document.createElement('script');
      structuredData.id = 'product-structured-data';
      structuredData.type = 'application/ld+json';
      document.head.append(structuredData);
    }
    structuredData.textContent = JSON.stringify(structuredProduct).replace(/</g, '\\u003c');
  }

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

  async function copyMessageToClipboard(message) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(message);
        return true;
      } catch (error) {
        console.warn('Clipboard API unavailable; trying the browser copy fallback.', error);
      }
    }

    const textArea = document.createElement('textarea');
    textArea.value = message;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.append(textArea);
    let copied = false;
    try {
      textArea.select();
      copied = document.execCommand('copy');
    } finally {
      textArea.remove();
    }
    if (!copied) throw new Error('The browser did not allow the enquiry message to be copied.');
    return true;
  }

  function renderProduct(product) {
    title.textContent = product.name;
    updateProductMetadata(product);
    descriptionLabel.textContent = product.description || '';

    const availableSizes = Array.isArray(product.available_sizes)
      ? product.available_sizes
      : ['S', 'M', 'L', 'XL'];
    sizeOptions.forEach(option => {
      option.checked = false;
      option.disabled = !availableSizes.includes(option.value);
    });
    messageButton.disabled = true;
    sizeStatus.hidden = availableSizes.length > 0;
    sizeStatus.textContent = availableSizes.length > 0 ? '' : 'No sizes are currently available.';

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
    mediaGrid.replaceChildren();
    if (Array.isArray(product.gallery_images)) {
      product.gallery_images.forEach((imageUrl, index) => {
        const src = safeImage(imageUrl);
        if (!src) return;
        const galleryImage = document.createElement('img');
        galleryImage.src = src;
        galleryImage.alt = `${product.name} — additional photo ${index + 1}`;
        galleryImage.loading = 'lazy';
        galleryImage.decoding = 'async';
        galleryImage.className = 'product-detail-gallery-photo';
        mediaGrid.append(galleryImage);
      });
    }
    const videoSrc = safeImage(product.video_url);
    if (videoSrc) {
      const video = document.createElement('video');
      video.src = videoSrc;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.setAttribute('aria-label', `${product.name} product video`);
      video.className = 'product-detail-video';
      mediaGrid.append(video);
    }
    detail.hidden = false;
    status.hidden = true;
  }

  sizeOptions.forEach(option => {
    option.addEventListener('change', async () => {
      messageButton.disabled = !sizeOptions.some(size => size.checked && !size.disabled);
      enquiryStatus.hidden = true;
      enquiryStatus.textContent = '';
      enquiryStatus.classList.remove('is-error');

      const selectedSize = sizeOptions.find(size => size.checked && !size.disabled);
      if (!selectedSize) return;
      const message = `Hi Loom7! I’m interested in the ${title.textContent} in size ${selectedSize.value}. Please let me know the ordering details.`;
      try {
        await copyMessageToClipboard(message);
        enquiryStatus.textContent = 'Your enquiry message has been copied. Please paste it into the Instagram chat to send your enquiry.';
      } catch (error) {
        console.error('Unable to copy the Instagram enquiry message.', error);
        enquiryStatus.textContent = `Could not copy the enquiry message. Please copy this message manually: ${message}`;
        enquiryStatus.classList.add('is-error');
      }
      enquiryStatus.hidden = false;
    });
  });

  messageButton.addEventListener('click', () => {
    const selectedSize = sizeOptions.find(option => option.checked && !option.disabled);
    if (!selectedSize) {
      enquiryStatus.textContent = 'Please select a size before enquiring.';
      enquiryStatus.hidden = false;
      enquiryStatus.classList.add('is-error');
      sizeOptions[0].focus();
      return;
    }

    window.open('https://ig.me/m/loom7.co', '_blank', 'noopener,noreferrer');
  });

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
        .select('id, name, description, price, image_url, website_key, available_sizes, stock_by_size, gallery_images, video_url')
        .eq('is_visible', true).is('deleted_at', null).eq('permanently_deleted', false);
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
