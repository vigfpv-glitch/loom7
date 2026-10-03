import { getStore } from '@netlify/blobs';

function imageFormat(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return {extension: 'jpg', type: 'image/jpeg'};
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return {extension: 'png', type: 'image/png'};
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return {extension: 'webp', type: 'image/webp'};
  return null;
}

export default async (request: Request) => {
  const maxSize = 3 * 1024 * 1024;
  try {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const key = new URL(request.url).searchParams.get('key') || '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(key)) return new Response('Not found', {status: 404});
      const data = await getStore('product-images').get(key, {type: 'arrayBuffer', consistency: 'strong'});
      if (!data) return new Response('Not found', {status: 404});
      const types = {jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp'};
      const extension = key.split('.').pop() as keyof typeof types;
      return new Response(request.method === 'HEAD' ? null : data, {headers: {
        'Content-Type': types[extension],
        'Content-Length': String(data.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      }});
    }
    if (request.method !== 'POST') return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET, HEAD, POST'}});
    const authorization = request.headers.get('authorization');
    const publicKey = request.headers.get('apikey');
    if (!authorization?.startsWith('Bearer ') || !publicKey) return Response.json({error: 'Please sign in before uploading an image.'}, {status: 401});
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return Response.json({error: 'Upload not allowed.'}, {status: 403});
    const access = await fetch('https://oofrtvkdljiphcsydcjo.supabase.co/rest/v1/rpc/is_loom7_admin', {
      method: 'POST',
      headers: {Authorization: authorization, apikey: publicKey, 'Content-Type': 'application/json'},
      body: '{}',
    });
    if (!access.ok || await access.json() !== true) return Response.json({error: 'Only authorized admins can upload product images.'}, {status: 403});
    if (Number(request.headers.get('content-length')) > maxSize + 65536) return Response.json({error: 'Choose an image smaller than 3 MB.'}, {status: 413});
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File) || !file.size) return Response.json({error: 'Choose a product image to upload.'}, {status: 400});
    if (file.size > maxSize) return Response.json({error: 'Choose an image smaller than 3 MB.'}, {status: 413});
    const bytes = await file.arrayBuffer();
    const format = imageFormat(new Uint8Array(bytes));
    if (!format || format.type !== file.type) return Response.json({error: 'Choose a JPEG, PNG, or WebP image.'}, {status: 415});
    const key = crypto.randomUUID() + '.' + format.extension;
    await getStore('product-images').set(key, bytes);
    const imageUrl = new URL('/.netlify/functions/product-image', request.url);
    imageUrl.searchParams.set('key', key);
    return Response.json({url: imageUrl.href}, {status: 201, headers: {'Cache-Control': 'no-store'}});
  } catch {
    return Response.json({error: 'The image could not be uploaded or loaded. Please try again.'}, {status: 500});
  }
};
