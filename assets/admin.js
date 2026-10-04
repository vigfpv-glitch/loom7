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
let currentHeroImage = window.Loom7Hero.defaults.image_url;
let heroPreviewObjectUrl = '';
let heroLoaded = false;
let heroLoadVersion = 0;
const priceFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2,
});

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
  $('heroFields').disabled = true;
  $('heroUpload').value = '';
  currentHeroImage = window.Loom7Hero.defaults.image_url;
  updateHeroPreview();
  $('heroNotice').classList.add('hidden');
  $('heroRetry').classList.add('hidden');
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
  await Promise.all([loadProducts(), loadSubscribers(), loadHeroContent()]);
}

function updateHeroPreview() {
  if (heroPreviewObjectUrl) URL.revokeObjectURL(heroPreviewObjectUrl);
  heroPreviewObjectUrl = '';
  const file = $('heroUpload').files[0];
  if (file) heroPreviewObjectUrl = URL.createObjectURL(file);
  $('heroPreviewImage').src = heroPreviewObjectUrl || currentHeroImage;
  $('heroPreviewStatus').textContent = file ? 'Selected image — save to publish' : 'Current website image';
}

async function loadHeroContent() {
  const version = ++heroLoadVersion;
  heroLoaded = false;
  $('heroFields').disabled = true;
  $('heroRetry').classList.add('hidden');
  $('heroForm').setAttribute('aria-busy', 'true');
  showMessage($('heroNotice'), 'Loading your Hero Section…');
  try {
    const {data, error} = await db.from('hero_content').select('title, subtitle, cta_text, cta_link, image_url')
      .eq('id', window.Loom7Hero.id).maybeSingle();
    if (version !== heroLoadVersion) return;
    if (error) throw error;
    const content = window.Loom7Hero.normalize(data || {});
    $('heroTitle').value = content.title;
    $('heroSubtitle').value = content.subtitle;
    $('heroButtonText').value = content.cta_text;
    $('heroButtonLink').value = content.cta_link;
    currentHeroImage = content.image_url;
    $('heroUpload').value = '';
    updateHeroPreview();
    heroLoaded = true;
    $('heroFields').disabled = false;
    showMessage($('heroNotice'), data ? 'Your published Hero Section is ready to edit.' : 'The website currently uses its default Hero Section. Save to publish your changes.');
  } catch (error) {
    if (version !== heroLoadVersion) return;
    const detail = error && typeof error.message === 'string' ? error.message : String(error);
    showMessage($('heroNotice'), 'Could not load the Hero Section: ' + detail + '. If the hero_content table is missing, run supabase/hero.sql in your Supabase SQL Editor, then try again.', 'error');
    $('heroRetry').classList.remove('hidden');
  } finally {
    if (version === heroLoadVersion) $('heroForm').setAttribute('aria-busy', 'false');
  }
}

function validateHeroImage() {
  const file = $('heroUpload').files[0];
  const valid = !file || (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    && file.size > 0 && file.size <= 5 * 1024 * 1024);
  $('heroUpload').setCustomValidity(valid ? '' : 'Choose a JPEG, PNG, or WebP image up to 5 MB.');
  return valid;
}

