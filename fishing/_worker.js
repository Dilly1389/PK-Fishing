// Cloudflare Pages worker: keeps the fishing app on its own address and serves the PK Sport
// marketing website (its own Cloudflare project and GitHub repo) on the rest of pksport.co.za.
//
// - pk-fishing.pages.dev                         -> redirects to pksport.co.za/fishing
// - other addresses (per-deployment previews)    -> the fishing app, unchanged
// - pksport.co.za/fishing                        -> the fishing app, served in place (address stays put)
// - pksport.co.za/golf                           -> the golf app, proxied from its own Cloudflare
//                                                    project (a separate GitHub repo, so it can't be
//                                                    served from this project's own assets like fishing is)
// - pksport.co.za (anything else)                -> the PK Sport website, proxied from pk-sport.pages.dev

const SPORT_HOSTS = new Set(['pksport.co.za', 'www.pksport.co.za']);

const SITE_HOST = 'pk-sport.pages.dev';

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
        // sw.js registers with scope "/fishing" (no trailing slash, matching the
        // page's own address above) to actually control this page - by default
        // a script can only be granted a scope at or under its own directory
        // ("/fishing/"), so without this header the registration throws a
        // SecurityError and push notifications silently never work. Verified
        // by reproducing the exact failure locally before adding this.
        //
        // Also forces no-cache: the asset layer's default Cache-Control (a
        // multi-hour max-age, fine for most static files) is a well-known
        // trap for a service worker specifically - a browser or this CDN
        // holding onto a stale sw.js means a future fix here would silently
        // fail to reach anyone for hours, exactly what just happened with
        // the header above shipping correctly in the Worker but Cloudflare
        // still serving an already-cached pre-fix response underneath it.
        if (url.pathname === '/fishing/sw.js' && res.ok) {
          const headers = new Headers(res.headers);
          headers.set('Service-Worker-Allowed', '/fishing');
          headers.set('Cache-Control', 'no-cache');
          return new Response(res.body, { status: res.status, headers });
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

      // Everything else is the marketing website. Redirects (e.g. /faq -> /faq/) and its own 404
      // page are passed straight through to the visitor.
      const site = new URL(url.pathname + url.search, 'https://' + SITE_HOST);
      // (always https on the normal port, whatever address the request arrived on)
      return fetch(site.toString(), { redirect: 'manual' });
    }

    return env.ASSETS.fetch(request);
  },
};
