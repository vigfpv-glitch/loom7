const $ = (id) => document.getElementById(id);
const authView = $('auth');
const appView = $('app');
const authNotice = $('authNotice');
const notice = $('notice');
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
let db = null;
let products = [];
let productLoadVersion = 0;
let subscribers = [];
let pendingDelete = null;
let currentImageUrl = '';
let previewObjectUrl = '';
let editingProduct = null;
let editSaving = false;
let editPreviewObjectUrl = '';
let productGalleryPreviewUrls = [];
let productVideoPreviewUrl = '';
let editGalleryPreviewUrls = [];
let editVideoPreviewUrl = '';
let editGalleryUrls = [];
let editRemovedGalleryUrls = new Set();
let editVideoUrl = '';
let currentHeroImages = [...window.Loom7Hero.defaults.image_urls];
let heroNewImages = [];
let heroPreviewObjectUrls = [];
let heroLoaded = false;
let heroSchemaReady = false;
let heroLoadVersion = 0;
let currentAboutImage = '';
let aboutImagePreviewUrl = '';
let aboutLoaded = false;
let aboutSchemaReady = false;
let aboutLoadVersion = 0;
const priceFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const productSizes = ['S', 'M', 'L', 'XL'];

function selectedProductSizes(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
}

function setProductSizes(name, availableSizes) {
  const sizes = Array.isArray(availableSizes) ? availableSizes : productSizes;
  document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
    input.checked = sizes.includes(input.value);
  });
}

function showMessage(node, text, type = '') {
  node.textContent = text;
  node.className = 'notice' + (type ? ' ' + type : '');
}

function setBusy(button, busy, text) {
  if (busy) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? text : button.dataset.label;
}

function showAuth() {
  authView.classList.remove('hidden');
  appView.classList.add('hidden');
  $('signout').classList.add('hidden');
  products = [];
  productLoadVersion += 1;
  subscribers = [];
  $('productsList').replaceChildren();
  $('subscribersList').replaceChildren();
  $('totalProducts').textContent = '—';
  $('visibleProducts').textContent = '—';
  $('totalSubscribers').textContent = '—';
  $('productSearch').value = '';
  $('subscriberSearch').value = '';
  $('visibilityFilter').value = 'all';
  $('collectionNotice').classList.add('hidden');
  $('collectionRetry').classList.add('hidden');
  resetProductForm();
  closeEditDialog(true);
  heroLoadVersion += 1;
  heroLoaded = false;
  heroSchemaReady = false;
  $('heroFields').disabled = true;
  $('heroUpload').value = '';
  currentHeroImages = [...window.Loom7Hero.defaults.image_urls];
  heroNewImages = [];
  updateHeroPreview();
  $('heroNotice').classList.add('hidden');
  $('heroRetry').classList.add('hidden');
  aboutLoadVersion += 1;
  aboutLoaded = false;
  aboutSchemaReady = false;
  $('aboutFields').disabled = true;
  $('aboutImage').value = '';
  $('aboutRetry').classList.add('hidden');
  $('aboutNotice').classList.add('hidden');
  if (aboutImagePreviewUrl) URL.revokeObjectURL(aboutImagePreviewUrl);
  aboutImagePreviewUrl = '';
  notice.classList.add('hidden');
  selectTab($('productsTab'));
}

async function enterApp(user) {
  const {data, error} = await db.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!data) {
    await db.auth.signOut();
    showAuth();
    showMessage(authNotice, 'This account is not authorized for the admin panel.', 'error');
    return;
  }
  authView.classList.add('hidden');
  appView.classList.remove('hidden');
  $('signout').classList.remove('hidden');
  $('password').value = '';
  await Promise.all([loadProducts(), loadSubscribers(), loadHeroContent(), loadAboutContent()]);
}

function updateAboutPreview(file = null) {
  if (aboutImagePreviewUrl) URL.revokeObjectURL(aboutImagePreviewUrl);
  aboutImagePreviewUrl = file ? URL.createObjectURL(file) : '';
  const image = $('aboutPreviewImage');
  image.src = aboutImagePreviewUrl || currentAboutImage || window.Loom7About.defaults.image_url;
  image.hidden = false;
  $('aboutPreviewStatus').textContent = file
    ? `${file.name} selected; save to publish the new image.`
    : 'Current website image. Choose a file above to replace it.';
  image.onerror = () => {
    image.hidden = true;
    showMessage($('aboutNotice'), 'The About image preview could not be loaded. Choose a replacement before saving.', 'error');
  };
}

async function loadAboutContent() {
  const version = ++aboutLoadVersion;
  aboutLoaded = false;
  $('aboutFields').disabled = true;
  $('aboutRetry').classList.add('hidden');
  $('aboutForm').setAttribute('aria-busy', 'true');
  showMessage($('aboutNotice'), 'Loading your About Section…');
  try {
    const {data, error} = await db.from('about_content')
      .select('label, title, body, cta_text, cta_link, image_url, image_alt')
      .eq('id', window.Loom7About.id).maybeSingle();
    if (version !== aboutLoadVersion) return;
    if (error) throw error;
    const content = window.Loom7About.normalize(data || {});
    $('aboutLabel').value = content.label;
    $('aboutTitle').value = content.title;
    $('aboutBody').value = content.body;
    $('aboutButtonText').value = content.cta_text;
    $('aboutButtonLink').value = content.cta_link;
    $('aboutImageAlt').value = content.image_alt;
    currentAboutImage = content.image_url;
    $('aboutImage').value = '';
    updateAboutPreview();
    aboutLoaded = true;
    aboutSchemaReady = true;
    $('aboutFields').disabled = false;
    $('aboutSave').disabled = false;
    showMessage($('aboutNotice'), data
      ? 'Your published About Section is ready to edit.'
      : 'The website currently uses its default About Section. Save to publish your changes.');
  } catch (error) {
    if (version !== aboutLoadVersion) return;
    const detail = error && typeof error.message === 'string' ? error.message : String(error);
    showMessage($('aboutNotice'), 'Could not load the About Section: ' + detail
      + '. Run supabase/about.sql in your Supabase SQL Editor, then try again.', 'error');
    $('aboutRetry').classList.remove('hidden');
  } finally {
    if (version === aboutLoadVersion) $('aboutForm').setAttribute('aria-busy', 'false');
  }
}

function validAboutImage(file) {
  return !file || (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    && file.size > 0 && file.size <= 5 * 1024 * 1024);
}

