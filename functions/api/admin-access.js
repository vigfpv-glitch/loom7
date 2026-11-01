const SUPABASE_URL = 'https://oofrtvkdljiphcsydcjo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_18ficoJXs66FopQnhcmkbA_kpDSF3yX';
const DEFAULT_INVITE_REDIRECT = 'https://loom7.pages.dev/admin.html?invite=1';
const OWNER_ADMIN_EMAIL = 'vigil.laflare56@gmail.com';
const MAX_BODY_BYTES = 2048;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function rejectCrossOrigin(request) {
  const origin = request.headers.get('origin');
  return origin && origin !== new URL(request.url).origin
    ? jsonResponse({error: 'This request is not allowed.'}, 403)
    : null;
}

function adminHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

async function verifyAdmin(request, env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Admin access API is missing its Supabase service key.');
    return {response: jsonResponse({error: 'Admin access management is not configured.'}, 503)};
  }
  const authorization = request.headers.get('authorization') || '';
  const token = /^Bearer ([^\s]+)$/.exec(authorization)?.[1];
  if (!token || token.length > 4096) {
    return {response: jsonResponse({error: 'Sign in with an admin account to continue.'}, 401)};
  }

  let userResponse;
  try {
    userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}`},
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error('Could not verify an admin access request.', error);
    return {response: jsonResponse({error: 'Admin access could not be verified. Try again shortly.'}, 502)};
  }
  if (!userResponse.ok) return {response: jsonResponse({error: 'Your admin session has expired. Sign in again.'}, 401)};

  let user;
  try {
    user = await userResponse.json();
  } catch (error) {
    console.error('Supabase returned an unreadable user response.');
    return {response: jsonResponse({error: 'Admin access could not be verified.'}, 502)};
  }
  if (!user || typeof user.id !== 'string' || !UUID_PATTERN.test(user.id)) {
    return {response: jsonResponse({error: 'Admin access could not be verified.'}, 401)};
  }

  let membershipResponse;
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/admin_users`);
    url.search = new URLSearchParams({select: 'user_id', user_id: `eq.${user.id}`, limit: '1'});
    membershipResponse = await fetch(url, {
      headers: {...adminHeaders(env), accept: 'application/json'},
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error('Could not verify admin membership.', error);
    return {response: jsonResponse({error: 'Admin access could not be verified. Try again shortly.'}, 502)};
  }
  if (!membershipResponse.ok) {
    console.error(`Admin membership check failed (${membershipResponse.status}).`);
    return {response: jsonResponse({error: 'Admin access could not be verified. Try again shortly.'}, 502)};
  }
  let memberships;
  try {
    memberships = await membershipResponse.json();
  } catch {
    return {response: jsonResponse({error: 'Admin access could not be verified.'}, 502)};
  }
  if (!Array.isArray(memberships) || !memberships.length) {
    return {response: jsonResponse({error: 'This account is not authorized to manage admin access.'}, 403)};
  }
  return {user};
}

async function listMemberships(env) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/admin_users`);
  url.search = new URLSearchParams({select: 'user_id,created_at', order: 'created_at.asc'});
  const response = await fetch(url, {
    headers: {...adminHeaders(env), accept: 'application/json'},
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Could not load admin memberships (${response.status}).`);
  const memberships = await response.json();
  if (!Array.isArray(memberships)) throw new Error('Admin membership response was not a list.');
  return memberships;
}

