// Cloudflare Pages worker: keeps the fishing app on its own address and shows an
// "under construction" page on pksport.co.za until the real PK Sport site exists.
//
// - pk-fishing.pages.dev                         -> redirects to pksport.co.za/fishing
// - other addresses (per-deployment previews)    -> the fishing app, unchanged
// - pksport.co.za/fishing                        -> the fishing app, served in place (address stays put)
// - pksport.co.za/golf                           -> the golf app, proxied from its own Cloudflare
//                                                    project (a separate GitHub repo, so it can't be
//                                                    served from this project's own assets like fishing is)
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

    // The app now lives at pksport.co.za/fishing. Only the main pages.dev address is redirected
    // (temporary, so it is easy to undo); per-deployment addresses like abc123.pk-fishing.pages.dev
    // keep serving the app for testing.
    if (url.hostname === 'pk-fishing.pages.dev') {
      return Response.redirect('https://pksport.co.za/fishing' + url.search, 302);
    }

    if (SPORT_HOSTS.has(url.hostname)) {
      // Old links and home-screen shortcuts from when the app lived at the site root
      // (/index.html, or the root with a query such as ?view=spectator) go to the app.
      if (url.pathname === '/index.html' || (url.pathname === '/' && url.search)) {
        return Response.redirect('https://' + url.hostname + '/fishing' + url.search, 302);
      }
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
      // Golf lives on its own Cloudflare project, so it's proxied here rather than served from
      // this project's own assets. The golf app is one self-contained file with no other local
      // files (icons, manifest, etc.), so unlike fishing this needs no <base> tag or rewriting.
      if (url.pathname === '/golf/') {
        url.pathname = '/golf';
        return Response.redirect(url.toString(), 301);
      }
      if (url.pathname === '/golf' || url.pathname.startsWith('/golf/')) {
        const upstream = new URL(request.url);
        upstream.hostname = 'pk-golf.pages.dev';
        upstream.pathname = url.pathname === '/golf' ? '/' : url.pathname.slice('/golf'.length);
        return fetch(upstream.toString());
      }

      return new Response(UNDER_CONSTRUCTION, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
