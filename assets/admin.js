const $ = (id) => document.getElementById(id);
const authView = $('auth');
const appView = $('app');
const authNotice = $('authNotice');
const notice = $('notice');
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
const adminPages = {
  collection: {title: 'The studio.', description: 'Manage products, pricing, inventory, and what appears on your website.', panel: 'productsPanel'},
  'add-product': {title: 'Add a product.', description: 'Add a new piece to your collection.', panel: 'addProductPanel', navigation: 'collection'},
  product: {title: 'Product details.', description: 'Review and manage this piece in your collection.', panel: 'productDetailPanel', navigation: 'collection'},
  subscribers: {title: 'Your community.', description: 'Stay close to the people following Loom7.', panel: 'subscribersPanel'},
  hero: {title: 'First impressions.', description: 'Shape the opening section visitors see on your website.', panel: 'heroPanel'},
  about: {title: 'Your story.', description: 'Keep the story and details behind Loom7 up to date.', panel: 'aboutPanel'},
};
const requestedAdminPage = new URLSearchParams(window.location.search).get('section');
let currentAdminPage = Object.hasOwn(adminPages, requestedAdminPage) ? requestedAdminPage : 'collection';
const requestedCollectionView = new URLSearchParams(window.location.search).get('view');
let db = null;
let products = [];
let productLoadVersion = 0;
let productsView = requestedCollectionView === 'trash' ? 'trash' : 'collection';
let subscribers = [];
let pendingDelete = null;
let pendingDeleteAction = 'trash';
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

function setProductStock(name, stockBySize) {
  document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
    const quantity = Number(stockBySize?.[input.dataset.size]);
    input.value = Number.isInteger(quantity) && quantity >= 0 && quantity <= 999999 ? String(quantity) : '0';
  });
}

function selectedProductStock(name, availableSizes) {
  return Object.fromEntries(productSizes.map(size => {
    const input = document.querySelector(`input[name="${name}"][data-size="${size}"]`);
    const quantity = Number(input.value);
    return [size, availableSizes.includes(size) && Number.isInteger(quantity) ? quantity : 0];
  }));
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
  $('authLoading').classList.add('hidden');
  authView.classList.remove('hidden');
  appView.classList.add('hidden');
  $('signout').classList.add('hidden');
  $('adminNavigation').classList.add('hidden');
  setAdminMenuOpen(false);
  products = [];
  productsView = 'collection';
  $('productSearch').value = '';
  $('visibilityFilter').value = 'all';
  productLoadVersion += 1;
  subscribers = [];
  $('productsList').replaceChildren();
  $('subscribersList').replaceChildren();
  $('visibleProducts').textContent = '—';
  $('hiddenProducts').textContent = '—';
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
  $('authLoading').classList.add('hidden');
  authView.classList.add('hidden');
  appView.classList.remove('hidden');
  $('signout').classList.remove('hidden');
  $('adminNavigation').classList.remove('hidden');
  $('password').value = '';
  setAdminPage(currentAdminPage);
  await loadAdminPage(currentAdminPage);
}

async function loadAdminPage(page) {
  if (page === 'collection') {
    await Promise.all([loadProducts(), loadSubscribers()]);
  } else if (page === 'add-product') {
    $('productName').focus();
    await loadProducts();
  } else if (page === 'product') {
    await loadProducts();
  } else if (page === 'subscribers') {
    await loadSubscribers();
  } else if (page === 'hero') {
    await loadHeroContent();
  } else {
    await loadAboutContent();
  }
}

