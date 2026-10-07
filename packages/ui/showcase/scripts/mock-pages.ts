/**
 * Synthetic UI mock pages for the showcase. Every brand, copy line and layout here is invented —
 * these render into placeholder "screenshots" so the showcase looks like a real library without
 * shipping anyone else's product imagery.
 */

export interface Brand {
  slug: string;
  name: string;
  tagline: string;
  accent: string;
  /** Text colour on the accent. */
  onAccent: string;
  dark?: boolean;
  serif?: boolean;
  logo: string; // inner SVG markup on a 24x24 grid
}

export interface MockPage {
  file: string;
  brand: string;
  kind: "web" | "mobile";
  /** CSS viewport size. */
  width: number;
  height: number;
  /** Render scale (web pages are captured at 0.5 to keep files small). */
  scale: number;
  fullPage?: boolean;
  html: string;
}

export const brands: Record<string, Brand> = {
  northwind: {
    slug: "northwind",
    name: "Northwind",
    tagline: "Product analytics for teams that ship",
    accent: "#4f46e5",
    onAccent: "#ffffff",
    logo: '<path d="M4 18V6l8 9V6M14 18l3-12 3 12" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  lumen: {
    slug: "lumen",
    name: "Lumen",
    tagline: "The calm writing workspace",
    accent: "#0f766e",
    onAccent: "#ffffff",
    serif: true,
    logo: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
  },
  relay: {
    slug: "relay",
    name: "Relay",
    tagline: "Ship releases with confidence",
    accent: "#3ddc84",
    onAccent: "#04130a",
    dark: true,
    logo: '<path d="M5 17l5-5-5-5M12 17h7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  atlas: {
    slug: "atlas",
    name: "Atlas Pay",
    tagline: "Payments infrastructure for the internet",
    accent: "#1d4ed8",
    onAccent: "#ffffff",
    logo: '<path d="M12 4l7 16H5z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>',
  },
  tally: {
    slug: "tally",
    name: "Tally",
    tagline: "Budgeting that finally adds up",
    accent: "#059669",
    onAccent: "#ffffff",
    logo: '<path d="M6 6h12M12 6v12" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>',
  },
  wander: {
    slug: "wander",
    name: "Wander",
    tagline: "Plan trips together",
    accent: "#e11d48",
    onAccent: "#ffffff",
    logo: '<path d="M12 21s-6-6.2-6-11a6 6 0 1112 0c0 4.8-6 11-6 11z" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="10" r="2" fill="currentColor"/>',
  },
  pulse: {
    slug: "pulse",
    name: "Pulse",
    tagline: "Training plans that adapt to you",
    accent: "#f59e0b",
    onAccent: "#1a1203",
    dark: true,
    logo: '<path d="M3 12h4l2-5 4 10 2-5h6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  },
};

export function logoSvg(brand: Brand, size = 24): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" style="color:${brand.onAccent}">${brand.logo}</svg>`;
}

/** App icon (rounded square, accent fill) as a standalone SVG file. */
export function appIconSvg(brand: Brand): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="${brand.accent}"/><g transform="translate(24 24) scale(2)" style="color:${brand.onAccent}" color="${brand.onAccent}">${brand.logo.replaceAll("currentColor", brand.onAccent)}</g></svg>`;
}

function base(brand: Brand, body: string, extraCss = ""): string {
  const bg = brand.dark ? "#0b0d0c" : "#ffffff";
  const fg = brand.dark ? "#eef2ef" : "#111214";
  const muted = brand.dark ? "#8b948f" : "#6b6f76";
  const line = brand.dark ? "#1d2220" : "#ececef";
  const soft = brand.dark ? "#121614" : "#f6f6f7";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url("INTER_URL") format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
:root{--a:${brand.accent};--on:${brand.onAccent};--bg:${bg};--fg:${fg};--mu:${muted};--ln:${line};--soft:${soft}}
html,body{background:var(--bg);color:var(--fg);font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.serif{font-family:"Noto Serif",Georgia,serif;font-weight:500;letter-spacing:-.02em}
.row{display:flex;align-items:center}.col{display:flex;flex-direction:column}
.btn{display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 18px;border-radius:10px;font-weight:600;font-size:14px;background:var(--a);color:var(--on)}
.btn.ghost{background:transparent;color:var(--fg);border:1px solid var(--ln)}
.muted{color:var(--mu)}.card{border:1px solid var(--ln);border-radius:14px;background:var(--bg)}
.bar{height:8px;border-radius:99px;background:var(--ln)}
.logo{width:28px;height:28px;border-radius:8px;background:var(--a);display:grid;place-items:center}
${extraCss}
</style></head><body>${body}</body></html>`;
}

function webNav(brand: Brand, links: string[], cta = "Get started"): string {
  return `<header class="row" style="height:72px;padding:0 64px;border-bottom:1px solid var(--ln);gap:40px">
  <div class="row" style="gap:10px;font-weight:700;font-size:18px"><span class="logo">${logoSvg(brand, 18)}</span><span class="${brand.serif ? "serif" : ""}">${brand.name}</span></div>
  <nav class="row" style="gap:28px;font-size:14px;flex:1" >${links.map((l) => `<span class="muted">${l}</span>`).join("")}</nav>
  <span style="font-size:14px;font-weight:500">Sign in</span><span class="btn" style="height:36px">${cta}</span></header>`;
}