function updateHeroPreview() {
  heroPreviewObjectUrls.forEach(url => URL.revokeObjectURL(url));
  heroPreviewObjectUrls = [];
  const slides = [
    ...currentHeroImages.map((src, index) => ({src, label: `Slide ${index + 1}`})),
    ...heroNewImages.map((file, index) => {
      const src = URL.createObjectURL(file);
      heroPreviewObjectUrls.push(src);
      return {src, label: `New image ${index + 1}`};
    }),
  ];
  const gallery = $('heroSlides');
  gallery.replaceChildren();
  slides.forEach((slide, index) => {
    const item = document.createElement('div');
    item.className = 'hero-slide';
    const preview = document.createElement('img');
    preview.src = slide.src;
    preview.alt = `${slide.label} preview`;
    preview.addEventListener('error', () => {
      preview.hidden = true;
      showMessage($('heroNotice'), `${slide.label} could not be loaded. Remove it or replace it before saving.`, 'error');
    });
    const remove = document.createElement('button');
    remove.className = 'btn';
    remove.type = 'button';
    remove.dataset.heroRemove = String(index);
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${slide.label.toLowerCase()}`);
    item.append(preview, remove);
    gallery.append(item);
  });
  $('heroPreviewStatus').textContent = slides.length
    ? `${slides.length} slideshow image${slides.length === 1 ? '' : 's'}; save to publish changes.`
    : 'Add at least one image to the slideshow.';
}

async function loadHeroContent() {
  const version = ++heroLoadVersion;
  heroLoaded = false;
  $('heroFields').disabled = true;
  $('heroRetry').classList.add('hidden');
  $('heroForm').setAttribute('aria-busy', 'true');
  showMessage($('heroNotice'), 'Loading your Hero Section…');
  try {
    let {data, error} = await db.from('hero_content').select('title, subtitle, cta_text, cta_link, image_url, image_urls')
      .eq('id', window.Loom7Hero.id).maybeSingle();
    if (version !== heroLoadVersion) return;
    if (error && error.code === '42703' && error.message.includes('image_urls')) {
      const legacy = await db.from('hero_content').select('title, subtitle, cta_text, cta_link, image_url')
        .eq('id', window.Loom7Hero.id).maybeSingle();
      data = legacy.data;
      error = legacy.error;
      if (!error) {
        const content = window.Loom7Hero.normalize(data || {});
        $('heroTitle').value = content.title;
        $('heroSubtitle').value = content.subtitle;
        $('heroButtonText').value = content.cta_text;
        $('heroButtonLink').value = content.cta_link;
        currentHeroImages = content.image_urls;
        heroNewImages = [];
        $('heroUpload').value = '';
        updateHeroPreview();
        heroLoaded = true;
        heroSchemaReady = false;
        $('heroFields').disabled = false;
        $('heroSave').disabled = true;
        showMessage($('heroNotice'), 'Your current hero content is shown, but slideshow editing is unavailable until you run the updated supabase/hero.sql in your Supabase SQL Editor.', 'error');
        return;
      }
    }
    if (error) throw error;
    const content = window.Loom7Hero.normalize(data || {});
    $('heroTitle').value = content.title;
    $('heroSubtitle').value = content.subtitle;
    $('heroButtonText').value = content.cta_text;
    $('heroButtonLink').value = content.cta_link;
    currentHeroImages = content.image_urls;
    heroNewImages = [];
    $('heroUpload').value = '';
    updateHeroPreview();
    heroLoaded = true;
    heroSchemaReady = true;
    $('heroFields').disabled = false;
    $('heroSave').disabled = false;
    showMessage($('heroNotice'), data
      ? 'Your published Hero Section is ready to edit.'
      : 'The website currently uses its default Hero Section. Save to publish your changes.');
  } catch (error) {
    if (version !== heroLoadVersion) return;
    const detail = error && typeof error.message === 'string' ? error.message : String(error);
    showMessage($('heroNotice'), 'Could not load the Hero Section: ' + detail
      + '. Run the updated supabase/hero.sql in your Supabase SQL Editor to enable slideshow images, then try again.', 'error');
    $('heroRetry').classList.remove('hidden');
  } finally {
    if (version === heroLoadVersion) $('heroForm').setAttribute('aria-busy', 'false');
  }
}

function validateHeroImage() {
  const valid = heroNewImages.every(file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    && file.size > 0 && file.size <= 5 * 1024 * 1024);
  $('heroUpload').setCustomValidity(valid ? '' : 'Choose JPEG, PNG, or WebP images up to 5 MB each.');
  return valid;
}

$('heroForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!db || !heroLoaded) return;
  if (!heroSchemaReady) {
    showMessage($('heroNotice'), 'Run the updated supabase/hero.sql in your Supabase SQL Editor before saving hero slideshow changes.', 'error');
    return;
  }
  const title = $('heroTitle').value.trim();
  const buttonText = $('heroButtonText').value.trim();
  const buttonLink = window.Loom7Hero.safeUrl($('heroButtonLink').value.trim());
  $('heroTitle').setCustomValidity(title ? '' : 'Enter a title.');
  $('heroButtonText').setCustomValidity(buttonText ? '' : 'Enter button text.');
  $('heroButtonLink').setCustomValidity(buttonLink ? '' : 'Enter a complete HTTP or HTTPS URL without credentials.');
  validateHeroImage();
  if (!$('heroForm').reportValidity()) return;
  if (!currentHeroImages.length && !heroNewImages.length) {
    showMessage($('heroNotice'), 'Add at least one image to the hero slideshow before saving.', 'error');
    return;
  }
  const values = {id: window.Loom7Hero.id, title, subtitle: $('heroSubtitle').value.trim(),
    cta_text: buttonText, cta_link: buttonLink, image_url: currentHeroImages[0] || '',
    image_urls: [...currentHeroImages]};
  const version = heroLoadVersion;
  const uploadedPaths = [];
  setBusy($('heroSave'), true, 'Saving…');
  $('heroFields').disabled = true;
  $('heroForm').setAttribute('aria-busy', 'true');
  try {
    for (const [index, file] of heroNewImages.entries()) {
      $('heroSave').textContent = `Uploading image ${index + 1} of ${heroNewImages.length}…`;
      const extension = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}[file.type];
      const path = 'hero/' + crypto.randomUUID() + '.' + extension;
      const {error} = await db.storage.from('hero_images').upload(path, file, {contentType: file.type, upsert: false});
      if (error) throw error;
      uploadedPaths.push(path);
      const {data} = db.storage.from('hero_images').getPublicUrl(path);
      values.image_urls.push(data.publicUrl);
    }
    values.image_url = values.image_urls[0];
    if (version !== heroLoadVersion) throw new Error('Your session changed. Sign in again before saving.');
    $('heroSave').textContent = 'Publishing…';
    const {error} = await db.from('hero_content').upsert(values, {onConflict: 'id'});
    if (error) throw error;
    uploadedPaths.length = 0;
    if (version !== heroLoadVersion) return;
    currentHeroImages = values.image_urls;
    heroNewImages = [];
    $('heroUpload').value = '';
    updateHeroPreview();
    showMessage($('heroNotice'), 'Hero Section saved. Reload the website to see your published slideshow.', 'success');
  } catch (error) {
    if (uploadedPaths.length) {
      try {
        const {error: cleanupError} = await db.storage.from('hero_images').remove(uploadedPaths);
        if (cleanupError) console.warn('Could not remove unpublished Hero image uploads.', cleanupError);
      } catch (cleanupError) {
        console.warn('Could not remove unpublished Hero image uploads.', cleanupError);
      }
    }
    if (version === heroLoadVersion) {
      const detail = error && typeof error.message === 'string' ? error.message : String(error);
      showMessage($('heroNotice'), 'Could not save the Hero Section: ' + detail + '. Your changes remain in the form.', 'error');
    }
  } finally {
    setBusy($('heroSave'), false);
    if (version === heroLoadVersion) {
      $('heroFields').disabled = !heroLoaded;
      $('heroForm').setAttribute('aria-busy', 'false');
    }
  }
});

$('heroRetry').addEventListener('click', loadHeroContent);
$('aboutForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!db || !aboutLoaded) return;
  if (!aboutSchemaReady) {
    showMessage($('aboutNotice'), 'Run supabase/about.sql in your Supabase SQL Editor before saving About Section changes.', 'error');
    return;
  }
  const label = $('aboutLabel').value.trim();
  const title = $('aboutTitle').value.trim();
  const buttonText = $('aboutButtonText').value.trim();
  const buttonLink = window.Loom7About.safeUrl($('aboutButtonLink').value.trim());
  $('aboutLabel').setCustomValidity(label ? '' : 'Enter a section label.');
  $('aboutTitle').setCustomValidity(title ? '' : 'Enter a headline.');
  $('aboutButtonText').setCustomValidity(buttonText ? '' : 'Enter button text.');
  $('aboutButtonLink').setCustomValidity(buttonLink ? '' : 'Enter a complete HTTP or HTTPS URL without credentials.');
  const selectedFile = $('aboutImage').files[0] || null;
  $('aboutImage').setCustomValidity(validAboutImage(selectedFile) ? '' : 'Choose a JPEG, PNG, or WebP image up to 5 MB.');
  if (!$('aboutForm').reportValidity()) return;

  const values = {
    id: window.Loom7About.id,
    label,
    title,
    body: $('aboutBody').value.trim(),
    cta_text: buttonText,
    cta_link: buttonLink,
    image_url: currentAboutImage,
    image_alt: $('aboutImageAlt').value.trim(),
  };
  const version = aboutLoadVersion;
  let uploadedPath = '';
  let imageUploaded = false;
  setBusy($('aboutSave'), true, 'Saving…');
  $('aboutFields').disabled = true;
  $('aboutForm').setAttribute('aria-busy', 'true');
  try {
    if (selectedFile) {
      $('aboutSave').textContent = 'Uploading image…';
      const extension = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}[selectedFile.type];
      uploadedPath = 'about/' + crypto.randomUUID() + '.' + extension;
      const {error} = await db.storage.from('about_images').upload(uploadedPath, selectedFile, {
        contentType: selectedFile.type, upsert: false,
      });
      if (error) throw error;
      imageUploaded = true;
      const {data} = db.storage.from('about_images').getPublicUrl(uploadedPath);
      values.image_url = data.publicUrl;
    }
    if (version !== aboutLoadVersion) throw new Error('Your session changed. Sign in again before saving.');
    $('aboutSave').textContent = 'Publishing…';
    const {error} = await db.from('about_content').upsert(values, {onConflict: 'id'});
    if (error) throw error;
    uploadedPath = '';
    imageUploaded = false;
    if (version !== aboutLoadVersion) return;
    currentAboutImage = values.image_url;
    $('aboutImage').value = '';
    updateAboutPreview();
    showMessage($('aboutNotice'), 'About Section saved. Reload the website to see your published changes.', 'success');
  } catch (error) {
    if (uploadedPath && imageUploaded) {
      try {
        const {error: cleanupError} = await db.storage.from('about_images').remove([uploadedPath]);
        if (cleanupError) console.warn('Could not remove unpublished About image upload.', cleanupError);
      } catch (cleanupError) {
        console.warn('Could not remove unpublished About image upload.', cleanupError);
      }
    }
    if (version === aboutLoadVersion) {
      const detail = error && typeof error.message === 'string' ? error.message : String(error);
      showMessage($('aboutNotice'), 'Could not save the About Section: ' + detail + '. Your changes remain in the form.', 'error');
    }
  } finally {
    setBusy($('aboutSave'), false);
    if (version === aboutLoadVersion) {
      $('aboutFields').disabled = !aboutLoaded;
      $('aboutForm').setAttribute('aria-busy', 'false');
    }
  }
});

$('aboutRetry').addEventListener('click', loadAboutContent);
$('aboutImage').addEventListener('change', () => {
  const file = $('aboutImage').files[0] || null;
  $('aboutImage').setCustomValidity(validAboutImage(file) ? '' : 'Choose a JPEG, PNG, or WebP image up to 5 MB.');
  if (!validAboutImage(file)) {
    $('aboutImage').reportValidity();
    return;
  }
  updateAboutPreview(file);
});
$('heroUpload').addEventListener('change', () => {
  const selected = Array.from($('heroUpload').files);
  if (selected.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    || file.size === 0 || file.size > 5 * 1024 * 1024)) {
    $('heroUpload').setCustomValidity('Choose JPEG, PNG, or WebP images up to 5 MB each.');
    $('heroUpload').reportValidity();
    $('heroUpload').value = '';
    return;
  }
  $('heroUpload').setCustomValidity('');
  heroNewImages.push(...selected);
  $('heroUpload').value = '';
  updateHeroPreview();
});
 $('heroSlides').addEventListener('click', event => {
  const button = event.target.closest('[data-hero-remove]');
  if (!button) return;
  const index = Number(button.dataset.heroRemove);
  if (index < currentHeroImages.length) currentHeroImages.splice(index, 1);
  else heroNewImages.splice(index - currentHeroImages.length, 1);
  updateHeroPreview();
});
['heroTitle', 'heroButtonText', 'heroButtonLink'].forEach(id => {
  $(id).addEventListener('input', () => $(id).setCustomValidity(''));
});
function loading(box, label) {
  box.setAttribute('aria-busy', 'true');
  box.innerHTML = '<span class="loading-label">' + label + '</span><div aria-hidden="true"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>';
}

function loadError(box, text, retry) {
  box.setAttribute('aria-busy', 'false');
  box.innerHTML = '<div class="empty"><strong>Something went wrong.</strong><p>' + text + '</p><button class="btn" type="button">Try again</button></div>';
  box.querySelector('button').addEventListener('click', retry);
}

async function loadWebsiteProducts() {
  const websiteUrl = new URL('index.html', document.baseURI);
  const response = await fetch(websiteUrl, {cache: 'no-store'});
  if (!response.ok) throw new Error('Could not load the website collection.');
  const website = new DOMParser().parseFromString(await response.text(), 'text/html');
  return Array.from(website.querySelectorAll('#collection .product[data-product-key]')).map(card => {
    const name = card.querySelector('.product-copy h3')?.textContent.trim();
    const image = card.querySelector('.product-image img')?.getAttribute('src');
    return {
      id: 'website-' + card.dataset.productKey,
      website_key: card.dataset.productKey,
      name,
      description: card.querySelector('.product-copy p:not(.product-price)')?.textContent.trim() || '',
      price: null,
      image_url: image || '',
      is_visible: true,
      available_sizes: [...productSizes],
      is_website_product: true,
    };
  }).filter(product => product.name);
}

function mergeProducts(savedProducts, websiteProducts) {
  const roots = websiteProducts
    .filter(websiteProduct => !savedProducts.some(product => !product.website_key
      && product.name.trim().toLowerCase() === websiteProduct.name.toLowerCase()
      && safeImage(product.image_url) === safeImage(websiteProduct.image_url)))
    .map(websiteProduct => {
      const saved = savedProducts.find(product => product.website_key === websiteProduct.website_key);
      return saved ? {...saved, is_website_product: true} : {
        ...websiteProduct,
        sort_order: ['roots-01', 'roots-02', 'roots-03', 'roots-04'].indexOf(websiteProduct.website_key) + 1,
      };
    });
  const uploaded = savedProducts.filter(product => !product.website_key).sort((a, b) =>
    Number(a.sort_order || 0) - Number(b.sort_order || 0)
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    || String(a.id).localeCompare(String(b.id)));
  const hasAllBuiltinRows = ['roots-01', 'roots-02', 'roots-03', 'roots-04']
    .every(key => savedProducts.some(product => product.website_key === key));
  return hasAllBuiltinRows
    ? roots.concat(uploaded).sort((a, b) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0)
      || String(a.created_at || '').localeCompare(String(b.created_at || ''))
      || String(a.id).localeCompare(String(b.id)))
    : roots.concat(uploaded);
}

async function loadProducts() {
  const version = ++productLoadVersion;
  const box = $('productsList');
  $('collectionNotice').classList.add('hidden');
  $('collectionRetry').classList.add('hidden');
  loading(box, 'Loading your collection…');
  try {
    const [saved, website] = await Promise.allSettled([
      (async () => {
        const {data, error} = await db.from('products').select('*').order('created_at', {ascending: false});
        if (error) throw error;
        return data || [];
      })(),
      loadWebsiteProducts(),
    ]);
    if (version !== productLoadVersion) return;
    if (saved.status === 'rejected' && website.status === 'rejected') throw new Error('Collection unavailable.');
    products = mergeProducts(saved.status === 'fulfilled' ? saved.value : [], website.status === 'fulfilled' ? website.value : []);
    $('totalProducts').textContent = products.length;
    $('visibleProducts').textContent = products.filter(product => product.is_visible).length;
    renderProducts();
    if (saved.status === 'rejected' || website.status === 'rejected') {
      showMessage($('collectionNotice'), saved.status === 'rejected'
        ? 'Showing the website collection. Saved admin products could not be loaded.'
        : 'Showing saved admin products. The website collection could not be loaded.', 'error');
      $('collectionRetry').classList.remove('hidden');
    }
  } catch {
    if (version !== productLoadVersion) return;
    loadError(box, 'Your collection could not be loaded. Please try again.', loadProducts);
  }
}

$('collectionRetry').addEventListener('click', loadProducts);

function safeImage(value) {
  if (!value) return '';
  try {
    const url = new URL(value, document.baseURI);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function renderProducts() {
  const box = $('productsList');
  const search = $('productSearch').value.trim().toLowerCase();
  const visibility = $('visibilityFilter').value;
  const filtered = products.filter(product => (product.name + ' ' + (product.description || '') + ' ' + (product.price ?? '')).toLowerCase().includes(search) && (visibility === 'all' || Boolean(product.is_visible) === (visibility === 'visible')));
  box.setAttribute('aria-busy', 'false');
  $('productCount').textContent = filtered.length + (filtered.length !== products.length ? ' / ' + products.length : '');
  if (!filtered.length) {
    box.innerHTML = '<div class="empty"><strong>' + (products.length ? 'No matching pieces.' : 'Your collection starts here.') + '</strong><p>' + (products.length ? 'Try another search or change the visibility filter.' : 'Add your first product using the collection details form.') + '</p></div>';
    return;
  }
  const orderedProducts = [...products].sort((a, b) =>
    Number(a.sort_order || 0) - Number(b.sort_order || 0)
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    || String(a.id).localeCompare(String(b.id)));
  box.innerHTML = '<table><caption class="sr-only">Products in your collection</caption><thead><tr><th scope="col">Image</th><th scope="col">Product</th><th scope="col">Price</th><th scope="col">Position</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>' + filtered.map(product => {
    const image = safeImage(product.image_url);
    const name = escapeHtml(product.name);
    const id = escapeHtml(product.id);
    const price = product.price === null || product.price === undefined || product.price === ''
      ? null : Number(product.price);
    const priceText = Number.isFinite(price) && price >= 0 ? escapeHtml(priceFormatter.format(price)) : '—';
    const position = orderedProducts.findIndex(item => item.id === product.id) + 1;
    const actions = '<button type="button" class="btn" data-edit="' + id + '" aria-label="Edit ' + name + '">Edit</button>'
      + '<button type="button" class="btn" data-move="' + id + '" data-position="' + (position - 1) + '" aria-label="Move ' + name + ' up"' + (position <= 1 ? ' disabled' : '') + '>↑</button>'
      + '<button type="button" class="btn" data-move="' + id + '" data-position="' + (position + 1) + '" aria-label="Move ' + name + ' down"' + (position >= orderedProducts.length ? ' disabled' : '') + '>↓</button>'
      + '<button type="button" class="btn danger" data-delete="' + id + '" aria-label="Delete ' + name + '">Delete</button>';
    return '<tr><td>' + (image ? '<img class="thumb" src="' + escapeHtml(image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="thumb thumb-placeholder" aria-label="No image">—</span>') + '</td><td class="product-cell"><strong>' + name + '</strong><span class="muted product-description">' + escapeHtml(product.description || 'No description added') + '</span>' + (product.is_website_product ? '<span class="muted">Website product</span>' : '') + '</td><td>' + priceText + '</td><td>' + (position || '—') + '</td><td><span class="status' + (product.is_visible ? '' : ' unpublished') + '">' + (product.is_visible ? 'Visible' : 'Hidden') + '</span></td><td><div class="row-actions">' + actions + '</div></td></tr>';
  }).join('') + '</tbody></table>';
  box.querySelectorAll('img').forEach(image => image.addEventListener('error', () => {
    const placeholder = document.createElement('span');
    placeholder.className = 'thumb thumb-placeholder';
    placeholder.textContent = '—';
    placeholder.setAttribute('aria-label', 'Image unavailable');
    image.replaceWith(placeholder);
  }));
  box.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => openEditDialog(products.find(product => String(product.id) === button.dataset.edit))));
  box.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => {
    pendingDelete = products.find(product => String(product.id) === button.dataset.delete);
    $('deleteName').textContent = pendingDelete.name;
    $('deleteDescription').textContent = pendingDelete.website_key
      ? 'This built-in website product will be hidden from visitors. You can restore it later by editing it and setting it to Visible.'
      : 'This product will be permanently deleted from the collection. This cannot be undone.';
    $('deleteDialog').querySelector('[value="delete"]').textContent = pendingDelete.website_key
      ? 'Remove from website' : 'Delete product';
    $('deleteDialog').returnValue = '';
    $('deleteDialog').showModal();
  }));
  box.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => {
    const product = products.find(item => String(item.id) === button.dataset.move);
    if (product) reorderProduct(product, Number(button.dataset.position));
  }));
}

let reorderingProduct = false;
async function reorderProduct(product, position) {
  if (!db || reorderingProduct) return;
  reorderingProduct = true;
  $('productsList').querySelectorAll('[data-move]').forEach(button => { button.disabled = true; });
  try {
    const {error} = await db.rpc('reorder_product', {
      p_product_id: product.id,
      p_new_position: position,
    });
    if (error) throw error;
    await loadProducts();
    showMessage(notice, '“' + product.name + '” moved to position ' + position + ' in the collection.', 'success');
  } catch (error) {
    const detail = error && typeof error.message === 'string' ? error.message : String(error);
    showMessage(notice, 'Could not change the product position: ' + detail
      + '. Run the updated supabase/products.sql script, then try again.', 'error');
  } finally {
    reorderingProduct = false;
    if ($('productsList').querySelector('table')) renderProducts();
  }
}

async function loadSubscribers() {
  const box = $('subscribersList');
  loading(box, 'Loading your community…');
  try {
    const {data, error} = await db.from('newsletter_subscribers').select('id,email,full_name,consented_at').order('consented_at', {ascending: false});
    if (error) throw error;
    subscribers = data || [];
    $('totalSubscribers').textContent = subscribers.length;
    renderSubscribers();
  } catch {
    loadError(box, 'Your subscribers could not be loaded. Please try again.', loadSubscribers);
  }
}

function renderSubscribers() {
  const box = $('subscribersList');
  const search = $('subscriberSearch').value.trim().toLowerCase();
  const filtered = subscribers.filter(subscriber => ((subscriber.full_name || '') + ' ' + subscriber.email).toLowerCase().includes(search));
  box.setAttribute('aria-busy', 'false');
  $('subscriberCount').textContent = filtered.length + (filtered.length !== subscribers.length ? ' / ' + subscribers.length : '');
  if (!filtered.length) {
    box.innerHTML = '<div class="empty"><strong>' + (subscribers.length ? 'No matching subscribers.' : 'A community in the making.') + '</strong><p>' + (subscribers.length ? 'Try a different name or email address.' : 'Newsletter signups from your website will appear here.') + '</p></div>';
    return;
  }
  box.innerHTML = '<table><caption class="sr-only">Newsletter subscribers</caption><thead><tr><th scope="col">Name</th><th scope="col">Email address</th><th scope="col">Subscribed</th></tr></thead><tbody>' + filtered.map(subscriber => '<tr><td>' + escapeHtml(subscriber.full_name || '—') + '</td><td>' + escapeHtml(subscriber.email) + '</td><td>' + escapeHtml(subscriber.consented_at ? new Date(subscriber.consented_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}) : '—') + '</td></tr>').join('') + '</tbody></table>';
}

function updatePreview() {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = '';
  const file = $('productImage').files[0];
  if (file) previewObjectUrl = URL.createObjectURL(file);
  const url = previewObjectUrl || safeImage(currentImageUrl);
  const image = $('previewImage');
  $('imagePreview').classList.toggle('hidden', !url);
  image.hidden = true;
  image.removeAttribute('src');
  $('previewStatus').textContent = url ? 'Loading image preview…' : '';
  if (url) {
    image.onload = () => { image.hidden = false; $('previewStatus').textContent = 'Product image preview'; };
    image.onerror = () => { image.hidden = true; $('previewStatus').textContent = 'Image could not be loaded. Choose another image.'; };
    image.referrerPolicy = 'no-referrer';
    image.src = url;
  }
}

function updateNewGalleryPreview() {
  productGalleryPreviewUrls.forEach(url => URL.revokeObjectURL(url));
  productGalleryPreviewUrls = [...$('productGalleryImages').files].map(file => URL.createObjectURL(file));
  renderMediaPreviews($('productGalleryPreview'), productGalleryPreviewUrls.map((url, index) => ({
    url, name: $('productGalleryImages').files[index].name,
  })));
}

function updateNewVideoPreview() {
  if (productVideoPreviewUrl) URL.revokeObjectURL(productVideoPreviewUrl);
  const file = $('productVideo').files[0];
  productVideoPreviewUrl = file ? URL.createObjectURL(file) : '';
  renderMediaPreviews($('productVideoPreview'), productVideoPreviewUrl ? [{url: productVideoPreviewUrl, type: 'video'}] : []);
}

function updateDescriptionCount() {
  $('descriptionCount').textContent = $('productDescription').value.length.toLocaleString() + ' / 1,000 characters';
}

function focusEditor() {
  $('productEditor').scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
  $('productName').focus({preventScroll: true});
}

function resetProductForm() {
  $('productForm').reset();
  $('productVisible').checked = true;
  $('productImage').setCustomValidity('');
  $('productGalleryImages').setCustomValidity('');
  $('productVideo').setCustomValidity('');
  productGalleryPreviewUrls.forEach(url => URL.revokeObjectURL(url));
  productGalleryPreviewUrls = [];
  if (productVideoPreviewUrl) URL.revokeObjectURL(productVideoPreviewUrl);
  productVideoPreviewUrl = '';
  $('productGalleryPreview').replaceChildren();
  $('productVideoPreview').replaceChildren();
  currentImageUrl = '';
  updateDescriptionCount();
  updatePreview();
}

const productImageTypes = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'};
const productVideoTypes = {'video/mp4': 'mp4', 'video/webm': 'webm'};
const productImageLimit = 3 * 1024 * 1024;
const productVideoLimit = 25 * 1024 * 1024;

function validProductImage(file) {
  return !file || (file.type in productImageTypes && file.size > 0 && file.size <= productImageLimit);
}

function validProductVideo(file) {
  return !file || (file.type in productVideoTypes && file.size > 0 && file.size <= productVideoLimit);
}

async function uploadProductAsset(file, types) {
  const path = 'products/' + crypto.randomUUID() + '.' + types[file.type];
  const {error} = await db.storage.from('product_images').upload(path, file, {contentType: file.type, upsert: false});
  if (error) throw new Error('Product media upload failed. Check that the updated supabase/products.sql has been run.');
  return {path, url: db.storage.from('product_images').getPublicUrl(path).data.publicUrl};
}

const uploadProductImage = file => uploadProductAsset(file, productImageTypes);
const uploadProductVideo = file => uploadProductAsset(file, productVideoTypes);

function productImagePath(url) {
  if (!url) return '';
  const prefix = db.storage.from('product_images').getPublicUrl('_').data.publicUrl.slice(0, -1);
  if (!url.startsWith(prefix)) return '';
  try { return decodeURIComponent(url.slice(prefix.length).split('?')[0]); } catch { return ''; }
}

async function removeProductAssets(urls) {
  const paths = [...new Set(urls.map(productImagePath).filter(Boolean))];
  if (!paths.length) return;
  const {error} = await db.storage.from('product_images').remove(paths);
  if (error) throw error;
}

async function cleanupUploadedAssets(assets) {
  try {
    await removeProductAssets(assets.map(asset => asset.url));
    return '';
  } catch (error) {
    console.error('Unable to clean up uploaded product media.', error);
    return error && typeof error.message === 'string' ? error.message : String(error);
  }
}

function renderMediaPreviews(container, records, {removable = false, onRemove} = {}) {
  container.replaceChildren();
  records.forEach(record => {
    const item = document.createElement('div');
    item.className = 'media-preview-item';
    if (record.removed) item.classList.add('is-removed');
    const media = document.createElement(record.type === 'video' ? 'video' : 'img');
    media.src = record.url;
    if (record.type === 'video') media.controls = true;
    else media.alt = record.name || 'Product photo preview';
    item.append(media);
    if (removable) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'media-preview-remove';
      button.textContent = record.removed ? 'Keep' : 'Remove';
      button.setAttribute('aria-pressed', String(Boolean(record.removed)));
      button.addEventListener('click', () => onRemove(record, item));
      item.append(button);
    }
    container.append(item);
  });
}

function updateEditPreview() {
  if (editPreviewObjectUrl) URL.revokeObjectURL(editPreviewObjectUrl);
  editPreviewObjectUrl = '';
  const file = $('editImage').files[0];
  if (file) editPreviewObjectUrl = URL.createObjectURL(file);
  const current = safeImage(editingProduct?.image_url);
  const url = editPreviewObjectUrl || current;
  const image = $('editPreviewImage');
  $('editKeepImage').classList.toggle('hidden', !file);
  image.hidden = true;
  image.removeAttribute('src');
  if (!url) { $('editPreviewStatus').textContent = 'No image yet — choose one to add it.'; return; }
  $('editPreviewStatus').textContent = 'Loading image preview…';
  image.onload = () => { image.hidden = false; $('editPreviewStatus').textContent = file ? 'New image — replaces the current one when saved' : 'Current image — kept unless you choose a new one'; };
  image.onerror = () => { $('editPreviewStatus').textContent = file ? 'This image could not be previewed. Choose another image.' : 'The current image could not be loaded. Choose a new image to replace it.'; };
  image.referrerPolicy = 'no-referrer';
  image.src = url;
}

function updateEditGalleryPreview() {
  editGalleryPreviewUrls.forEach(url => URL.revokeObjectURL(url));
  const newFiles = [...$('editGalleryImages').files];
  editGalleryPreviewUrls = newFiles.map(file => URL.createObjectURL(file));
  const existing = editGalleryUrls.map(url => ({
    url,
    type: 'image',
    removed: editRemovedGalleryUrls.has(url),
  }));
  const added = editGalleryPreviewUrls.map((url, index) => ({
    url,
    type: 'image',
    name: newFiles[index].name,
    isNew: true,
    fileIndex: index,
  }));
  renderMediaPreviews($('editGalleryPreview'), [...existing, ...added], {
    removable: true,
    onRemove: record => {
      if (record.isNew) {
        const remainingFiles = [...$('editGalleryImages').files].filter((file, index) => index !== record.fileIndex);
        const transfer = new DataTransfer();
        remainingFiles.forEach(file => transfer.items.add(file));
        $('editGalleryImages').files = transfer.files;
        updateEditGalleryPreview();
        return;
      }
      if (editRemovedGalleryUrls.has(record.url)) editRemovedGalleryUrls.delete(record.url);
      else editRemovedGalleryUrls.add(record.url);
      updateEditGalleryPreview();
    },
  });
}

function updateEditVideoPreview() {
  if (editVideoPreviewUrl) URL.revokeObjectURL(editVideoPreviewUrl);
  const file = $('editProductVideo').files[0];
  editVideoPreviewUrl = file ? URL.createObjectURL(file) : '';
  const url = editVideoPreviewUrl || editVideoUrl;
  $('removeProductVideoLabel').classList.toggle('hidden', !editVideoUrl || Boolean(file));
  renderMediaPreviews($('editVideoPreview'), url ? [{url, type: 'video'}] : []);
}

function updateEditDescriptionCount() {
  $('editDescriptionCount').textContent = $('editDescription').value.length.toLocaleString() + ' / 1,000 characters';
}

function openEditDialog(product) {
  if (!product) return;
  editingProduct = product;
  $('editForm').reset();
  $('editName').setCustomValidity('');
  $('editImage').setCustomValidity('');
  $('editName').value = product.name;
  $('editDescription').value = product.description || '';
  $('editPrice').value = product.price ?? '';
  setProductSizes('edit-product-sizes', product.available_sizes);
  editGalleryUrls = Array.isArray(product.gallery_images) ? product.gallery_images.filter(safeImage) : [];
  editRemovedGalleryUrls = new Set();
  editVideoUrl = safeImage(product.video_url);
  $('editGalleryImages').value = '';
  $('editProductVideo').value = '';
  $('removeProductVideo').checked = false;
  $('editVisibility').value = product.is_visible ? 'visible' : 'hidden';
  $('editHeading').textContent = 'Edit “' + product.name + '”';
  $('editNotice').classList.add('hidden');
  updateEditDescriptionCount();
  updateEditPreview();
  updateEditGalleryPreview();
  updateEditVideoPreview();
  $('editDialog').showModal();
  $('editName').focus();
}

function closeEditDialog(force = false) {
  if (editSaving && !force) return;
  if ($('editDialog').open) $('editDialog').close();
  editingProduct = null;
  $('editImage').value = '';
  $('editGalleryImages').value = '';
  $('editProductVideo').value = '';
  editGalleryPreviewUrls.forEach(url => URL.revokeObjectURL(url));
  editGalleryPreviewUrls = [];
  if (editVideoPreviewUrl) URL.revokeObjectURL(editVideoPreviewUrl);
  editVideoPreviewUrl = '';
  editGalleryUrls = [];
  editRemovedGalleryUrls = new Set();
  editVideoUrl = '';
  if (editPreviewObjectUrl) URL.revokeObjectURL(editPreviewObjectUrl);
  editPreviewObjectUrl = '';
}

$('editForm').addEventListener('submit', async event => {
  event.preventDefault();
  const product = editingProduct;
  if (!db || !product || editSaving) return;
  const name = $('editName').value.trim();
  const file = $('editImage').files[0];
  const galleryFiles = [...$('editGalleryImages').files];
  const videoFile = $('editProductVideo').files[0];
  $('editName').setCustomValidity(name ? '' : 'Enter a product title.');
  $('editImage').setCustomValidity(validProductImage(file) ? '' : 'Choose a JPEG, PNG, or WebP image smaller than 3 MB.');
  $('editGalleryImages').setCustomValidity(galleryFiles.every(validProductImage) ? '' : 'Choose JPEG, PNG, or WebP photos up to 3 MB each.');
  $('editProductVideo').setCustomValidity(validProductVideo(videoFile) ? '' : 'Choose an MP4 or WebM video up to 25 MB.');
  if (!$('editForm').reportValidity()) return;
  const values = {name, description: $('editDescription').value.trim() || null,
    price: $('editPrice').value === '' ? null : Number($('editPrice').value),
    available_sizes: selectedProductSizes('edit-product-sizes'),
    image_url: product.image_url || null,
    gallery_images: editGalleryUrls.filter(url => !editRemovedGalleryUrls.has(url)),
    video_url: $('removeProductVideo').checked ? null : editVideoUrl || null,
    is_visible: $('editVisibility').value === 'visible'};
  const uploadedAssets = [];
  const removedAssets = [
    ...(file && product.image_url ? [product.image_url] : []),
    ...[...editRemovedGalleryUrls],
    ...((videoFile || $('removeProductVideo').checked) && editVideoUrl ? [editVideoUrl] : []),
  ];
  let saveSucceeded = false;
  editSaving = true;
  setBusy($('editSave'), true, 'Saving…');
  $('editFields').disabled = true;
  $('editNotice').classList.add('hidden');
  try {
    const totalUploads = (file ? 1 : 0) + galleryFiles.length + (videoFile ? 1 : 0);
    let uploadNumber = 0;
    if (file) {
      $('editSave').textContent = `Uploading media ${++uploadNumber} of ${totalUploads}…`;
      const asset = await uploadProductImage(file);
      uploadedAssets.push(asset);
      values.image_url = asset.url;
    }
    for (const galleryFile of galleryFiles) {
      $('editSave').textContent = `Uploading media ${++uploadNumber} of ${totalUploads}…`;
      const asset = await uploadProductImage(galleryFile);
      uploadedAssets.push(asset);
      values.gallery_images.push(asset.url);
    }
    if (videoFile) {
      $('editSave').textContent = `Uploading media ${++uploadNumber} of ${totalUploads}…`;
      const asset = await uploadProductVideo(videoFile);
      uploadedAssets.push(asset);
      values.video_url = asset.url;
    }
    $('editSave').textContent = 'Saving…';
    const result = product.is_website_product
      ? await db.from('products').upsert({...values, website_key: product.website_key}, {onConflict: 'website_key'}).select('id')
      : await db.from('products').update(values).eq('id', product.id).select('id');
    if (result.error) throw result.error;
    if (!result.data?.length) throw new Error('This product no longer exists or you no longer have access to it.');
    saveSucceeded = true;
    editSaving = false;
    closeEditDialog();
    showMessage(notice, '“' + name + '” updated' + (values.is_visible ? ' and visible on the website.' : ' and hidden from the website.'), 'success');
    try {
      await removeProductAssets(removedAssets);
    } catch (error) {
      showMessage(notice, '“' + name + '” was saved, but replaced or removed media could not be deleted from storage: ' + (error.message || String(error)), 'error');
    }
    if (!appView.classList.contains('hidden')) await loadProducts();
  } catch (error) {
    const cleanupError = !saveSucceeded ? await cleanupUploadedAssets(uploadedAssets) : '';
    showMessage($('editNotice'), (error.message || 'This product could not be saved.')
      + (cleanupError ? ' Uploaded media cleanup also failed: ' + cleanupError + '.' : '')
      + ' Your changes are still in the form. Please try again.', 'error');
  } finally {
    editSaving = false;
    setBusy($('editSave'), false);
    $('editFields').disabled = false;
  }
});

$('editImage').addEventListener('change', () => {
  $('editImage').setCustomValidity('');
  if (!validProductImage($('editImage').files[0])) {
    $('editImage').setCustomValidity('Choose a JPEG, PNG, or WebP image smaller than 3 MB.');
    $('editImage').reportValidity();
    return;
  }
  updateEditPreview();
});
$('editGalleryImages').addEventListener('change', () => {
  const valid = [...$('editGalleryImages').files].every(validProductImage);
  $('editGalleryImages').setCustomValidity(valid ? '' : 'Choose JPEG, PNG, or WebP photos up to 3 MB each.');
  if (!valid) $('editGalleryImages').reportValidity();
  updateEditGalleryPreview();
});
$('editProductVideo').addEventListener('change', () => {
  const file = $('editProductVideo').files[0];
  $('editProductVideo').setCustomValidity(validProductVideo(file) ? '' : 'Choose an MP4 or WebM video up to 25 MB.');
  if (!validProductVideo(file)) $('editProductVideo').reportValidity();
  updateEditVideoPreview();
});
$('removeProductVideo').addEventListener('change', () => {
  $('editVideoPreview').classList.toggle('is-removed', $('removeProductVideo').checked);
});
$('editKeepImage').addEventListener('click', () => {
  $('editImage').value = '';
  $('editImage').setCustomValidity('');
  updateEditPreview();
  $('editImage').focus();
});
$('editName').addEventListener('input', () => $('editName').setCustomValidity(''));
$('editDescription').addEventListener('input', updateEditDescriptionCount);
$('editCancel').addEventListener('click', () => closeEditDialog());
$('editDialog').addEventListener('cancel', event => {
  event.preventDefault();
  closeEditDialog();
});

function selectTab(tab) {
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.setAttribute('aria-selected', String(button === tab));
    button.tabIndex = button === tab ? 0 : -1;
  });
  ['products', 'subscribers', 'hero', 'about'].forEach(section => {
    $(section + 'Panel').classList.toggle('hidden', tab.dataset.tab !== section);
  });
}

$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!db) return;
  setBusy($('loginButton'), true, 'Signing in…');
  authNotice.classList.add('hidden');
  try {
    const {data, error} = await db.auth.signInWithPassword({email: $('email').value.trim(), password: $('password').value});
    if (error) {
      showMessage(authNotice, 'Sign-in failed. Check your email and password and try again.', 'error');
      return;
    }
    await enterApp(data.user);
  } catch {
    showMessage(authNotice, 'Could not verify admin access. Please try again or check your data setup.', 'error');
  } finally {
    setBusy($('loginButton'), false);
  }
});

$('productForm').addEventListener('submit', async event => {
  event.preventDefault();
  const name = $('productName').value.trim();
  if (!name) { $('productName').setCustomValidity('Enter a product name.'); $('productName').reportValidity(); return; }
  $('productName').setCustomValidity('');
  if (!$('productForm').reportValidity()) return;
  const file = $('productImage').files[0];
  const galleryFiles = [...$('productGalleryImages').files];
  const videoFile = $('productVideo').files[0];
  $('productImage').setCustomValidity(validProductImage(file) ? '' : 'Choose a JPEG, PNG, or WebP cover photo up to 3 MB.');
  $('productGalleryImages').setCustomValidity(galleryFiles.every(validProductImage) ? '' : 'Choose JPEG, PNG, or WebP photos up to 3 MB each.');
  $('productVideo').setCustomValidity(validProductVideo(videoFile) ? '' : 'Choose an MP4 or WebM video up to 25 MB.');
  if (!$('productForm').reportValidity()) return;
  const uploadedPosition = products.length + 1;
  const values = {name, description: $('productDescription').value.trim() || null,
    price: $('productPrice').value === '' ? null : Number($('productPrice').value),
    available_sizes: selectedProductSizes('product-sizes'),
    image_url: currentImageUrl || null,
    gallery_images: [],
    video_url: null,
    is_visible: $('productVisible').checked, sort_order: uploadedPosition};
  const uploadedAssets = [];
  setBusy($('saveButton'), true, 'Saving…');
  $('addProduct').disabled = true;
  $('productImage').disabled = true;
  $('productGalleryImages').disabled = true;
  $('productVideo').disabled = true;
  try {
    const totalUploads = (file ? 1 : 0) + galleryFiles.length + (videoFile ? 1 : 0);
    let uploadNumber = 0;
    if (file) {
      $('saveButton').textContent = `Uploading media ${++uploadNumber} of ${totalUploads}…`;
      const asset = await uploadProductImage(file);
      uploadedAssets.push(asset);
      values.image_url = asset.url;
    }
    for (const galleryFile of galleryFiles) {
      $('saveButton').textContent = `Uploading media ${++uploadNumber} of ${totalUploads}…`;
      const asset = await uploadProductImage(galleryFile);
      uploadedAssets.push(asset);
      values.gallery_images.push(asset.url);
    }
    if (videoFile) {
      $('saveButton').textContent = `Uploading media ${++uploadNumber} of ${totalUploads}…`;
      const asset = await uploadProductVideo(videoFile);
      uploadedAssets.push(asset);
      values.video_url = asset.url;
    }
    $('saveButton').textContent = 'Saving…';
    const result = await db.from('products').insert(values);
    if (result.error) throw result.error;
    uploadedAssets.length = 0;
    showMessage(notice, '“' + name + '” saved' + (values.is_visible ? ' and visible on the website.' : ' as a hidden product.'), 'success');
    resetProductForm();
    await loadProducts();
  } catch (error) {
    const cleanupError = await cleanupUploadedAssets(uploadedAssets);
    showMessage(notice, (error.message || 'This product could not be saved.')
      + (cleanupError ? ' Uploaded media cleanup also failed: ' + cleanupError + '.' : '')
      + ' Your changes are still in the form. Please try again.', 'error');
  } finally {
    setBusy($('saveButton'), false);
    $('addProduct').disabled = false;
    $('productImage').disabled = false;
    $('productGalleryImages').disabled = false;
    $('productVideo').disabled = false;
  }
});

$('deleteDialog').addEventListener('close', async () => {
  const product = pendingDelete;
  pendingDelete = null;
  if ($('deleteDialog').returnValue !== 'delete' || !product) return;
  try {
    if (product.website_key) {
      const {data, error} = await db.from('products').upsert({
        website_key: product.website_key,
        name: product.name,
        description: product.description || null,
        image_url: product.image_url || null,
        is_visible: false,
      }, {onConflict: 'website_key'}).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('The product could not be hidden. Check that you are signed in as an authorized admin.');
    } else {
      const {data, error} = await db.from('products').delete().eq('id', product.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('The product no longer exists or you do not have permission to delete it.');
    }
    await loadProducts();
    if (!product.website_key) {
      try {
        await removeProductAssets([product.image_url, ...(product.gallery_images || []), product.video_url]);
      } catch (error) {
        const detail = error && typeof error.message === 'string' ? error.message : String(error);
        showMessage(notice, '“' + product.name + '” was deleted, but some media could not be deleted from storage: ' + detail, 'error');
        return;
      }
    }
    showMessage(notice, product.website_key
      ? '“' + product.name + '” is hidden from the website. Edit it and set it to Visible to restore it.'
      : '“' + product.name + '” deleted from the collection and website.', 'success');
  } catch (error) {
    const detail = error && typeof error.message === 'string' ? error.message : String(error);
    showMessage(notice, 'Could not delete “' + product.name + '”: ' + detail, 'error');
  }
});

$('togglePassword').addEventListener('click', () => {
  const visible = $('password').type === 'password';
  $('password').type = visible ? 'text' : 'password';
  $('togglePassword').textContent = visible ? 'Hide' : 'Show';
  $('togglePassword').setAttribute('aria-pressed', String(visible));
});
$('productName').addEventListener('input', () => $('productName').setCustomValidity(''));
$('productDescription').addEventListener('input', updateDescriptionCount);
$('productImage').addEventListener('change', () => {
  $('productImage').setCustomValidity('');
  const file = $('productImage').files[0];
  if (!validProductImage(file)) {
    $('productImage').setCustomValidity('Choose a JPEG, PNG, or WebP image smaller than 3 MB.');
    $('productImage').reportValidity();
    return;
  }
  updatePreview();
});
$('productGalleryImages').addEventListener('change', () => {
  const valid = [...$('productGalleryImages').files].every(validProductImage);
  $('productGalleryImages').setCustomValidity(valid ? '' : 'Choose JPEG, PNG, or WebP photos up to 3 MB each.');
  if (!valid) $('productGalleryImages').reportValidity();
  updateNewGalleryPreview();
});
$('productVideo').addEventListener('change', () => {
  const file = $('productVideo').files[0];
  $('productVideo').setCustomValidity(validProductVideo(file) ? '' : 'Choose an MP4 or WebM video up to 25 MB.');
  if (!validProductVideo(file)) $('productVideo').reportValidity();
  updateNewVideoPreview();
});
$('productSearch').addEventListener('input', renderProducts);
$('visibilityFilter').addEventListener('change', renderProducts);
$('subscriberSearch').addEventListener('input', renderSubscribers);
$('addProduct').addEventListener('click', () => { resetProductForm(); focusEditor(); });
const tabs = [...document.querySelectorAll('[data-tab]')];
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectTab(tabs[next]);
    tabs[next].focus();
  });
});
$('signout').addEventListener('click', async () => {
  setBusy($('signout'), true, 'Signing out…');
  try {
    const {error} = await db.auth.signOut();
    if (error) throw error;
    showAuth();
    $('email').focus();
  } catch {
    showMessage(notice, 'Sign-out failed. Please try again.', 'error');
  } finally {
    setBusy($('signout'), false);
  }
});

if (!window.supabase) {
  $('loginButton').disabled = true;
  showMessage(authNotice, 'The sign-in service could not be loaded. Check your connection and reload.', 'error');
} else {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  db.auth.getSession().then(async ({data, error}) => {
    if (error) throw error;
    if (data.session) await enterApp(data.session.user);
  }).catch(() => {
    showAuth();
    showMessage(authNotice, 'Could not restore your session. Please sign in again.', 'error');
  });
}