async function navigateAdminPage(page, {view = 'collection', product = null, replace = false} = {}) {
  if (!Object.hasOwn(adminPages, page)) return;
  const params = new URLSearchParams({section: page});
  if (page === 'collection' && view === 'trash') params.set('view', 'trash');
  if (page === 'product' && product) params.set('product', product);
  const url = window.location.pathname + '?' + params;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
  currentAdminPage = page;
  productsView = page === 'collection' && view === 'trash' ? 'trash' : 'collection';
  $('productSearch').value = '';
  $('subscriberSearch').value = '';
  $('visibilityFilter').value = 'all';
  setAdminPage(page);
  setAdminMenuOpen(false);
  await loadAdminPage(page);
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
    })
    .filter(product => !product.permanently_deleted);
  const uploaded = savedProducts.filter(product => !product.website_key && !product.permanently_deleted).sort((a, b) =>
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

function nextProductPosition() {
  return products.reduce((highest, product) => {
    if (product.permanently_deleted) return highest;
    const position = Number(product.sort_order);
    return Number.isFinite(position) ? Math.max(highest, position) : highest;
  }, 0) + 1;
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
    const activeProducts = products.filter(product => !product.deleted_at && !product.permanently_deleted);
    $('visibleProducts').textContent = activeProducts.filter(product => product.is_visible).length;
    $('hiddenProducts').textContent = activeProducts.filter(product => !product.is_visible).length;
    $('trashCount').textContent = products.filter(product => product.deleted_at && !product.permanently_deleted).length;
    renderProducts();
    if (currentAdminPage === 'product') renderProductDetail();
    if (saved.status === 'rejected' || website.status === 'rejected') {
      const message = saved.status === 'rejected'
        ? 'Showing the website collection. Saved admin products could not be loaded.'
        : 'Showing saved admin products. The website collection could not be loaded.';
      if (currentAdminPage === 'product') showMessage(notice, message, 'error');
      else {
        showMessage($('collectionNotice'), message, 'error');
        $('collectionRetry').classList.remove('hidden');
      }
    }
  } catch {
    if (version !== productLoadVersion) return;
    if (currentAdminPage === 'product') {
      showMessage(notice, 'Product details could not be loaded. Please return to the collection and try again.', 'error');
      $('productDetail').innerHTML = '<p class="empty"><strong>Product unavailable.</strong><a class="btn" href="admin.html?section=collection">Back to collection</a></p>';
    } else {
      loadError(box, 'Your collection could not be loaded. Please try again.', loadProducts);
    }
  }
}

