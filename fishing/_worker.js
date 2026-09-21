// Cloudflare Pages worker: keeps the fishing app on its own address and shows an
// "under construction" page on pksport.co.za until the real PK Sport site exists.
//
// - pk-fishing.pages.dev (and any other address) -> the fishing app, unchanged
// - pksport.co.za/fishing                        -> the fishing app, served in place (address stays put)
// - pksport.co.za (anything else)                -> the under construction page

const SPORT_HOSTS = new Set(['pksport.co.za', 'www.pksport.co.za']);

const UNDER_CONSTRUCTION = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>PK Sport - Under Construction</title>
<style>
  :root{--bg:#fafafa;--ink:#1b1b1b;--muted:#6b6b6b;--accent:#b3121f;}
  @media (prefers-color-scheme: dark){:root{--bg:#141414;--ink:#f2f2f2;--muted:#9a9a9a;}}
  *{box-sizing:border-box;}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    text-align:center;padding:24px;}
  main{max-width:460px;}
  .badge{display:inline-block;padding:4px 12px;border-radius:999px;background:var(--accent);color:#fff;
    font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}
  h1{font-size:2.2rem;margin:18px 0 8px;}
  p{color:var(--muted);line-height:1.5;margin:0 0 20px;}
  a{color:var(--accent);font-weight:600;}
</style>
</head>
<body>
<main>
  <span class="badge">Under construction</span>
  <h1>PK Sport</h1>
  <p>We're building something new. Check back soon.</p>
  <p>Looking for fishing? <a href="/fishing">Open PK Fishing</a></p>
</main>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (SPORT_HOSTS.has(url.hostname)) {
      // The app lives at exactly /fishing (no trailing slash), so sign-in return addresses match
      // what Supabase already allows. /fishing/ is sent to /fishing.
      if (url.pathname === '/fishing/') {
        url.pathname = '/fishing';
        return Response.redirect(url.toString(), 301);
      }
      // A <base> tag makes the app's relative file paths (icons, manifest, badges) resolve
      // inside /fishing/ even though the page address has no trailing slash.
      if (url.pathname === '/fishing') {
        const assetUrl = new URL(url);
        assetUrl.pathname = '/';
        const res = await env.ASSETS.fetch(new Request(assetUrl, request));
        return new HTMLRewriter()
          .on('head', { element(el) { el.prepend('<base href="/fishing/">', { html: true }); } })
          .transform(res);
      }
      // Home-screen shortcuts: give the phone the exact address to open (no redirects), and keep
      // the app scoped to /fishing. Only done here, so pk-fishing.pages.dev keeps its own manifest.
      if (url.pathname === '/fishing/manifest.json' || url.pathname === '/fishing/manifest-spectator.json') {
        const manifestUrl = new URL(url);
        manifestUrl.pathname = url.pathname.slice('/fishing'.length);
        const res = await env.ASSETS.fetch(new Request(manifestUrl, request));
        if (!res.ok) return res;
        const manifest = await res.json();
        const query = String(manifest.start_url || '').split('?')[1];
        manifest.start_url = '/fishing' + (query ? '?' + query : '');
        manifest.scope = '/fishing';
        manifest.id = manifest.start_url;
        return new Response(JSON.stringify(manifest, null, 2), {
          headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' },
        });
      }
      // Serve the app in place: strip the /fishing prefix and fetch the file from the app's assets
      if (url.pathname.startsWith('/fishing/')) {
        const assetUrl = new URL(url);
        assetUrl.pathname = url.pathname.slice('/fishing'.length);
        const res = await env.ASSETS.fetch(new Request(assetUrl, request));
        // Keep any redirect the assets layer issues (e.g. /index.html -> /) inside /fishing
        const loc = res.headers.get('Location');
        if (res.status >= 300 && res.status < 400 && loc && loc.startsWith('/')) {
          const headers = new Headers(res.headers);
          headers.set('Location', '/fishing' + loc);
          return new Response(null, { status: res.status, headers });
        }
        return res;
      }
      return new Response(UNDER_CONSTRUCTION, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
