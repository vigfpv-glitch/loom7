const SITE_URL = 'https://loom7.pages.dev';
const SUPABASE_URL = 'https://oofrtvkdljiphcsydcjo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_18ficoJXs66FopQnhcmkbA_kpDSF3yX';
const BUILT_IN_KEYS = ['roots-01', 'roots-02', 'roots-03', 'roots-04'];

function xmlEscape(value) {
  return String(value).replace(/[<>&"']/g, character => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]);
}

function sitemapUrl(location, lastModified) {
  const lastmod = lastModified && Number.isFinite(Date.parse(lastModified))
    ? `<lastmod>${new Date(lastModified).toISOString()}</lastmod>` : '';
  return `<url><loc>${xmlEscape(location)}</loc>${lastmod}</url>`;
}

export async function onRequestGet() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/products`);
  url.search = new URLSearchParams({
    select: 'id,website_key,updated_at',
    is_visible: 'eq.true',
    deleted_at: 'is.null',
    permanently_deleted: 'eq.false',
    limit: '1000',
  });
  const [response, hiddenResponse] = await Promise.all([
    fetch(url, {
      headers: {apikey: SUPABASE_ANON_KEY},
      signal: AbortSignal.timeout(5000),
    }),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/hidden_website_product_keys`, {
      method: 'POST',
      headers: {'apikey': SUPABASE_ANON_KEY, 'content-type': 'application/json'},
      body: '{}',
      signal: AbortSignal.timeout(5000),
    }),
  ]);
  if (!response.ok) {
    console.error(`Sitemap could not load the public product catalogue (${response.status}).`);
    return new Response('The sitemap is temporarily unavailable.', {
      status: 503,
      headers: {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store'},
    });
  }
  const products = await response.json();
  if (!Array.isArray(products)) {
    console.error('Sitemap catalogue response was not a list.');
    return new Response('The sitemap is temporarily unavailable.', {
      status: 503,
      headers: {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store'},
    });
  }
  if (!hiddenResponse.ok) {
    console.error(`Sitemap could not load hidden product keys (${hiddenResponse.status}).`);
    return new Response('The sitemap is temporarily unavailable.', {
      status: 503,
      headers: {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store'},
    });
  }
  const hiddenProducts = await hiddenResponse.json();
  if (!Array.isArray(hiddenProducts)) {
    console.error('Sitemap hidden product keys response was not a list.');
    return new Response('The sitemap is temporarily unavailable.', {
      status: 503,
      headers: {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store'},
    });
  }
  const hiddenKeys = new Set(hiddenProducts.map(item => typeof item === 'string' ? item : Object.values(item)[0]));

  const entries = new Map([
    [`${SITE_URL}/`, null],
    [`${SITE_URL}/collection`, null],
  ]);
  const listedKeys = new Set();
  for (const product of products) {
    const detail = new URL('/product', SITE_URL);
    if (product.website_key && /^[a-z0-9-]{1,64}$/.test(product.website_key)) {
      detail.searchParams.set('key', product.website_key);
      listedKeys.add(product.website_key);
    } else if (product.id && /^[0-9a-f-]{36}$/i.test(product.id)) {
      detail.searchParams.set('id', product.id);
    } else {
      continue;
    }
    entries.set(detail.href, product.updated_at || null);
  }
  for (const key of BUILT_IN_KEYS) {
    if (listedKeys.has(key) || hiddenKeys.has(key)) continue;
    const detail = new URL('/product', SITE_URL);
    detail.searchParams.set('key', key);
    entries.set(detail.href, null);
  }

  const body = [...entries].map(([location, lastModified]) => sitemapUrl(location, lastModified)).join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`,
    {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'x-content-type-options': 'nosniff',
      },
    },
  );
}