$('collectionRetry').addEventListener('click', loadProducts);
$('collectionView').addEventListener('click', () => {
  productsView = 'collection';
  $('productSearch').value = '';
  $('visibilityFilter').value = 'all';
  renderProducts();
});
$('trashView').addEventListener('click', () => {
  productsView = 'trash';
  $('productSearch').value = '';
  renderProducts();
});

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
  const inTrash = productsView === 'trash';
  const viewProducts = products.filter(product => Boolean(product.deleted_at) === inTrash && !product.permanently_deleted);
  const filtered = viewProducts.filter(product => (product.name + ' ' + (product.description || '') + ' ' + (product.price ?? '')).toLowerCase().includes(search)
    && (inTrash || visibility === 'all' || Boolean(product.is_visible) === (visibility === 'visible')));
  box.setAttribute('aria-busy', 'false');
  $('collectionHeading').firstChild.textContent = inTrash ? 'Trash ' : 'Collection ';
  $('collectionView').classList.toggle('active', !inTrash);
  $('trashView').classList.toggle('active', inTrash);
  $('collectionView').setAttribute('aria-selected', String(!inTrash));
  $('trashView').setAttribute('aria-selected', String(inTrash));
  $('addProduct').classList.toggle('hidden', inTrash);
  $('visibilityFilterWrap').classList.toggle('hidden', inTrash);
  $('productSearch').placeholder = inTrash ? 'Search trash…' : 'Search your collection…';
  $('productCount').textContent = filtered.length + (filtered.length !== viewProducts.length ? ' / ' + viewProducts.length : '');
  if (!filtered.length) {
    const emptyTitle = inTrash
      ? (viewProducts.length ? 'No matching deleted products.' : 'Trash is empty.')
      : (viewProducts.length ? 'No matching pieces.' : 'Your collection starts here.');
    const emptyMessage = inTrash
      ? (viewProducts.length ? 'Try a different search.' : 'Products you move to Trash will appear here.')
      : (viewProducts.length ? 'Try another search or change the visibility filter.' : 'Use + Add new to create your first product.');
    box.innerHTML = '<div class="empty"><strong>' + emptyTitle + '</strong><p>' + emptyMessage + '</p></div>';
    return;
  }
  box.innerHTML = '<div class="product-grid">' + filtered.map(product => {
    const image = safeImage(product.image_url);
    const name = escapeHtml(product.name);
    const id = escapeHtml(product.id);
    return '<a class="product-card" href="admin.html?section=product&amp;product=' + encodeURIComponent(String(product.id)) + '" aria-label="View details for ' + name + '">'
      + (image ? '<img class="product-card-image" src="' + escapeHtml(image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="product-card-image product-card-placeholder" aria-hidden="true">Loom7</span>')
      + '<span class="product-card-name">' + name + '</span></a>';
  }).join('') + '</div>';
  box.querySelectorAll('img').forEach(image => image.addEventListener('error', () => {
    const placeholder = document.createElement('span');
    placeholder.className = 'product-card-image product-card-placeholder';
    placeholder.textContent = 'Image unavailable';
    image.replaceWith(placeholder);
  }));
}

function renderProductDetail() {
  const container = $('productDetail');
  const productId = new URLSearchParams(window.location.search).get('product');
  const product = products.find(item => String(item.id) === productId);
  if (!product) {
    $('workspaceTitle').textContent = 'Product unavailable.';
    $('workspaceDescription').textContent = 'This product could not be found in your collection.';
    document.title = 'Loom7 Admin | Product unavailable';
    container.innerHTML = '<div class="empty"><strong>Product unavailable.</strong><p>It may have been permanently deleted or the link may be incorrect.</p><a class="btn" href="admin.html?section=collection">Back to collection</a></div>';
    return;
  }
  const name = escapeHtml(product.name);
  const price = product.price === null || product.price === undefined || product.price === '' ? null : Number(product.price);
  const priceText = Number.isFinite(price) && price >= 0 ? escapeHtml(priceFormatter.format(price)) : 'Ask for price';
  const inTrash = Boolean(product.deleted_at);
  const ordered = products.filter(item => !item.deleted_at && !item.permanently_deleted).sort((a, b) =>
    Number(a.sort_order || 0) - Number(b.sort_order || 0)
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    || String(a.id).localeCompare(String(b.id)));
  const position = inTrash ? 0 : ordered.findIndex(item => String(item.id) === String(product.id)) + 1;
  const image = safeImage(product.image_url);
  const galleryImages = Array.isArray(product.gallery_images) ? product.gallery_images.map(safeImage).filter(Boolean) : [];
  const video = safeImage(product.video_url);
  const availableSizes = Array.isArray(product.available_sizes) ? product.available_sizes : productSizes;
  const stockBySize = product.stock_by_size && typeof product.stock_by_size === 'object' ? product.stock_by_size : {};
  const stockRows = productSizes.map(size => '<div><dt>' + size + '</dt><dd>' + escapeHtml(String(Number.isInteger(Number(stockBySize[size])) ? Number(stockBySize[size]) : 0)) + '</dd></div>').join('');
  const status = inTrash
    ? '<span class="status unpublished">In Trash</span>'
    : '<button type="button" class="status-toggle' + (product.is_visible ? ' is-visible' : ' is-hidden') + '" role="switch" aria-checked="' + String(Boolean(product.is_visible)) + '" data-status-toggle="' + escapeHtml(product.id) + '" aria-label="' + (product.is_visible ? 'Visible' : 'Hidden') + ' on website: ' + name + '"><span class="sr-only">' + (product.is_visible ? 'Visible on website' : 'Hidden from website') + '</span></button>';
  const actions = inTrash
    ? '<button type="button" class="btn primary" data-restore="' + escapeHtml(product.id) + '">Restore to collection</button><button type="button" class="btn danger" data-permanent-delete="' + escapeHtml(product.id) + '">Delete permanently</button>'
    : '<button type="button" class="btn primary" data-edit="' + escapeHtml(product.id) + '">Edit product</button><button type="button" class="btn" data-set-position="' + escapeHtml(product.id) + '" data-position="' + position + '" data-position-count="' + ordered.length + '">Set position</button><button type="button" class="btn danger" data-delete="' + escapeHtml(product.id) + '">Move to Trash</button>';
  $('workspaceTitle').textContent = product.name;
  $('workspaceDescription').textContent = inTrash ? 'Review this deleted product or restore it to your collection.' : 'Review and manage this piece in your collection.';
  document.title = 'Loom7 Admin | ' + product.name;
  container.innerHTML = '<div class="product-detail-heading"><a class="btn" href="admin.html?section=collection' + (inTrash ? '&amp;view=trash' : '') + '">← Back to collection</a>' + status + '</div>'
    + '<div class="product-detail-grid"><div class="product-detail-media">' + (image ? '<img class="product-detail-cover" src="' + escapeHtml(image) + '" alt="' + name + '" referrerpolicy="no-referrer">' : '<div class="product-detail-cover product-card-placeholder">No product image</div>')
    + (galleryImages.length ? '<div class="product-detail-gallery">' + galleryImages.map((url, index) => '<img src="' + escapeHtml(url) + '" alt="' + name + ' photo ' + (index + 1) + '" loading="lazy" referrerpolicy="no-referrer">').join('') + '</div>' : '')
    + (video ? '<video class="product-detail-video" controls preload="metadata" src="' + escapeHtml(video) + '"></video>' : '')
    + '</div><div class="product-detail-info"><span class="eyebrow">' + (product.is_website_product ? 'Website product' : 'Collection piece') + '</span><h2 id="productDetailHeading">' + name + '</h2><p class="product-detail-price">' + priceText + '</p><p class="product-detail-description">' + escapeHtml(product.description || 'No description added.') + '</p><dl class="product-facts"><div><dt>Available sizes</dt><dd>' + availableSizes.map(escapeHtml).join(', ') + '</dd></div><div><dt>Collection position</dt><dd>' + (position || '—') + '</dd></div></dl><h3>Stock by size</h3><dl class="product-stock-detail">' + stockRows + '</dl><div class="product-detail-actions">' + actions + '</div></div></div>';
  const cover = container.querySelector('.product-detail-cover[src]');
  if (cover) cover.addEventListener('error', () => {
    const placeholder = document.createElement('div');
    placeholder.className = 'product-detail-cover product-card-placeholder';
    placeholder.textContent = 'Image unavailable';
    cover.replaceWith(placeholder);
  });
  container.querySelectorAll('.product-detail-gallery img').forEach(galleryImage => galleryImage.addEventListener('error', () => galleryImage.remove()));
  attachProductActions(container);
}

function openProductDeleteDialog(product, action) {
  if (!product) return;
  pendingDelete = product;
  pendingDeleteAction = action;
  $('deleteName').textContent = product.name;
  $('deleteHeading').textContent = action === 'trash' ? 'Move this piece to Trash?' : 'Permanently delete this piece?';
  $('deleteDescription').textContent = action === 'trash'
    ? 'The product and its media will be kept in Trash. You can restore it or permanently delete it later.'
    : 'This cannot be undone. The product and its stored media will be permanently deleted.';
  $('deleteDialog').querySelector('[value="delete"]').textContent = action === 'trash' ? 'Move to Trash' : 'Delete permanently';
  $('deleteDialog').querySelector('[value="cancel"]').textContent = action === 'trash' ? 'Cancel' : 'Keep in Trash';
  $('deleteDialog').returnValue = '';
  $('deleteDialog').showModal();
}

function attachProductActions(container) {
  container.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => openEditDialog(products.find(product => String(product.id) === button.dataset.edit))));
  container.querySelectorAll('[data-set-position]').forEach(button => button.addEventListener('click', () => {
    const product = products.find(item => String(item.id) === button.dataset.setPosition);
    if (product) openPositionDialog(product, Number(button.dataset.position), Number(button.dataset.positionCount), button);
  }));
  container.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () =>
    openProductDeleteDialog(products.find(product => String(product.id) === button.dataset.delete), 'trash')));
  container.querySelectorAll('[data-permanent-delete]').forEach(button => button.addEventListener('click', () =>
    openProductDeleteDialog(products.find(product => String(product.id) === button.dataset.permanentDelete), 'permanent-delete')));
  container.querySelectorAll('[data-restore]').forEach(button => button.addEventListener('click', () => {
    const product = products.find(item => String(item.id) === button.dataset.restore);
    if (product) restoreProduct(product);
  }));
  container.querySelectorAll('[data-status-toggle]').forEach(button => button.addEventListener('click', () => {
    const product = products.find(item => String(item.id) === button.dataset.statusToggle);
    if (product) updateProductVisibility(product, !product.is_visible);
  }));
}

