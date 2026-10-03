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
let currentHeroImage = window.Loom7Hero.defaults.image_url;
let heroPreviewObjectUrl = '';
let heroLoaded = false;
let heroLoadVersion = 0;

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
  } catch {
    if (version !== heroLoadVersion) return;
    showMessage($('heroNotice'), 'Could not load the Hero Section. Run supabase/hero.sql in your Supabase SQL Editor, then try again.', 'error');
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
  } catch {
    if (uploadedPath) {
      try { await db.storage.from('hero_images').remove([uploadedPath]); } catch {}
    }
    if (version === heroLoadVersion) showMessage($('heroNotice'), 'Could not save the Hero Section. Check your connection, admin access, and hero.sql setup. Your changes remain in the form.', 'error');
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
  return Array.from(website.querySelectorAll('#collection .product')).map((card, index) => {
    const name = card.querySelector('.product-copy h3')?.textContent.trim();
    const image = card.querySelector('.product-image img')?.getAttribute('src');
    return {
      id: 'website-' + index,
      name,
      description: card.querySelector('.product-copy p')?.textContent.trim() || '',
      image_url: image ? new URL(image, websiteUrl).href : '',
      is_visible: true,
      is_website_product: true,
    };
  }).filter(product => product.name);
}

function mergeProducts(savedProducts, websiteProducts) {
  return savedProducts.concat(websiteProducts.filter(websiteProduct => !savedProducts.some(product =>
    product.name.trim().toLowerCase() === websiteProduct.name.toLowerCase()
    && safeImage(product.image_url) === safeImage(websiteProduct.image_url))));
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
  const filtered = products.filter(product => (product.name + ' ' + (product.description || '')).toLowerCase().includes(search) && (visibility === 'all' || Boolean(product.is_visible) === (visibility === 'visible')));
  box.setAttribute('aria-busy', 'false');
  $('productCount').textContent = filtered.length + (filtered.length !== products.length ? ' / ' + products.length : '');
  if (!filtered.length) {
    box.innerHTML = '<div class="empty"><strong>' + (products.length ? 'No matching pieces.' : 'Your collection starts here.') + '</strong><p>' + (products.length ? 'Try another search or change the visibility filter.' : 'Add your first product using the collection details form.') + '</p></div>';
    return;
  }
  box.innerHTML = '<table><caption class="sr-only">Products in your collection</caption><thead><tr><th scope="col">Image</th><th scope="col">Product</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>' + filtered.map(product => {
    const image = safeImage(product.image_url);
    const name = escapeHtml(product.name);
    const id = escapeHtml(product.id);
    const actions = product.is_website_product
      ? '<a class="btn" href="index.html#collection" target="_blank" rel="noopener" aria-label="View ' + name + ' on the website">View on website</a>'
      : '<button type="button" class="btn" data-edit="' + id + '" aria-label="Edit ' + name + '">Edit</button><button type="button" class="btn danger" data-delete="' + id + '" aria-label="Delete ' + name + '">Delete</button>';
    return '<tr><td>' + (image ? '<img class="thumb" src="' + escapeHtml(image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="thumb thumb-placeholder" aria-label="No image">—</span>') + '</td><td class="product-cell"><strong>' + name + '</strong><span class="muted product-description">' + escapeHtml(product.description || 'No description added') + '</span>' + (product.is_website_product ? '<span class="muted">Website product · read-only</span>' : '') + '</td><td><span class="status' + (product.is_visible ? '' : ' unpublished') + '">' + (product.is_visible ? 'Visible' : 'Hidden') + '</span></td><td><div class="row-actions">' + actions + '</div></td></tr>';
  }).join('') + '</tbody></table>';
  box.querySelectorAll('img').forEach(image => image.addEventListener('error', () => {
    const placeholder = document.createElement('span');
    placeholder.className = 'thumb thumb-placeholder';
    placeholder.textContent = '—';
    placeholder.setAttribute('aria-label', 'Image unavailable');
    image.replaceWith(placeholder);
  }));
  box.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => editProduct(products.find(product => String(product.id) === button.dataset.edit))));
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

function editProduct(product) {
  $('productId').value = product.id;
  $('productName').value = product.name;
  $('productDescription').value = product.description || '';
  $('productImage').value = '';
  $('productImage').setCustomValidity('');
  currentImageUrl = product.image_url || '';
  $('productVisible').checked = product.is_visible;
  $('formHeading').textContent = 'Edit product';
  $('cancelEdit').classList.remove('hidden');
  updateDescriptionCount();
  updatePreview();
  focusEditor();
}

function resetProductForm() {
  $('productForm').reset();
  $('productId').value = '';
  $('productVisible').checked = true;
  $('formHeading').textContent = 'Add a product';
  $('cancelEdit').classList.add('hidden');
  $('productImage').setCustomValidity('');
  currentImageUrl = '';
  updateDescriptionCount();
  updatePreview();
}

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
  const file = $('productImage').files[0];
  const id = $('productId').value;
  const values = {name, description: $('productDescription').value.trim() || null, image_url: currentImageUrl || null, is_visible: $('productVisible').checked};
  setBusy($('saveButton'), true, 'Saving…');
  $('cancelEdit').disabled = true;
  $('addProduct').disabled = true;
  $('productImage').disabled = true;
  try {
    if (file) {
      $('saveButton').textContent = 'Uploading image…';
      const {data, error} = await db.auth.getSession();
      if (error || !data.session) throw new Error('Please sign in again before uploading an image.');
      const body = new FormData();
      body.append('image', file);
      const response = await fetch('/.netlify/functions/product-image', {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + data.session.access_token, apikey: SUPABASE_ANON_KEY},
        body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Image upload failed. Please try again.');
      currentImageUrl = result.url;
      values.image_url = currentImageUrl;
      $('productImage').value = '';
      updatePreview();
      $('saveButton').textContent = 'Saving…';
    }
    const result = id ? await db.from('products').update(values).eq('id', id) : await db.from('products').insert(values);
    if (result.error) throw result.error;
    showMessage(notice, '“' + name + '” saved' + (values.is_visible ? ' and visible on the website.' : ' as a hidden product.'), 'success');
    resetProductForm();
    await loadProducts();
  } catch (error) {
    showMessage(notice, (error.message || 'This product could not be saved.') + ' Your changes are still in the form. Please try again.', 'error');
  } finally {
    setBusy($('saveButton'), false);
    $('cancelEdit').disabled = false;
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
    if ($('productId').value === String(product.id)) resetProductForm();
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
  if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024 || !file.size)) {
    $('productImage').setCustomValidity('Choose a JPEG, PNG, or WebP image smaller than 3 MB.');
    $('productImage').reportValidity();
    return;
  }
  updatePreview();
});
$('productSearch').addEventListener('input', renderProducts);
$('visibilityFilter').addEventListener('change', renderProducts);
$('subscriberSearch').addEventListener('input', renderSubscribers);
$('cancelEdit').addEventListener('click', () => { resetProductForm(); focusEditor(); });
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