async function listAuthUsers(env) {
  const users = [];
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(`${SUPABASE_URL}/auth/v1/admin/users`);
    url.search = new URLSearchParams({page: String(page), per_page: '1000'});
    const response = await fetch(url, {
      headers: {...adminHeaders(env), accept: 'application/json'},
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Could not load auth users (${response.status}).`);
    const result = await response.json();
    if (!result || !Array.isArray(result.users)) throw new Error('Auth user response was not a list.');
    users.push(...result.users);
    if (result.users.length < 1000) return users;
  }
  throw new Error('Auth user list exceeded the supported page limit.');
}

async function readBody(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return {response: jsonResponse({error: 'Request is too large.'}, 413)};
  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return {response: jsonResponse({error: 'Request is too large.'}, 413)};
    }
    body = JSON.parse(raw);
  } catch {
    return {response: jsonResponse({error: 'Request body must be valid JSON.'}, 400)};
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {response: jsonResponse({error: 'Request body must be a JSON object.'}, 400)};
  }
  return {body};
}

async function requestAccess(request, env) {
  const originError = rejectCrossOrigin(request);
  if (originError) return {response: originError};
  const auth = await verifyAdmin(request, env);
  if (auth.response) return auth;
  return auth;
}

export async function onRequestGet({request, env}) {
  const auth = await requestAccess(request, env);
  if (auth.response) return auth.response;
  try {
    const [memberships, users] = await Promise.all([listMemberships(env), listAuthUsers(env)]);
    const usersById = new Map(users.map(user => [user.id, user]));
    const isMainAdmin = String(auth.user.email || '').toLowerCase() === OWNER_ADMIN_EMAIL;
    return jsonResponse({
      can_invite_admins: isMainAdmin,
      can_remove_admins: isMainAdmin,
      admins: memberships.map(member => {
        const account = usersById.get(member.user_id);
        return {
          user_id: member.user_id,
          email: typeof account?.email === 'string' ? account.email : 'Email unavailable',
          created_at: member.created_at,
          is_current_user: member.user_id === auth.user.id,
        };
      }),
    });
  } catch (error) {
    console.error('Could not load admin access list.', error);
    return jsonResponse({error: 'Could not load admin accounts. Try again shortly.'}, 502);
  }
}

export async function onRequestPost({request, env}) {
  const auth = await requestAccess(request, env);
  if (auth.response) return auth.response;
  if (String(auth.user.email || '').toLowerCase() !== OWNER_ADMIN_EMAIL) {
    return jsonResponse({error: 'Only the main admin can invite admin accounts.'}, 403);
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return jsonResponse({error: 'Content-Type must be application/json.'}, 415);
  }
  const parsed = await readBody(request);
  if (parsed.response) return parsed.response;
  const email = typeof parsed.body.email === 'string' ? parsed.body.email.trim().toLowerCase() : '';
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({error: 'Enter a valid email address.'}, 400);
  }

  try {
    const memberships = await listMemberships(env);
    const users = await listAuthUsers(env);
    const existing = users.find(user => typeof user.email === 'string' && user.email.toLowerCase() === email);
    if (existing && memberships.some(member => member.user_id === existing.id)) {
      return jsonResponse({error: 'That email already has admin access.'}, 409);
    }
    if (email === String(auth.user.email || '').toLowerCase()) {
      return jsonResponse({error: 'Your account already has admin access.'}, 409);
    }
    if (existing) {
      return jsonResponse({error: 'That email already has a Loom7 account. Ask them to use a different email address.'}, 409);
    }

    const redirectTo = env.ADMIN_INVITE_REDIRECT_URL || DEFAULT_INVITE_REDIRECT;
    let redirectUrl;
    try {
      redirectUrl = new URL(redirectTo);
    } catch {
      console.error('Admin invitation redirect URL is invalid.');
      return jsonResponse({error: 'Admin invitations are not configured correctly.'}, 503);
    }
    if (redirectUrl.protocol !== 'https:' || redirectUrl.username || redirectUrl.password) {
      console.error('Admin invitation redirect URL must use HTTPS and cannot include credentials.');
      return jsonResponse({error: 'Admin invitations are not configured correctly.'}, 503);
    }
    redirectUrl.searchParams.set('invite', '1');
    const inviteResponse = await fetch(`${SUPABASE_URL}/auth/v1/invite?redirect_to=${encodeURIComponent(redirectUrl.href)}`, {
      method: 'POST',
      headers: {...adminHeaders(env), 'content-type': 'application/json'},
      body: JSON.stringify({email}),
      signal: AbortSignal.timeout(12000),
    });
    if (!inviteResponse.ok) {
      console.error(`Supabase could not send an admin invitation (${inviteResponse.status}).`);
      return jsonResponse({error: 'Invitation could not be sent. Check the email address and Supabase Auth email settings.'}, 502);
    }
    const invitedUser = await inviteResponse.json();
    const invitedUserId = invitedUser?.id || invitedUser?.user?.id;
    if (typeof invitedUserId !== 'string' || !UUID_PATTERN.test(invitedUserId)) {
      console.error('Supabase invitation response did not contain a valid user ID.');
      return jsonResponse({error: 'The invitation was sent, but admin access could not be assigned. Contact the site owner.'}, 502);
    }

    const grantResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/grant_loom7_admin_access`, {
      method: 'POST',
      headers: {...adminHeaders(env), 'content-type': 'application/json'},
      body: JSON.stringify({target_user_id: invitedUserId, actor_user_id: auth.user.id}),
      signal: AbortSignal.timeout(8000),
    });
    if (!grantResponse.ok) {
      console.error(`Admin invitation was sent but membership could not be assigned (${grantResponse.status}).`);
      return jsonResponse({error: 'The invitation email was sent, but admin access could not be assigned. Contact the site owner before sending another invitation.'}, 502);
    }
    return jsonResponse({email, message: 'Invitation sent. Admin access begins when the recipient accepts and sets a password.'}, 201);
  } catch (error) {
    console.error('Could not create an admin invitation.', error);
    return jsonResponse({error: 'Could not create the invitation. Try again shortly.'}, 502);
  }
}

export async function onRequestDelete({request, env}) {
  const auth = await requestAccess(request, env);
  if (auth.response) return auth.response;
  if (String(auth.user.email || '').toLowerCase() !== OWNER_ADMIN_EMAIL) {
    return jsonResponse({error: 'Only the main admin can remove admin access.'}, 403);
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return jsonResponse({error: 'Content-Type must be application/json.'}, 415);
  }
  const parsed = await readBody(request);
  if (parsed.response) return parsed.response;
  const userId = parsed.body.user_id;
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
    return jsonResponse({error: 'Choose a valid admin account.'}, 400);
  }
  if (userId === auth.user.id) {
    return jsonResponse({error: 'You cannot remove your own admin access.'}, 400);
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/revoke_loom7_admin_access`, {
      method: 'POST',
      headers: {...adminHeaders(env), 'content-type': 'application/json'},
      body: JSON.stringify({target_user_id: userId, actor_user_id: auth.user.id}),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 400 && /last admin|not an admin|not authorized/i.test(errorText)) {
        return jsonResponse({error: 'That access change is not allowed. Keep at least one other admin account.'}, 409);
      }
      if (response.status === 404) return jsonResponse({error: 'That account no longer has admin access.'}, 404);
      console.error(`Could not revoke admin membership (${response.status}).`);
      return jsonResponse({error: 'Could not remove admin access. Try again shortly.'}, 502);
    }
    return jsonResponse({message: 'Admin access removed.'});
  } catch (error) {
    console.error('Could not revoke admin membership.', error);
    return jsonResponse({error: 'Could not remove admin access. Try again shortly.'}, 502);
  }
}