let reorderingProduct = false;
let positionDialogProduct = null;
let positionDialogTrigger = null;

function openPositionDialog(product, position, productCount, trigger) {
  positionDialogProduct = product;
  positionDialogTrigger = trigger;
  const input = $('positionInput');
  input.min = '1';
  input.max = String(productCount);
  input.value = String(position);
  input.setCustomValidity('');
  $('positionProductName').textContent = product.name;
  $('positionHint').textContent = 'Enter a position from 1 to ' + productCount + '.';
  $('positionSave').disabled = false;
  $('positionDialog').showModal();
  input.focus();
  input.select();
}

$('positionDialog').addEventListener('close', () => {
  const trigger = positionDialogTrigger;
  const productId = positionDialogProduct?.id;
  positionDialogProduct = null;
  positionDialogTrigger = null;
  const focusTarget = trigger?.isConnected ? trigger : Array.from(document.querySelectorAll('[data-set-position]'))
    .find(button => button.dataset.setPosition === String(productId));
  if (focusTarget) focusTarget.focus();
});
$('positionCancel').addEventListener('click', () => $('positionDialog').close());
$('positionForm').addEventListener('submit', async event => {
  event.preventDefault();
  const product = positionDialogProduct;
  const input = $('positionInput');
  const position = Number(input.value);
  const minimum = Number(input.min);
  const maximum = Number(input.max);
  const valid = Number.isInteger(position) && position >= minimum && position <= maximum;
  input.setCustomValidity(valid ? '' : 'Enter a whole-number position from ' + minimum + ' to ' + maximum + '.');
  if (!valid || !input.reportValidity() || !product) return;
  $('positionSave').disabled = true;
  $('positionSave').textContent = 'Saving…';
  try {
    const reordered = await reorderProduct(product, position);
    if (reordered) $('positionDialog').close();
  } finally {
    $('positionSave').disabled = false;
    $('positionSave').textContent = 'Set position';
  }
});

