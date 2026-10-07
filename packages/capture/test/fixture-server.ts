import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import sharp from "sharp";

/**
 * Local fixture site for capture/crawl tests: a tall landing page with lazy images, a sticky
 * header, a cookie banner (known vendor id + a heuristic one) and a chat launcher, plus a set
 * of marketing pages, redirects and junk links.
 */
export interface FixtureSite {
  url: string;
  origin: string;
  requests: string[];
  close: () => Promise<void>;
}

const layout = (title: string, body: string, head = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<meta name="description" content="Fixture page ${title}">
<meta property="og:site_name" content="Fixture">
<meta property="og:image" content="/og.png">
<meta name="theme-color" content="#112233">
<link rel="icon" href="/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${head}
<style>
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; }
  header { position: sticky; top: 0; height: 64px; background: #111; color: #fff; display: flex; gap: 16px; align-items: center; padding: 0 24px; z-index: 5; }
  header a { color: #fff; }
  section { height: 900px; padding: 40px; box-sizing: border-box; border-bottom: 1px solid #ddd; }
  img { display: block; width: 400px; height: 200px; }
</style></head><body>${body}</body></html>`;

const nav = `<header>
  <a href="/">Home</a><a href="/pricing">Pricing</a><a href="/login">Log in</a><a href="/signup?utm_source=x">Sign up</a>
  <a href="/blog">Blog</a><a href="/about#team">About</a><a href="/docs">Docs</a>
</header>`;

const landing = layout(
  "Fixture – Home",
  `${nav}
  <h1>Fixture landing</h1>
  <section id="hero"><h2>Hero section</h2><p>Above the fold text</p></section>
  <section><h2>Second</h2><img id="native-lazy" loading="lazy" src="/img/native.png" alt=""></section>
  <section><h2>Third</h2><img id="io-lazy" data-src="/img/observer.png" alt=""></section>
  <section><h2>Fourth</h2><p>Bottom text far below the fold</p>
    <a href="/blog/post-1">Post</a> <a href="/privacy">Privacy</a> <a href="/files/report.pdf">PDF</a>
    <a href="mailto:hi@example.com">Mail</a> <a href="tel:+100">Call</a> <a href="https://elsewhere.example/">Out</a>
    <a href="/auth/callback?code=1">cb</a> <a href="/de/pricing">DE</a> <a href="/redirect-out">ext redirect</a>
    <a href="/customers">Customers</a> <a href="/careers">Careers</a> <a href="/changelog">Changelog</a>
  </section>
  <div id="cookie-banner" style="position:fixed;bottom:0;left:0;right:0;height:120px;background:#f00;z-index:50">We use cookies <button>Accept all</button></div>
  <div class="custom-consent" style="position:fixed;bottom:140px;left:20px;width:320px;height:160px;background:#0f0;z-index:60">This site uses cookies to improve your experience. <button>OK</button></div>
  <div class="dim" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:40"></div>
  <div id="intercom-container" style="position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:30px;background:#00f;z-index:70"></div>
  <button id="support-launcher" style="position:fixed;right:24px;bottom:24px;width:44px;height:44px;border-radius:22px;background:#f0f;z-index:80">?</button>
  <div id="vendor-shadow-host"></div>
  <script>
    const shadow = document.getElementById('vendor-shadow-host').attachShadow({ mode: 'open' });
    shadow.innerHTML = '<div id="inner" style="position:fixed;top:200px;left:200px;width:500px;height:200px;background:#ff0;z-index:90">Cookie Preferences: we use tracking technologies <button>Agree</button></div>';
    new IntersectionObserver((entries, observer) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.src = entry.target.dataset.src; observer.unobserve(entry.target);
      }
    }).observe(document.getElementById('io-lazy'));
    document.documentElement.style.overflow = 'hidden';
  </script>`,
);

const simple = (title: string, extra = "") =>
  layout(title, `${nav}<main><h1>${title}</h1>${extra}</main>`);

export async function startFixtureSite(): Promise<FixtureSite> {
  const tile = await sharp({
    create: { width: 400, height: 200, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
  const icon = (size: number) =>
    sharp({ create: { width: size, height: size, channels: 4, background: "#ff6600" } })
      .png()
      .toBuffer();
  const [icon32, icon180] = await Promise.all([icon(32), icon(180)]);
  const requests: string[] = [];

  let origin = "";
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture");
    requests.push(url.pathname);
    const html = (body: string, status = 200) => {
      response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      response.end(body);
    };
    const png = (bytes: Buffer, delay = 0) =>
      setTimeout(() => {
        response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
        response.end(bytes);
      }, delay);
    switch (url.pathname) {
      case "/":
        return html(landing);
      case "/pricing":
        return html(simple("Pricing – Fixture", "<p>$10/mo</p>"));
      case "/login":
        return html(simple("Log in – Fixture", "<form><input placeholder=email></form>"));
      case "/signup":
        return html(simple("Sign up – Fixture"));
      case "/blog":
        return html(simple("Blog – Fixture", '<a href="/blog/post-2">Post 2</a>'));
      case "/blog/post-1":
      case "/blog/post-2":
        return html(simple("A post – Fixture"));
      case "/about":
        return html(simple("About – Fixture"));
      case "/customers":
        return html(simple("Customers – Fixture"));
      case "/careers":
        return html(simple("Careers – Fixture"));
      case "/changelog":
        return html(simple("Changelog – Fixture"));
      case "/privacy":
        return html(simple("Privacy – Fixture"));
      case "/de/pricing":
        return html(simple("Preise – Fixture"));
      case "/docs":
        response.writeHead(302, { location: "/docs/intro" });
        return response.end();
      case "/docs/intro":
        return html(simple("Docs – Fixture"));
      case "/redirect-out":
        response.writeHead(302, { location: "https://elsewhere.example/" });
        return response.end();
      case "/robots.txt":
        response.writeHead(200, { "content-type": "text/plain" });
        return response.end("User-agent: *\nDisallow: /careers\n");
      case "/img/native.png":
        return png(tile, 150);
      case "/img/observer.png":
        return png(tile, 300);
      case "/og.png":
        return png(tile);
      case "/favicon-32.png":
        return png(icon32);
      case "/apple-touch-icon.png":
        return png(icon180);
      case "/tall":
        return html(
          layout(
            "Tall",
            `<div style="height:30000px;background:linear-gradient(#fff,#000)"></div>`,
          ),
        );
      default:
        return html(simple("Not found"), 404);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
  return {
    url: `${origin}/`,
    origin,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
