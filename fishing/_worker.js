// Cloudflare Pages worker: keeps the fishing app on its own address and shows an
// "under construction" page on pksport.co.za until the real PK Sport site exists.
//
// - pk-fishing.pages.dev (and any other address) -> the fishing app, unchanged
// - pksport.co.za/fishing                        -> redirects to the fishing app
// - pksport.co.za (anything else)                -> the under construction page

const SPORT_HOSTS = new Set(['pksport.co.za', 'www.pksport.co.za']);
const FISHING_APP = 'https://pk-fishing.pages.dev/';

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
  <p>Looking for fishing? <a href="${FISHING_APP}">Open PK Fishing</a></p>
</main>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (SPORT_HOSTS.has(url.hostname)) {
      if (url.pathname === '/fishing' || url.pathname.startsWith('/fishing/')) {
        return Response.redirect(FISHING_APP, 302);
      }
      return new Response(UNDER_CONSTRUCTION, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