async function reorderProduct(product, position) {
  if (!db || reorderingProduct) return false;
  reorderingProduct = true;
  document.querySelectorAll('[data-set-position]').forEach(button => { button.disabled = true; });
  try {
    const {error} = await db.rpc('reorder_product', {
      p_product_id: product.id,
      p_new_position: position,
    });
    if (error) throw error;
    await loadProducts();
    showMessage(notice, '“' + product.name + '” moved to position ' + position + ' in the collection.', 'success');
    return true;
  } catch (error) {
    const detail = error && typeof error.message === 'string' ? error.message : String(error);
    showMessage(notice, 'Could not change the product position: ' + detail
      + '. Run the updated supabase/products.sql script, then try again.', 'error');
    return false;
  } finally {
    reorderingProduct = false;
    if (currentAdminPage === 'product') renderProductDetail();
  }
}

async function loadSubscribers() {
  const box = $('subscribersList');
  loading(box, 'Loading your community…');
  try {
    const {data, error} = await db.from('newsletter_subscribers').select('id,email,full_name,consented_at').order('consented_at', {ascending: false});
    if (error) throw error;
    subscribers = data || [];
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
  setProductStock('edit-product-stock', product.stock_by_size);
  editGalleryUrls = Array.isArray(product.gallery_images) ? product.gallery_images.filter(safeImage) : [];
  editRemovedGalleryUrls = new Set();
  editVideoUrl = safeImage(product.video_url);
  $('editGalleryImages').value = '';
  $('editProductVideo').value = '';
  $('removeProductVideo').checked = false;
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
    stock_by_size: selectedProductStock('edit-product-stock', selectedProductSizes('edit-product-sizes')),
    image_url: product.image_url || null,
    gallery_images: editGalleryUrls.filter(url => !editRemovedGalleryUrls.has(url)),
    video_url: $('removeProductVideo').checked ? null : editVideoUrl || null,
    is_visible: Boolean(product.is_visible)};
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

function setAdminPage(page) {
  const config = adminPages[page];
  $('workspaceTitle').textContent = config.title;
  $('workspaceDescription').textContent = config.description;
  document.title = 'Loom7 Admin | ' + config.title.replace(/\.$/, '');
  $('overview').classList.toggle('hidden', page !== 'collection');
  Object.values(adminPages).forEach(section => $(section.panel).classList.toggle('hidden', section.panel !== config.panel));
  const activeNavigation = config.navigation || page;
  document.querySelectorAll('[data-admin-page]').forEach(link => {
    if (link.dataset.adminPage === activeNavigation) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function setAdminMenuOpen(open, returnFocus = false) {
  $('menuToggle').setAttribute('aria-expanded', String(open));
  $('menuToggle').setAttribute('aria-label', open ? 'Close admin menu' : 'Open admin menu');
  $('adminMenu').classList.toggle('is-open', open);
  $('adminMenu').setAttribute('aria-hidden', String(!open));
  $('adminMenu').inert = !open;
  if (returnFocus) $('menuToggle').focus();
}

$('menuToggle').addEventListener('click', () => {
  setAdminMenuOpen($('menuToggle').getAttribute('aria-expanded') !== 'true');
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('menuToggle').getAttribute('aria-expanded') === 'true') {
    event.preventDefault();
    setAdminMenuOpen(false, true);
  }
});
document.addEventListener('click', event => {
  if ($('menuToggle').getAttribute('aria-expanded') === 'true' && !$('adminNavigation').contains(event.target)) {
    setAdminMenuOpen(false);
  }
});
document.addEventListener('click', event => {
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!link) return;
  const url = new URL(link.href);
  if (url.origin !== window.location.origin
    || !/\/admin(?:\.html)?$/.test(url.pathname)
    || !url.searchParams.has('section')) return;
  const page = url.searchParams.get('section');
  if (!Object.hasOwn(adminPages, page)) return;
  event.preventDefault();
  void navigateAdminPage(page, {
    view: url.searchParams.get('view'),
    product: url.searchParams.get('product'),
  });
});
window.addEventListener('popstate', () => {
  const params = new URLSearchParams(window.location.search);
  const requestedPage = params.get('section');
  currentAdminPage = Object.hasOwn(adminPages, requestedPage) ? requestedPage : 'collection';
  productsView = currentAdminPage === 'collection' && params.get('view') === 'trash' ? 'trash' : 'collection';
  setAdminPage(currentAdminPage);
  void loadAdminPage(currentAdminPage);
});

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
  const uploadedPosition = nextProductPosition();
  const values = {name, description: $('productDescription').value.trim() || null,
    price: $('productPrice').value === '' ? null : Number($('productPrice').value),
    available_sizes: selectedProductSizes('product-sizes'),
    stock_by_size: selectedProductStock('product-stock', selectedProductSizes('product-sizes')),
    image_url: currentImageUrl || null,
    gallery_images: [],
    video_url: null,
    is_visible: $('productVisible').checked, sort_order: uploadedPosition};
  const uploadedAssets = [];
  setBusy($('saveButton'), true, 'Saving…');
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
    $('productImage').disabled = false;
    $('productGalleryImages').disabled = false;
    $('productVideo').disabled = false;
  }
});