function chart(color: string, w = 520, h = 160, seed = 1): string {
  const pts: string[] = [];
  let y = h * 0.6;
  for (let i = 0; i <= 24; i += 1) {
    y = Math.max(16, Math.min(h - 10, y + Math.sin(i * 1.7 + seed) * 18 - 4 + ((i * seed) % 5)));
    pts.push(`${(i / 24) * w},${y.toFixed(1)}`);
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/><polygon points="0,${h} ${pts.join(" ")} ${w},${h}" fill="${color}" opacity=".08"/></svg>`;
}

function bars(color: string, n = 12, h = 120): string {
  return `<div class="row" style="align-items:flex-end;gap:10px;height:${h}px">${Array.from({ length: n }, (_, i) => `<div style="flex:1;border-radius:6px 6px 2px 2px;background:${i === n - 3 ? color : "var(--ln)"};height:${30 + ((i * 37) % 70)}%"></div>`).join("")}</div>`;
}

function avatarRow(n = 5): string {
  const colors = ["#f2c6a0", "#a7c7e7", "#c9b6e4", "#b8e0c2", "#f4b6b6", "#e8d9a8"];
  return `<div class="row">${Array.from({ length: n }, (_, i) => `<span style="width:30px;height:30px;border-radius:99px;border:2px solid var(--bg);margin-left:${i ? -8 : 0}px;background:${colors[i % colors.length]}"></span>`).join("")}</div>`;
}

const logos = ["Acme", "Globex", "Initech", "Umbra", "Hooli", "Vandelay"];

// ---------------------------------------------------------------------------------------------
// Web templates
// ---------------------------------------------------------------------------------------------

function landing(brand: Brand, opts: { headline: string; sub: string; links: string[]; product: string }): string {
  const h = brand.serif ? "serif" : "";
  return base(
    brand,
    `${webNav(brand, opts.links)}
<section class="col" style="align-items:center;text-align:center;padding:96px 64px 56px;gap:22px">
  <span style="font-size:13px;font-weight:600;padding:6px 12px;border-radius:99px;background:var(--soft);border:1px solid var(--ln)">New · ${brand.name} 3.0 is here →</span>
  <h1 class="${h}" style="font-size:68px;line-height:1.02;letter-spacing:-.045em;font-weight:${brand.serif ? 500 : 700};max-width:900px">${opts.headline}</h1>
  <p class="muted" style="font-size:20px;line-height:1.5;max-width:640px">${opts.sub}</p>
  <div class="row" style="gap:12px;margin-top:8px"><span class="btn" style="height:46px;padding:0 24px">Start for free</span><span class="btn ghost" style="height:46px;padding:0 24px">Book a demo</span></div>
</section>
<section style="padding:0 120px">${opts.product}</section>
<section class="col" style="align-items:center;gap:26px;padding:72px 64px">
  <span class="muted" style="font-size:13px;font-weight:500">Trusted by teams at</span>
  <div class="row" style="gap:64px;font-weight:700;font-size:22px;color:var(--mu);opacity:.8">${logos.map((l) => `<span>${l}</span>`).join("")}</div>
</section>
<section style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:24px 120px 96px">
  ${["Fast by default", "Built for teams", "Private by design"].map((t, i) => `<div class="card" style="padding:28px;background:var(--soft);border:0"><div class="logo" style="margin-bottom:22px;opacity:${1 - i * 0.2}">${logoSvg(brand, 16)}</div><h3 style="font-size:19px;margin-bottom:8px;letter-spacing:-.02em">${t}</h3><p class="muted" style="font-size:15px;line-height:1.55">Everything you need to move quickly, with sensible defaults and no configuration to maintain.</p><div class="bar" style="margin-top:22px;width:${60 + i * 12}%"></div></div>`).join("")}
</section>
<section class="col" style="align-items:center;text-align:center;gap:18px;padding:88px 64px;margin:0 120px 96px;border-radius:24px;background:var(--a);color:var(--on)">
  <h2 class="${h}" style="font-size:44px;letter-spacing:-.04em">Start building with ${brand.name}</h2>
  <p style="font-size:18px;opacity:.8">Free for small teams. No credit card required.</p>
  <span class="btn" style="background:var(--on);color:var(--a);height:46px;padding:0 26px">Get started</span>
</section>
<footer style="display:grid;grid-template-columns:2fr repeat(4,1fr);gap:24px;padding:56px 120px 72px;border-top:1px solid var(--ln);font-size:14px">
  <div class="row" style="gap:10px;font-weight:700;align-items:flex-start"><span class="logo">${logoSvg(brand, 18)}</span>${brand.name}</div>
  ${["Product", "Company", "Resources", "Legal"].map((c) => `<div class="col" style="gap:12px"><b>${c}</b>${[1, 2, 3, 4].map((k) => `<span class="bar" style="width:${50 + ((k * 17 + c.length * 7) % 40)}%"></span>`).join("")}</div>`).join("")}
</footer>`,
  );
}

function dashboardProduct(brand: Brand): string {
  return `<div class="card" style="overflow:hidden;box-shadow:0 30px 80px -30px rgba(20,20,40,.35)">
  <div class="row" style="height:44px;padding:0 16px;gap:8px;border-bottom:1px solid var(--ln);background:var(--soft)">${["#ff5f57", "#febc2e", "#28c840"].map((c) => `<span style="width:11px;height:11px;border-radius:9px;background:${c}"></span>`).join("")}</div>
  <div style="display:grid;grid-template-columns:200px 1fr;height:420px">
    <div class="col" style="gap:14px;padding:20px;border-right:1px solid var(--ln)">${[70, 55, 80, 50, 65, 45].map((w, i) => `<div class="row" style="gap:10px"><span style="width:16px;height:16px;border-radius:5px;background:${i === 1 ? "var(--a)" : "var(--ln)"}"></span><span class="bar" style="width:${w}%"></span></div>`).join("")}</div>
    <div class="col" style="padding:24px;gap:18px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">${["12,480", "3.2%", "48m"].map((v) => `<div class="card" style="padding:16px"><div class="bar" style="width:40%;margin-bottom:12px"></div><div style="font-size:24px;font-weight:700;letter-spacing:-.02em">${v}</div></div>`).join("")}</div>
      <div class="card" style="padding:18px;flex:1">${chart(brand.accent, 760, 190, 2)}</div>
    </div>
  </div></div>`;
}

function pricing(brand: Brand, links: string[]): string {
  const tiers = [
    ["Starter", "$0", "For individuals getting started"],
    ["Team", "$24", "For growing teams that need more"],
    ["Enterprise", "Custom", "Security, support and scale"],
  ];
  return base(
    brand,
    `${webNav(brand, links)}
<section class="col" style="align-items:center;text-align:center;gap:16px;padding:80px 64px 48px">
  <h1 class="${brand.serif ? "serif" : ""}" style="font-size:52px;letter-spacing:-.04em">Simple, transparent pricing</h1>
  <p class="muted" style="font-size:18px">Start free. Upgrade when your team grows.</p>
  <div class="row" style="margin-top:12px;padding:4px;border-radius:99px;background:var(--soft);font-size:14px;font-weight:600"><span style="padding:8px 18px;border-radius:99px;background:var(--bg);box-shadow:0 1px 3px rgba(0,0,0,.1)">Monthly</span><span class="muted" style="padding:8px 18px">Yearly · save 20%</span></div>
</section>
<section style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:0 140px">
  ${tiers.map(([n = "", p = "", d = ""], i) => `<div class="card col" style="padding:30px;gap:18px;${i === 1 ? "border:2px solid var(--a);box-shadow:0 20px 50px -24px rgba(0,0,0,.25)" : ""}"><div class="row" style="justify-content:space-between"><b style="font-size:18px">${n}</b>${i === 1 ? '<span style="font-size:12px;font-weight:600;padding:4px 10px;border-radius:99px;background:var(--a);color:var(--on)">Popular</span>' : ""}</div><div><span style="font-size:44px;font-weight:700;letter-spacing:-.03em">${p}</span>${p.startsWith("$") ? '<span class="muted"> /user/mo</span>' : ""}</div><p class="muted" style="font-size:15px">${d}</p><span class="btn ${i === 1 ? "" : "ghost"}" style="width:100%">${i === 2 ? "Contact sales" : "Get started"}</span><div class="col" style="gap:12px;margin-top:6px">${[1, 2, 3, 4, 5].map((k) => `<div class="row" style="gap:10px;font-size:14px"><span style="color:var(--a);font-weight:700">✓</span><span class="bar" style="width:${45 + ((k * 13 + i * 7) % 40)}%"></span></div>`).join("")}</div></div>`).join("")}
</section>
<section class="col" style="gap:0;padding:72px 220px 96px">
  <h2 style="font-size:28px;letter-spacing:-.03em;margin-bottom:24px">Frequently asked questions</h2>
  ${["Can I change plans later?", "Do you offer discounts for nonprofits?", "What payment methods do you accept?", "Is there a free trial?"].map((q) => `<div class="row" style="justify-content:space-between;padding:20px 0;border-top:1px solid var(--ln);font-size:16px;font-weight:500">${q}<span class="muted">+</span></div>`).join("")}
</section>`,
  );
}

function login(brand: Brand): string {
  return base(
    brand,
    `<div style="display:grid;grid-template-columns:1fr 1fr;height:900px">
  <div class="col" style="justify-content:center;padding:0 140px;gap:22px">
    <div class="row" style="gap:10px;font-weight:700;font-size:18px;margin-bottom:28px"><span class="logo">${logoSvg(brand, 18)}</span>${brand.name}</div>
    <h1 style="font-size:34px;letter-spacing:-.035em">Welcome back</h1>
    <p class="muted" style="font-size:16px;margin-top:-10px">Sign in to your workspace</p>
    <span class="btn ghost" style="height:46px;font-weight:500">Continue with Google</span>
    <div class="row muted" style="gap:12px;font-size:13px"><span class="bar" style="flex:1;height:1px"></span>or<span class="bar" style="flex:1;height:1px"></span></div>
    <div class="col" style="gap:8px"><span style="font-size:14px;font-weight:500">Email</span><div class="card" style="height:46px;padding:0 14px;display:flex;align-items:center;font-size:15px" class="muted">you@company.com</div></div>
    <div class="col" style="gap:8px"><span style="font-size:14px;font-weight:500">Password</span><div class="card" style="height:46px;padding:0 14px;display:flex;align-items:center;font-size:20px;letter-spacing:4px">••••••••</div></div>
    <span class="btn" style="height:46px">Sign in</span>
    <p class="muted" style="font-size:14px;text-align:center">Don’t have an account? <b style="color:var(--fg)">Sign up</b></p>
  </div>
  <div style="background:var(--a);display:flex;align-items:center;justify-content:center;padding:80px">
    <div class="card" style="width:100%;padding:28px;background:rgba(255,255,255,.96);border:0;box-shadow:0 30px 80px -20px rgba(0,0,0,.4)">${chart(brand.accent, 520, 220, 4)}<div class="row" style="gap:12px;margin-top:20px">${avatarRow(4)}<span style="font-size:14px;color:#555">Joined by 12,000+ teams</span></div></div>
  </div></div>`,
  );
}

function appShell(brand: Brand, title: string, main: string, active = 1): string {
  const items = ["Home", "Dashboards", "Reports", "Users", "Events", "Settings"];
  return base(
    brand,
    `<div style="display:grid;grid-template-columns:248px 1fr;height:900px">
  <aside class="col" style="padding:18px 14px;gap:4px;border-right:1px solid var(--ln);background:var(--soft)">
    <div class="row" style="gap:10px;font-weight:700;padding:6px 10px 18px"><span class="logo">${logoSvg(brand, 16)}</span>${brand.name}</div>
    ${items.map((it, i) => `<div class="row" style="gap:10px;height:36px;padding:0 10px;border-radius:8px;font-size:14px;${i === active ? "background:var(--bg);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.06)" : "color:var(--mu)"}"><span style="width:16px;height:16px;border-radius:5px;background:${i === active ? "var(--a)" : "var(--ln)"}"></span>${it}</div>`).join("")}
    <div style="margin-top:auto" class="row"><span style="width:32px;height:32px;border-radius:99px;background:#f2c6a0"></span><span class="col" style="margin-left:10px;gap:4px"><span class="bar" style="width:90px"></span><span class="bar" style="width:60px;height:6px"></span></span></div>
  </aside>
  <main class="col" style="padding:28px 36px;gap:24px;overflow:hidden">
    <div class="row" style="justify-content:space-between"><h1 style="font-size:24px;letter-spacing:-.025em">${title}</h1><div class="row" style="gap:10px"><span class="btn ghost" style="height:36px">Last 30 days</span><span class="btn" style="height:36px">Share</span></div></div>
    ${main}
  </main></div>`,
  );
}

function dashboard(brand: Brand): string {
  return appShell(
    brand,
    "Overview",
    `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">${[["Active users", "24,812", "+12.4%"], ["Conversion", "3.81%", "+0.6%"], ["Avg. session", "6m 12s", "−2.1%"], ["Revenue", "$48.2k", "+8.9%"]].map(([l = "", v = "", d = ""]) => `<div class="card" style="padding:18px"><div class="muted" style="font-size:13px">${l}</div><div style="font-size:28px;font-weight:700;letter-spacing:-.03em;margin:8px 0 6px">${v}</div><div style="font-size:13px;font-weight:600;color:${d.startsWith("+") ? "#16a34a" : "#dc2626"}">${d}</div></div>`).join("")}</div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
      <div class="card" style="padding:20px"><div class="row" style="justify-content:space-between;margin-bottom:14px"><b>Weekly active users</b><span class="muted" style="font-size:13px">Jan – Jun</span></div>${chart(brand.accent, 700, 230, 3)}</div>
      <div class="card" style="padding:20px"><b>Signups by channel</b><div style="margin-top:20px">${bars(brand.accent, 9, 210)}</div></div>
    </div>
    <div class="card" style="padding:4px 20px">${["Onboarding completed", "Invite sent", "Project created", "Report exported", "Plan upgraded"].map((e, i) => `<div class="row" style="height:52px;gap:14px;border-bottom:${i < 4 ? "1px solid var(--ln)" : "0"};font-size:14px"><span style="width:8px;height:8px;border-radius:9px;background:${i % 2 ? "var(--ln)" : "var(--a)"}"></span><span style="flex:1">${e}</span><span class="muted">${(i + 1) * 312} events</span><span class="bar" style="width:120px"></span></div>`).join("")}</div>`,
  );
}

function settings(brand: Brand): string {
  return appShell(
    brand,
    "Settings",
    `<div class="row" style="gap:24px;border-bottom:1px solid var(--ln);font-size:14px;font-weight:500">${["General", "Members", "Billing", "Notifications", "API"].map((t, i) => `<span style="padding:0 0 12px;${i === 0 ? "border-bottom:2px solid var(--fg)" : "color:var(--mu)"}">${t}</span>`).join("")}</div>
    <div class="col" style="gap:0;max-width:760px">${["Workspace name", "Workspace URL", "Default timezone", "Language"].map((l, i) => `<div style="display:grid;grid-template-columns:240px 1fr;gap:24px;padding:22px 0;border-bottom:1px solid var(--ln)"><div class="col" style="gap:6px"><b style="font-size:14px">${l}</b><span class="muted" style="font-size:13px">Shown to everyone in the workspace</span></div><div class="card" style="height:42px;display:flex;align-items:center;padding:0 14px;font-size:14px">${["Northwind Labs", "northwind.app/labs", "Europe/Berlin (GMT+2)", "English"][i]}</div></div>`).join("")}
    <div class="row" style="justify-content:space-between;padding:22px 0"><div class="col" style="gap:6px"><b style="font-size:14px">Weekly digest</b><span class="muted" style="font-size:13px">Email a summary every Monday</span></div><span style="width:44px;height:26px;border-radius:99px;background:var(--a);position:relative"><span style="position:absolute;right:3px;top:3px;width:20px;height:20px;border-radius:99px;background:#fff"></span></span></div>
    <div class="row" style="gap:10px;justify-content:flex-end;margin-top:8px"><span class="btn ghost">Cancel</span><span class="btn">Save changes</span></div></div>`,
    5,
  );
}

function editor(brand: Brand): string {
  return base(
    brand,
    `<div style="display:grid;grid-template-columns:260px 1fr;height:900px">
  <aside class="col" style="padding:20px 16px;gap:6px;background:var(--soft);border-right:1px solid var(--ln)">
    <div class="row" style="gap:10px;font-weight:600;padding:4px 8px 18px"><span class="logo">${logoSvg(brand, 16)}</span><span class="serif" style="font-size:18px">${brand.name}</span></div>
    ${["Inbox", "Today", "Drafts", "Ideas", "Essays", "Archive"].map((t, i) => `<div class="row" style="height:34px;padding:0 10px;border-radius:8px;font-size:14px;${i === 4 ? "background:var(--bg);font-weight:600" : "color:var(--mu)"}">${t}<span class="muted" style="margin-left:auto;font-size:12px">${[3, 1, 8, 14, 6, 120][i]}</span></div>`).join("")}
  </aside>
  <main style="padding:72px 0;overflow:hidden"><article style="max-width:680px;margin:0 auto">
    <div class="muted" style="font-size:13px;margin-bottom:22px">Essays / Draft · edited 2 min ago</div>
    <h1 class="serif" style="font-size:46px;line-height:1.1;margin-bottom:26px">On making quiet software</h1>
    ${[0, 1, 2].map((p) => `<p class="serif" style="font-size:19px;line-height:1.75;color:var(--fg);opacity:.86;margin-bottom:22px;font-weight:400">${["Most tools compete for attention. The best ones give it back: they remember where you were, stay out of the way while you think, and surface the one thing you need at the moment you need it.", "A calm interface is not an empty one. It is an interface where every element earns its place, where hierarchy is obvious, and where nothing moves unless you asked it to.", "This essay collects a few principles we try to follow — about type, rhythm and restraint — and the small decisions that add up to a product that feels like a well-made notebook."][p]}</p>`).join("")}
    <blockquote class="serif" style="border-left:3px solid var(--a);padding-left:20px;font-size:21px;font-style:italic;margin:30px 0">Restraint is a feature.</blockquote>
  </article></main></div>`,
  );
}

function docs(brand: Brand): string {
  return base(
    brand,
    `${webNav(brand, ["Docs", "API", "Changelog", "Community"], "Dashboard")}
<div style="display:grid;grid-template-columns:260px 1fr 220px;height:828px">
  <aside class="col" style="padding:28px 24px;gap:4px;border-right:1px solid var(--ln);font-size:14px">${["Introduction", "Quickstart", "Installation", "Configuration", "Deployments", "Environments", "Rollbacks", "CLI reference", "API reference"].map((t, i) => `<div style="height:32px;display:flex;align-items:center;padding:0 10px;border-radius:7px;${i === 1 ? "background:var(--soft);color:var(--a);font-weight:600" : "color:var(--mu)"}">${t}</div>`).join("")}</aside>
  <main style="padding:48px 64px;overflow:hidden"><div style="max-width:720px">
    <div style="font-size:13px;color:var(--a);font-weight:600;margin-bottom:10px">Getting started</div>
    <h1 style="font-size:40px;letter-spacing:-.035em;margin-bottom:16px">Quickstart</h1>
    <p class="muted" style="font-size:17px;line-height:1.65;margin-bottom:28px">Install the CLI, connect your repository and ship your first release in under five minutes.</p>
    <h2 style="font-size:22px;margin-bottom:12px">1. Install the CLI</h2>
    <div style="background:#050706;border:1px solid var(--ln);border-radius:12px;padding:18px 20px;font-family:monospace;font-size:14px;color:#cfe;margin-bottom:28px"><span style="color:var(--a)">$</span> npm install -g relay-cli<br><span style="color:var(--a)">$</span> relay login</div>
    <h2 style="font-size:22px;margin-bottom:12px">2. Create a release</h2>
    <p class="muted" style="font-size:16px;line-height:1.7;margin-bottom:18px">Relay reads your commit history, groups changes by type and drafts release notes automatically.</p>
    <div style="background:#050706;border:1px solid var(--ln);border-radius:12px;padding:18px 20px;font-family:monospace;font-size:14px;color:#cfe"><span style="color:var(--a)">$</span> relay release --draft<br><span style="color:var(--mu)">✓ 14 commits · 3 features · 6 fixes</span></div>
  </div></main>
  <aside class="col" style="padding:48px 24px;gap:12px;font-size:13px"><b>On this page</b>${["Install the CLI", "Create a release", "Next steps"].map((t) => `<span class="muted">${t}</span>`).join("")}</aside>
</div>`,
  );
}

function changelog(brand: Brand): string {
  return base(
    brand,
    `${webNav(brand, ["Product", "Docs", "Changelog", "Pricing"])}
<main style="max-width:860px;margin:0 auto;padding:72px 0">
  <h1 style="font-size:48px;letter-spacing:-.04em;margin-bottom:12px">Changelog</h1>
  <p class="muted" style="font-size:18px;margin-bottom:48px">New updates and improvements to ${brand.name}.</p>
  ${[["Oct 2, 2026", "Release environments", "Promote builds across staging and production with one command."], ["Sep 18, 2026", "Faster rollbacks", "Roll back any release in under three seconds, with a full audit trail."], ["Sep 4, 2026", "GitHub checks", "See release status directly on pull requests."]].map(([d, t, s], i) => `<article style="display:grid;grid-template-columns:180px 1fr;gap:32px;padding:32px 0;border-top:1px solid var(--ln)"><span class="muted" style="font-size:14px">${d}</span><div class="col" style="gap:12px"><h2 style="font-size:24px;letter-spacing:-.025em">${t}</h2><p class="muted" style="font-size:16px;line-height:1.6">${s}</p>${i === 0 ? `<div class="card" style="height:200px;background:var(--soft);margin-top:8px;padding:20px">${chart(brand.accent, 560, 160, 7)}</div>` : ""}</div></article>`).join("")}
</main>`,
  );
}

function checkout(brand: Brand): string {
  return base(
    brand,
    `<div style="display:grid;grid-template-columns:1fr 1fr;height:900px">
  <div style="background:var(--soft);padding:88px 96px" class="col">
    <div class="row" style="gap:10px;font-weight:700;margin-bottom:48px"><span class="logo">${logoSvg(brand, 16)}</span>Lattice Studio</div>
    <span class="muted" style="font-size:15px">Subscribe to Pro</span>
    <div style="font-size:44px;font-weight:700;letter-spacing:-.03em;margin:8px 0 40px">$29.00 <span class="muted" style="font-size:16px;font-weight:500">per month</span></div>
    ${[["Pro plan", "$29.00"], ["Tax", "$0.00"]].map(([a, b]) => `<div class="row" style="justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--ln);font-size:15px"><span>${a}</span><span>${b}</span></div>`).join("")}
    <div class="row" style="justify-content:space-between;padding:16px 0;font-size:15px;font-weight:600"><span>Total due today</span><span>$29.00</span></div>
  </div>
  <div style="padding:88px 96px" class="col">
    <span class="btn" style="background:#111;color:#fff;height:46px;margin-bottom:24px">Pay with  Wallet</span>
    <div class="row muted" style="gap:12px;font-size:13px;margin-bottom:24px"><span class="bar" style="flex:1;height:1px"></span>Or pay with card<span class="bar" style="flex:1;height:1px"></span></div>
    ${["Email", "Card information", "Name on card", "Country or region"].map((l, i) => `<div class="col" style="gap:8px;margin-bottom:18px"><span style="font-size:13px;font-weight:500">${l}</span><div class="card" style="height:44px;display:flex;align-items:center;padding:0 14px;font-size:15px;color:var(--mu)">${["jane@lattice.studio", "1234 1234 1234 1234", "Jane Cooper", "United States"][i]}</div></div>`).join("")}
    <span class="btn" style="height:48px;margin-top:10px">Subscribe</span>
    <p class="muted" style="font-size:12px;text-align:center;margin-top:18px">Powered by ${brand.name}</p>
  </div></div>`,
  );
}

// ---------------------------------------------------------------------------------------------
// Mobile templates (390 × 844)
// ---------------------------------------------------------------------------------------------

function phone(brand: Brand, body: string, opts: { tabs?: number } = {}): string {
  const tabs = ["Home", "Activity", "Plan", "Profile"];
  return base(
    brand,
    `<div class="col" style="width:390px;height:844px;position:relative;overflow:hidden">
  <div class="row" style="height:50px;padding:0 30px;justify-content:space-between;font-size:15px;font-weight:600"><span>9:41</span><span style="letter-spacing:2px">▮▮▮ ◔ ▬</span></div>
  ${body}
  ${opts.tabs !== undefined ? `<nav class="row" style="position:absolute;bottom:0;left:0;right:0;height:84px;padding:0 24px 22px;justify-content:space-between;border-top:1px solid var(--ln);background:var(--bg)">${tabs.map((t, i) => `<div class="col" style="align-items:center;gap:5px;font-size:11px;font-weight:500;${i === opts.tabs ? "color:var(--a)" : "color:var(--mu)"}"><span style="width:22px;height:22px;border-radius:7px;background:${i === opts.tabs ? "var(--a)" : "var(--ln)"}"></span>${t}</div>`).join("")}</nav>` : `<div style="position:absolute;bottom:8px;left:50%;margin-left:-67px;width:134px;height:5px;border-radius:9px;background:var(--fg)"></div>`}
</div>`,
  );
}

function onboarding(brand: Brand, step: number, title: string, sub: string, art: string): string {
  return phone(
    brand,
    `<div class="row" style="justify-content:flex-end;padding:8px 24px"><span class="muted" style="font-size:15px;font-weight:500">Skip</span></div>
  <div style="height:400px;margin:20px 24px;border-radius:28px;background:var(--soft);display:grid;place-items:center;overflow:hidden">${art}</div>
  <div class="col" style="padding:12px 28px;gap:12px"><h1 style="font-size:30px;line-height:1.1;letter-spacing:-.035em">${title}</h1><p class="muted" style="font-size:16px;line-height:1.5">${sub}</p></div>
  <div class="row" style="gap:6px;padding:16px 28px">${[0, 1, 2].map((i) => `<span style="height:6px;border-radius:9px;background:${i === step ? "var(--a)" : "var(--ln)"};width:${i === step ? 22 : 6}px"></span>`).join("")}</div>
  <div style="position:absolute;bottom:40px;left:24px;right:24px"><span class="btn" style="width:100%;height:54px;border-radius:16px;font-size:16px">${step === 2 ? "Get started" : "Continue"}</span></div>`,
  );
}

function ring(color: string, pct: number, size = 220, label = ""): string {
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="rgba(127,127,127,.18)" stroke-width="16" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="16" fill="none" stroke-linecap="round" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="52%" text-anchor="middle" font-family="Inter" font-weight="700" font-size="34" fill="currentColor">${label}</text></svg>`;
}

function tallyHome(brand: Brand): string {
  return phone(
    brand,
    `<div class="row" style="justify-content:space-between;padding:8px 24px 0"><div class="col"><span class="muted" style="font-size:14px">Good morning</span><b style="font-size:22px;letter-spacing:-.02em">Maya</b></div><span style="width:40px;height:40px;border-radius:99px;background:#f2c6a0"></span></div>
  <div style="margin:22px 20px 0;padding:22px;border-radius:24px;background:var(--a);color:var(--on)"><div style="font-size:14px;opacity:.8">Left to spend in October</div><div style="font-size:40px;font-weight:700;letter-spacing:-.03em;margin:6px 0 14px">$1,284.50</div><div style="height:8px;border-radius:9px;background:rgba(255,255,255,.25)"><div style="width:62%;height:100%;border-radius:9px;background:#fff"></div></div><div class="row" style="justify-content:space-between;margin-top:10px;font-size:13px;opacity:.85"><span>$2,115 spent</span><span>12 days left</span></div></div>
  <div class="row" style="justify-content:space-between;padding:24px 24px 10px"><b style="font-size:17px">Categories</b><span class="muted" style="font-size:14px">See all</span></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 20px">${[["Groceries", "$412", "#f59e0b"], ["Dining", "$268", "#ef4444"], ["Transport", "$96", "#3b82f6"], ["Fun", "$140", "#8b5cf6"]].map(([n, v, c]) => `<div class="card" style="padding:16px"><span style="display:block;width:30px;height:30px;border-radius:10px;background:${c};opacity:.9;margin-bottom:14px"></span><div class="muted" style="font-size:13px">${n}</div><b style="font-size:19px">${v}</b></div>`).join("")}</div>
  <div class="row" style="justify-content:space-between;padding:24px 24px 6px"><b style="font-size:17px">Recent</b></div>
  ${[["Corner Market", "−$32.18"], ["Metro card", "−$20.00"]].map(([n, v]) => `<div class="row" style="padding:12px 24px;gap:14px"><span style="width:38px;height:38px;border-radius:12px;background:var(--soft)"></span><span style="flex:1;font-size:15px;font-weight:500">${n}</span><b style="font-size:15px">${v}</b></div>`).join("")}`,
    { tabs: 0 },
  );
}

function tallySignup(brand: Brand): string {
  return phone(
    brand,
    `<div style="padding:24px 28px" class="col"><span style="font-size:24px;margin-bottom:28px">←</span>
  <h1 style="font-size:30px;letter-spacing:-.035em;margin-bottom:10px">Create your account</h1><p class="muted" style="font-size:16px;margin-bottom:30px">It takes less than a minute.</p>
  ${["Full name", "Email", "Password"].map((l, i) => `<div class="col" style="gap:8px;margin-bottom:18px"><span style="font-size:14px;font-weight:500">${l}</span><div style="height:52px;border-radius:14px;background:var(--soft);display:flex;align-items:center;padding:0 16px;font-size:16px;${i === 1 ? "border:2px solid var(--a);background:var(--bg)" : ""}">${["Maya Lin", "maya@hey.com", "••••••••••"][i]}</div></div>`).join("")}
  <div class="row" style="gap:10px;font-size:14px;margin:4px 0 30px"><span style="width:20px;height:20px;border-radius:6px;background:var(--a)"></span><span class="muted">I agree to the Terms and Privacy Policy</span></div>
  <span class="btn" style="height:54px;border-radius:16px;font-size:16px">Create account</span>
  <div class="row muted" style="gap:12px;font-size:13px;margin:26px 0"><span class="bar" style="flex:1;height:1px"></span>or<span class="bar" style="flex:1;height:1px"></span></div>
  <span class="btn ghost" style="height:54px;border-radius:16px;font-size:16px;font-weight:500">Continue with Apple</span></div>`,
  );
}

function wanderExplore(brand: Brand): string {
  const places = [
    ["Lisbon", "#e9b77a", "#c76b4a"],
    ["Kyoto", "#9cc5a1", "#4f7d65"],
    ["Oaxaca", "#f3c27b", "#d0644b"],
  ];
  return phone(
    brand,
    `<div style="padding:6px 20px 0"><h1 style="font-size:30px;letter-spacing:-.035em">Explore</h1>
  <div class="row" style="height:50px;border-radius:99px;background:var(--soft);margin:14px 0;padding:0 18px;gap:10px;font-size:15px" ><span class="muted">⌕</span><span class="muted">Where to next?</span></div>
  <div class="row" style="gap:8px;margin-bottom:18px">${["All", "Beaches", "Cities", "Mountains"].map((t, i) => `<span style="padding:8px 14px;border-radius:99px;font-size:14px;font-weight:500;${i === 0 ? "background:var(--fg);color:var(--bg)" : "border:1px solid var(--ln)"}">${t}</span>`).join("")}</div></div>
  ${places.slice(0, 2).map(([n, a, b], i) => `<div style="margin:0 20px 18px"><div style="height:${i ? 150 : 230}px;border-radius:22px;background:linear-gradient(160deg,${a},${b});position:relative"><span style="position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:99px;background:rgba(255,255,255,.9)"></span></div><div class="row" style="justify-content:space-between;margin-top:10px"><b style="font-size:17px">${n}</b><span style="font-size:14px">★ 4.${9 - i}</span></div><span class="muted" style="font-size:14px">${i ? "6 friends going" : "Trip with Sam & 3 others · Nov 12–19"}</span></div>`).join("")}`,
    { tabs: 0 },
  );
}

function wanderDetail(brand: Brand): string {
  return phone(
    brand,
    `<div style="position:absolute;top:0;left:0;right:0;height:380px;background:linear-gradient(160deg,#9cc5a1,#4f7d65)"></div>
  <div class="row" style="position:relative;justify-content:space-between;padding:0 20px"><span style="width:40px;height:40px;border-radius:99px;background:rgba(255,255,255,.92)"></span><span style="width:40px;height:40px;border-radius:99px;background:rgba(255,255,255,.92)"></span></div>
  <div style="position:absolute;top:340px;left:0;right:0;bottom:0;border-radius:28px 28px 0 0;background:var(--bg);padding:26px 24px" class="col">
    <h1 style="font-size:28px;letter-spacing:-.03em">Kyoto in autumn</h1><span class="muted" style="font-size:15px;margin:6px 0 18px">Nov 12 – 19 · 4 travellers</span>
    <div class="row" style="gap:10px;margin-bottom:22px">${avatarRow(4)}<span class="muted" style="font-size:14px">+ Invite</span></div>
    ${["Day 1 · Arrive & Gion walk", "Day 2 · Arashiyama bamboo grove", "Day 3 · Fushimi Inari at sunrise"].map((d, i) => `<div class="row" style="gap:14px;padding:14px 0;border-top:1px solid var(--ln)"><span style="width:44px;height:44px;border-radius:12px;background:${["#e9b77a", "#9cc5a1", "#f4b6b6"][i]}"></span><span style="font-size:15px;font-weight:500;flex:1">${d}</span><span class="muted">›</span></div>`).join("")}
    <span class="btn" style="height:54px;border-radius:16px;font-size:16px;margin-top:auto;margin-bottom:26px">Book stays</span>
  </div>`,
  );
}

function pulseToday(brand: Brand): string {
  return phone(
    brand,
    `<div style="padding:6px 22px" class="col"><span class="muted" style="font-size:14px">Tuesday, Oct 6</span><h1 style="font-size:30px;letter-spacing:-.035em">Today</h1></div>
  <div style="display:grid;place-items:center;padding:18px 0;color:var(--fg)">${ring(brand.accent, 0.72, 230, "72%")}</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 20px">${[["Move", "486", "kcal"], ["Train", "38", "min"], ["Sleep", "7.4", "hrs"]].map(([l, v, u]) => `<div style="padding:14px;border-radius:18px;background:var(--soft)"><div class="muted" style="font-size:12px">${l}</div><b style="font-size:22px">${v}</b> <span class="muted" style="font-size:12px">${u}</span></div>`).join("")}</div>
  <div style="margin:18px 20px;padding:18px;border-radius:22px;background:var(--a);color:var(--on)" class="col"><span style="font-size:13px;font-weight:600;opacity:.8">UP NEXT · 18:30</span><b style="font-size:20px;margin:6px 0 4px">Tempo run · 6 km</b><span style="font-size:14px;opacity:.8">Zone 3 · adaptive pace</span></div>
  <div style="margin:0 20px;padding:16px;border-radius:22px;background:var(--soft)">${bars(brand.accent, 7, 90)}</div>`,
    { tabs: 0 },
  );
}

function pulseWorkout(brand: Brand): string {
  return phone(
    brand,
    `<div class="row" style="justify-content:space-between;padding:6px 22px"><span style="font-size:22px">←</span><span class="muted" style="font-size:14px">Interval 3 of 6</span><span>⋯</span></div>
  <div class="col" style="align-items:center;padding:36px 0 18px;gap:4px"><span class="muted" style="font-size:15px">Pace</span><b style="font-size:76px;letter-spacing:-.05em;line-height:1">4:52</b><span class="muted" style="font-size:15px">min / km</span></div>
  <div style="margin:10px 22px;padding:18px;border-radius:22px;background:var(--soft)">${chart(brand.accent, 310, 120, 5)}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:8px 22px">${[["Distance", "3.42 km"], ["Heart rate", "156 bpm"], ["Elapsed", "17:08"], ["Cadence", "172 spm"]].map(([l, v]) => `<div style="padding:16px;border-radius:18px;background:var(--soft)"><div class="muted" style="font-size:12px">${l}</div><b style="font-size:20px">${v}</b></div>`).join("")}</div>
  <div class="row" style="position:absolute;bottom:46px;left:0;right:0;justify-content:center;gap:28px"><span style="width:64px;height:64px;border-radius:99px;background:var(--soft)"></span><span style="width:84px;height:84px;border-radius:99px;background:var(--a)"></span><span style="width:64px;height:64px;border-radius:99px;background:var(--soft)"></span></div>`,
  );
}

// ---------------------------------------------------------------------------------------------

const web = (file: string, brand: string, html: string, fullPage = false): MockPage => ({
  file,
  brand,
  kind: "web",
  width: 1440,
  height: 900,
  scale: 0.5,
  fullPage,
  html,
});
const mobile = (file: string, brand: string, html: string): MockPage => ({
  file,
  brand,
  kind: "mobile",
  width: 390,
  height: 844,
  scale: 1,
  html,
});

export function mockPages(): MockPage[] {
  const { northwind, lumen, relay, atlas, tally, wander, pulse } = brands as Record<string, Brand> & {
    northwind: Brand;
    lumen: Brand;
    relay: Brand;
    atlas: Brand;
    tally: Brand;
    wander: Brand;
    pulse: Brand;
  };
  const nwLinks = ["Product", "Solutions", "Customers", "Pricing", "Docs"];
  return [
    web(
      "northwind-landing.webp",
      "northwind",
      landing(northwind, {
        headline: "Understand every user, every release",
        sub: "Northwind turns product events into answers your whole team can use — funnels, retention and live dashboards in minutes.",
        links: nwLinks,
        product: dashboardProduct(northwind),
      }),
      true,
    ),
    web("northwind-pricing.webp", "northwind", pricing(northwind, nwLinks)),
    web("northwind-dashboard.webp", "northwind", dashboard(northwind)),
    web("northwind-login.webp", "northwind", login(northwind)),
    web("northwind-settings.webp", "northwind", settings(northwind)),
    web(
      "lumen-landing.webp",
      "lumen",
      landing(lumen, {
        headline: "A quiet place to write",
        sub: "Lumen is a distraction-free workspace for notes, drafts and long-form writing — fast, private and beautifully typeset.",
        links: ["Features", "Templates", "Pricing", "Blog"],
        product: `<div class="card" style="height:420px;background:var(--soft);border:0;display:grid;place-items:center"><div class="card" style="width:640px;padding:40px;box-shadow:0 30px 80px -30px rgba(0,0,0,.3)"><h3 class="serif" style="font-size:32px;margin-bottom:16px">Morning pages</h3>${[92, 88, 95, 70, 84].map((w) => `<div class="bar" style="width:${w}%;margin:12px 0;height:9px"></div>`).join("")}</div></div>`,
      }),
    ),
    web("lumen-editor.webp", "lumen", editor(lumen)),
    web("lumen-pricing.webp", "lumen", pricing(lumen, ["Features", "Templates", "Pricing", "Blog"])),
    web(
      "relay-landing.webp",
      "relay",
      landing(relay, {
        headline: "Release notes that write themselves",
        sub: "Relay connects to your repository, drafts changelogs from commits and ships them everywhere your users are.",
        links: ["Product", "Docs", "Changelog", "Pricing"],
        product: `<div class="card" style="padding:28px;background:#050706;font-family:monospace;font-size:15px;line-height:1.9;color:#cfe"><span style="color:var(--a)">$</span> relay release v2.4.0<br><span style="color:#7a8">→ Collecting commits since v2.3.2…</span><br><span style="color:var(--a)">✓</span> 3 features &nbsp; <span style="color:var(--a)">✓</span> 9 fixes &nbsp; <span style="color:var(--a)">✓</span> 2 breaking changes<br><span style="color:#7a8">→ Publishing to GitHub, Slack and in-app widget…</span><br><span style="color:var(--a)">✓ Released in 4.2s</span></div>`,
      }),
    ),
    web("relay-docs.webp", "relay", docs(relay)),
    web("relay-changelog.webp", "relay", changelog(relay)),
    web(
      "atlas-landing.webp",
      "atlas",
      landing(atlas, {
        headline: "Accept payments anywhere, in minutes",
        sub: "One integration for cards, wallets and bank transfers in 40+ countries — with billing, invoicing and fraud tools built in.",
        links: ["Products", "Developers", "Pricing", "Company"],
        product: dashboardProduct(atlas),
      }),
    ),
    web("atlas-checkout.webp", "atlas", checkout(atlas)),
    web("atlas-dashboard.webp", "atlas", dashboard(atlas)),
    mobile(
      "tally-onboarding-1.webp",
      "tally",
      onboarding(tally, 0, "See where your money goes", "Connect your accounts and Tally sorts every transaction automatically.", ring(tally.accent, 0.64, 240, "64%")),
    ),
    mobile(
      "tally-onboarding-2.webp",
      "tally",
      onboarding(tally, 1, "Budgets that bend, not break", "Set flexible limits per category. We’ll nudge you before you overspend.", `<div style="width:260px">${bars(tally.accent, 8, 200)}</div>`),
    ),
    mobile(
      "tally-onboarding-3.webp",
      "tally",
      onboarding(tally, 2, "Save for what matters", "Create goals and watch them fill up, one round-up at a time.", `<div class="col" style="gap:14px;width:260px">${["Japan trip", "New laptop", "Emergency fund"].map((g, i) => `<div class="card" style="padding:14px"><b style="font-size:14px">${g}</b><div class="bar" style="margin-top:10px"><div style="width:${[72, 40, 88][i]}%;height:100%;border-radius:9px;background:var(--a)"></div></div></div>`).join("")}</div>`),
    ),
    mobile("tally-signup.webp", "tally", tallySignup(tally)),
    mobile("tally-home.webp", "tally", tallyHome(tally)),
    mobile("wander-explore.webp", "wander", wanderExplore(wander)),
    mobile("wander-detail.webp", "wander", wanderDetail(wander)),
    mobile("pulse-today.webp", "pulse", pulseToday(pulse)),
    mobile("pulse-workout.webp", "pulse", pulseWorkout(pulse)),
  ];
}