$('heroForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!db || !heroLoaded) return;
  const title = $('heroTitle').value.trim();
  const buttonText = $('heroButtonText').value.trim();
  const buttonLink = window.Loom7Hero.safeUrl($('heroButtonLink').value.trim());
  $('heroTitle').setCustomValidity(title ? '' : 'Enter a title.');
  $('heroButtonText').setCustomValidity(buttonText ? '' : 'Enter button text.');
  $('heroButtonLink').setCustomValidity(buttonLink ? '' : 'Enter a complete HTTP or HTTPS URL without credentials.');
  validateHeroImage();
  if (!$('heroForm').reportValidity()) return;
  const file = $('heroUpload').files[0];
  const values = {id: window.Loom7Hero.id, title, subtitle: $('heroSubtitle').value.trim(),
    cta_text: buttonText, cta_link: buttonLink, image_url: currentHeroImage};
  const version = heroLoadVersion;
  let uploadedPath = '';
  setBusy($('heroSave'), true, 'Saving…');
  $('heroFields').disabled = true;
  $('heroForm').setAttribute('aria-busy', 'true');
  try {
    if (file) {
      $('heroSave').textContent = 'Uploading image…';
      const extension = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}[file.type];
      const path = 'hero/' + crypto.randomUUID() + '.' + extension;
      const {error} = await db.storage.from('hero_images').upload(path, file, {contentType: file.type, upsert: false});
      if (error) throw error;
      uploadedPath = path;
      const {data} = db.storage.from('hero_images').getPublicUrl(path);
      values.image_url = data.publicUrl;
    }
    if (version !== heroLoadVersion) throw new Error('Your session changed. Sign in again before saving.');
    $('heroSave').textContent = 'Publishing…';
    const {error} = await db.from('hero_content').upsert(values, {onConflict: 'id'});
    if (error) throw error;
    uploadedPath = '';
    if (version !== heroLoadVersion) return;
    currentHeroImage = values.image_url;
    $('heroUpload').value = '';
    updateHeroPreview();
    showMessage($('heroNotice'), 'Hero Section saved. Reload the website to see your changes.', 'success');
  } catch (error) {
    if (uploadedPath) {
      try {
        const {error: cleanupError} = await db.storage.from('hero_images').remove([uploadedPath]);
        if (cleanupError) console.warn('Could not remove the unpublished Hero image upload.', cleanupError);
      } catch (cleanupError) {
        console.warn('Could not remove the unpublished Hero image upload.', cleanupError);
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
$('heroUpload').addEventListener('change', () => {
  if (!validateHeroImage()) { $('heroUpload').reportValidity(); return; }
  updateHeroPreview();
});
['heroTitle', 'heroButtonText', 'heroButtonLink'].forEach(id => {
  $(id).addEventListener('input', () => $(id).setCustomValidity(''));
});
$('heroPreviewImage').addEventListener('error', () => {
  if ($('heroPreviewImage').getAttribute('src') !== window.Loom7Hero.defaults.image_url) {
    $('heroPreviewImage').src = window.Loom7Hero.defaults.image_url;
    $('heroPreviewStatus').textContent = 'Image unavailable — showing the default image';
  }
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
      is_website_product: true,
    };
  }).filter(product => product.name);
}

function mergeProducts(savedProducts, websiteProducts) {
  return savedProducts.concat(websiteProducts.filter(websiteProduct => !savedProducts.some(product =>
    product.website_key === websiteProduct.website_key
    || (product.name.trim().toLowerCase() === websiteProduct.name.toLowerCase()
      && safeImage(product.image_url) === safeImage(websiteProduct.image_url)))));
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
  box.innerHTML = '<table><caption class="sr-only">Products in your collection</caption><thead><tr><th scope="col">Image</th><th scope="col">Product</th><th scope="col">Price</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>' + filtered.map(product => {
    const image = safeImage(product.image_url);
    const name = escapeHtml(product.name);
    const id = escapeHtml(product.id);
    const price = product.price === null || product.price === undefined || product.price === ''
      ? null : Number(product.price);
    const priceText = Number.isFinite(price) && price >= 0 ? escapeHtml(priceFormatter.format(price)) : '—';
    const actions = '<button type="button" class="btn" data-edit="' + id + '" aria-label="Edit ' + name + '">Edit</button>'
      + (product.is_website_product ? '' : '<button type="button" class="btn danger" data-delete="' + id + '" aria-label="Delete ' + name + '">Delete</button>');
    return '<tr><td>' + (image ? '<img class="thumb" src="' + escapeHtml(image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="thumb thumb-placeholder" aria-label="No image">—</span>') + '</td><td class="product-cell"><strong>' + name + '</strong><span class="muted product-description">' + escapeHtml(product.description || 'No description added') + '</span>' + (product.is_website_product ? '<span class="muted">Website product</span>' : '') + '</td><td>' + priceText + '</td><td><span class="status' + (product.is_visible ? '' : ' unpublished') + '">' + (product.is_visible ? 'Visible' : 'Hidden') + '</span></td><td><div class="row-actions">' + actions + '</div></td></tr>';
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
    $('deleteDialog').returnValue = '';
    $('deleteDialog').showModal();
  }));
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
  currentImageUrl = '';
  updateDescriptionCount();
  updatePreview();
}

const productImageTypes = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'};

function validProductImage(file) {
  return !file || (file.type in productImageTypes && file.size > 0 && file.size <= 3 * 1024 * 1024);
}

async function uploadProductImage(file) {
  const path = 'products/' + crypto.randomUUID() + '.' + productImageTypes[file.type];
  const {error} = await db.storage.from('product_images').upload(path, file, {contentType: file.type, upsert: false});
  if (error) throw new Error('Image upload failed. Check that supabase/products.sql has been run.');
  return {path, url: db.storage.from('product_images').getPublicUrl(path).data.publicUrl};
}

function productImagePath(url) {
  if (!url) return '';
  const prefix = db.storage.from('product_images').getPublicUrl('_').data.publicUrl.slice(0, -1);
  if (!url.startsWith(prefix)) return '';
  try { return decodeURIComponent(url.slice(prefix.length).split('?')[0]); } catch { return ''; }
}

async function removeProductImage(url) {
  const path = productImagePath(url);
  if (!path) return;
  try { await db.storage.from('product_images').remove([path]); } catch {}
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
  $('editVisibility').value = product.is_visible ? 'visible' : 'hidden';
  $('editHeading').textContent = 'Edit “' + product.name + '”';
  $('editNotice').classList.add('hidden');
  updateEditDescriptionCount();
  updateEditPreview();
  $('editDialog').showModal();
  $('editName').focus();
}

function closeEditDialog(force = false) {
  if (editSaving && !force) return;
  if ($('editDialog').open) $('editDialog').close();
  editingProduct = null;
  $('editImage').value = '';
  if (editPreviewObjectUrl) URL.revokeObjectURL(editPreviewObjectUrl);
  editPreviewObjectUrl = '';
}

$('editForm').addEventListener('submit', async event => {
  event.preventDefault();
  const product = editingProduct;
  if (!db || !product || editSaving) return;
  const name = $('editName').value.trim();
  const file = $('editImage').files[0];
  $('editName').setCustomValidity(name ? '' : 'Enter a product title.');
  $('editImage').setCustomValidity(validProductImage(file) ? '' : 'Choose a JPEG, PNG, or WebP image smaller than 3 MB.');
  if (!$('editForm').reportValidity()) return;
  const values = {name, description: $('editDescription').value.trim() || null,
    price: $('editPrice').value === '' ? null : Number($('editPrice').value),
    image_url: product.image_url || null, is_visible: $('editVisibility').value === 'visible'};
  let uploaded = null;
  editSaving = true;
  setBusy($('editSave'), true, 'Saving…');
  $('editFields').disabled = true;
  $('editNotice').classList.add('hidden');
  try {
    if (file) {
      $('editSave').textContent = 'Uploading image…';
      uploaded = await uploadProductImage(file);
      values.image_url = uploaded.url;
      $('editSave').textContent = 'Saving…';
    }
    const result = product.is_website_product
      ? await db.from('products').upsert({...values, website_key: product.website_key}, {onConflict: 'website_key'}).select('id')
      : await db.from('products').update(values).eq('id', product.id).select('id');
    if (result.error) throw result.error;
    if (!result.data?.length) throw new Error('This product no longer exists or you no longer have access to it.');
    if (uploaded && product.image_url !== uploaded.url) await removeProductImage(product.image_url);
    uploaded = null;
    editSaving = false;
    closeEditDialog();
    showMessage(notice, '“' + name + '” updated' + (values.is_visible ? ' and visible on the website.' : ' and hidden from the website.'), 'success');
    if (!appView.classList.contains('hidden')) await loadProducts();
  } catch (error) {
    if (uploaded) await removeProductImage(uploaded.url);
    showMessage($('editNotice'), (error.message || 'This product could not be saved.') + ' Your changes are still in the form. Please try again.', 'error');
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
  ['products', 'subscribers', 'hero'].forEach(section => {
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
  const values = {name, description: $('productDescription').value.trim() || null,
    price: $('productPrice').value === '' ? null : Number($('productPrice').value),
    image_url: currentImageUrl || null, is_visible: $('productVisible').checked};
  let uploaded = null;
  setBusy($('saveButton'), true, 'Saving…');
  $('addProduct').disabled = true;
  $('productImage').disabled = true;
  try {
    if (file) {
      $('saveButton').textContent = 'Uploading image…';
      uploaded = await uploadProductImage(file);
      values.image_url = uploaded.url;
      $('saveButton').textContent = 'Saving…';
    }
    const result = await db.from('products').insert(values);
    if (result.error) throw result.error;
    uploaded = null;
    showMessage(notice, '“' + name + '” saved' + (values.is_visible ? ' and visible on the website.' : ' as a hidden product.'), 'success');
    resetProductForm();
    await loadProducts();
  } catch (error) {
    if (uploaded) await removeProductImage(uploaded.url);
    showMessage(notice, (error.message || 'This product could not be saved.') + ' Your changes are still in the form. Please try again.', 'error');
  } finally {
    setBusy($('saveButton'), false);
    $('addProduct').disabled = false;
    $('productImage').disabled = false;
  }
});

$('deleteDialog').addEventListener('close', async () => {
  const product = pendingDelete;
  pendingDelete = null;
  if ($('deleteDialog').returnValue !== 'delete' || !product) return;
  try {
    const {error} = await db.from('products').delete().eq('id', product.id);
    if (error) throw error;
    await removeProductImage(product.image_url);
    showMessage(notice, '“' + product.name + '” deleted from the collection.', 'success');
    await loadProducts();
  } catch {
    showMessage(notice, 'This product could not be deleted. Please try again.', 'error');
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