async function updateProductVisibility(product, isVisible) {
 if (!db) return;
 const button = document.querySelector(`[data-status-toggle="${CSS.escape(String(product.id))}"]`);
 if (button) button.disabled = true;
  try {
   const values = {is_visible: isVisible};
   const result = product.is_website_product && String(product.id).startsWith('website-')
     ? await db.from('products').upsert({
       website_key: product.website_key,
       name: product.name,
       description: product.description || null,
       price: product.price ?? null,
       image_url: product.image_url || null,
       gallery_images: product.gallery_images || [],
       video_url: product.video_url || null,
       available_sizes: product.available_sizes || [...productSizes],
       is_visible: isVisible,
       deleted_at: null,
       permanently_deleted: false,
       sort_order: product.sort_order || 0,
     }, {onConflict: 'website_key'}).select('id')
     : await db.from('products').update(values).eq('id', product.id).select('id');
   if (result.error) throw result.error;
   if (!result.data?.length) throw new Error('The product no longer exists or you do not have permission to update it.');
   await loadProducts();
   showMessage(notice, '“' + product.name + '” is now ' + (isVisible ? 'visible' : 'hidden') + ' on the website.', 'success');
 } catch (error) {
   showMessage(notice, 'Could not change “' + product.name + '” status: ' + (error.message || String(error)), 'error');
   renderProducts();
 }
}

async function restoreProduct(product) {
 if (!db) return;
 try {
   const {data, error} = await db.from('products').update({
     deleted_at: null,
     permanently_deleted: false,
     sort_order: nextProductPosition(),
   }).eq('id', product.id).select('id');
   if (error) throw error;
   if (!data?.length) throw new Error('The product could not be restored. Check your admin access.');
   productsView = 'collection';
   await loadProducts();
   showMessage(notice, '“' + product.name + '” restored to the collection.', 'success');
 } catch (error) {
   showMessage(notice, 'Could not restore “' + product.name + '”: ' + (error.message || String(error)), 'error');
 }
}

$('deleteDialog').addEventListener('close', async () => {
 const product = pendingDelete;
 const action = pendingDeleteAction;
 pendingDelete = null;
 pendingDeleteAction = 'trash';
 if ($('deleteDialog').returnValue !== 'delete' || !product) return;
 try {
   if (action === 'trash') {
     const result = product.is_website_product && String(product.id).startsWith('website-')
       ? await db.from('products').upsert({
         website_key: product.website_key,
         name: product.name,
         description: product.description || null,
         price: product.price ?? null,
         image_url: product.image_url || null,
         gallery_images: product.gallery_images || [],
         video_url: product.video_url || null,
         available_sizes: product.available_sizes || [...productSizes],
         is_visible: Boolean(product.is_visible),
         deleted_at: new Date().toISOString(),
         permanently_deleted: false,
         sort_order: product.sort_order || 0,
       }, {onConflict: 'website_key'}).select('id')
       : await db.from('products').update({deleted_at: new Date().toISOString()}).eq('id', product.id).select('id');
     if (result.error) throw result.error;
     if (!result.data?.length) throw new Error('The product could not be moved to Trash. Check your admin access.');
     productsView = 'trash';
     if (currentAdminPage === 'product') await navigateAdminPage('collection', {view: 'trash'});
     else await loadProducts();
     showMessage(notice, '“' + product.name + '” moved to Trash. Its media is kept so it can be restored.', 'success');
     return;
   }

   let result;
   if (product.website_key) {
     result = await db.from('products').update({
       permanently_deleted: true,
       deleted_at: null,
       is_visible: false,
     }).eq('id', product.id).select('id');
   } else {
     result = await db.from('products').delete().eq('id', product.id).select('id');
   }
   if (result.error) throw result.error;
   if (!result.data?.length) throw new Error('The product could not be permanently deleted. Check your admin access.');
   if (currentAdminPage === 'product') await navigateAdminPage('collection', {view: 'trash'});
   else await loadProducts();
   try {
     await removeProductAssets([product.image_url, ...(product.gallery_images || []), product.video_url]);
   } catch (error) {
     showMessage(notice, '“' + product.name + '” was deleted, but some media could not be removed from storage: ' + (error.message || String(error)), 'error');
     return;
   }
   showMessage(notice, '“' + product.name + '” was permanently deleted.', 'success');
 } catch (error) {
   showMessage(notice, 'Could not ' + (action === 'trash' ? 'move “' + product.name + '” to Trash' : 'permanently delete “' + product.name + '”') + ': ' + (error.message || String(error)), 'error');
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
$('addProduct').addEventListener('click', () => {
  void navigateAdminPage('add-product');
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
  showAuth();
  $('loginButton').disabled = true;
  showMessage(authNotice, 'The sign-in service could not be loaded. Check your connection and reload.', 'error');
} else {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  db.auth.getSession().then(async ({data, error}) => {
    if (error) throw error;
    if (data.session) await enterApp(data.session.user);
    else showAuth();
  }).catch(() => {
    showAuth();
    showMessage(authNotice, 'Could not restore your session. Please sign in again.', 'error');
  });
}
