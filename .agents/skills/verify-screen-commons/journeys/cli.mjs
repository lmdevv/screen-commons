import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

const memberKey = async (page, h, name) => {
  const response = await page.request.post(`${h.base}/api/v1/keys`, {
    headers: { origin: h.base },
    data: { name },
  });
  assert.equal(response.status(), 201);
  return (await response.json()).token;
};

/** Forwards to the instance, and lets `decide` drop or replace an answer, as a bad network would. */
async function faultProxy(target, decide) {
  const log = [];
  const server = createHttpServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const call = {
      method: request.method,
      path: new URL(request.url, target).pathname,
      nth: log.filter(
        (entry) =>
          entry.method === request.method && entry.path === new URL(request.url, target).pathname,
      ).length,
    };
    if (call.path === "/api/v1/captures") call.screens = JSON.parse(body).screens.length;
    log.push(call);
    const action = decide(call) ?? {};
    call.action = action.name ?? "forward";
    if (action.answer) {
      response.writeHead(action.answer.status, action.answer.headers).end(action.answer.body);
      return;
    }
    const forwarded = await fetch(new URL(request.url, target), {
      method: request.method,
      headers: Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => !["host", "connection"].includes(name)),
      ),
      body: body.length ? body : undefined,
    });
    const answer = Buffer.from(await forwarded.arrayBuffer());
    if (action.drop) {
      request.socket.destroy();
      return;
    }
    response.writeHead(forwarded.status, {
      "content-type": forwarded.headers.get("content-type") ?? "application/octet-stream",
    });
    response.end(answer, () => action.after?.());
  });
  await new Promise((done) => server.listen(0, "localhost", done));
  return {
    url: `http://localhost:${server.address().port}`,
    log,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

function imageHost(dir, images) {
  const key = join(dir, "tls.key");
  const cert = join(dir, "tls.crt");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost",
    ],
    { stdio: "pipe" },
  );
  const server = createHttpsServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    (request, response) => {
      const image = images[new URL(request.url, "https://localhost").pathname];
      if (!image) {
        response.writeHead(404).end();
        return;
      }
      if (typeof image === "string") {
        response.writeHead(302, { location: image }).end();
        return;
      }
      response.writeHead(200, { "content-type": "image/png" }).end(image);
    },
  );
  return new Promise((done) =>
    server.listen(0, "localhost", () =>
      done({
        ca: cert,
        url: (path) => `https://localhost:${server.address().port}${path}`,
        close: () => {
          server.closeAllConnections();
          server.close();
        },
      }),
    ),
  );
}

/** The `screen-commons` CLI as a subprocess, on the real instance. */
export default async function cli(h) {
  const dir = mkdtempSync(join(tmpdir(), `sc-cli-${h.stamp}-`));
  const closers = [() => rmSync(dir, { recursive: true, force: true })];
  try {
    await journey(h, dir, closers);
  } finally {
    for (const close of closers.reverse()) close();
  }
}

async function journey(h, dir, closers) {
  const entry = h.builtCli();
  const everything = [];
  const keys = new Set([h.adminKey]);
  let ca;

  const start = (args, { key = h.adminKey, url = h.base, bin, env = {} } = {}) =>
    spawn(bin ?? process.execPath, bin ? args : [entry, ...args], {
      env: {
        PATH: process.env.PATH,
        HOME: dir,
        ...(ca ? { NODE_EXTRA_CA_CERTS: ca } : {}),
        ...(url ? { SCREEN_COMMONS_URL: url } : {}),
        ...(key ? { SCREEN_COMMONS_API_KEY: key } : {}),
        ...env,
      },
      cwd: env.CWD ?? dir,
      stdio: ["ignore", "pipe", "pipe"],
    });

  const settle = (label, args, child) =>
    new Promise((done, fail) => {
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.once("error", fail);
      child.once("close", (code, signal) => {
        everything.push(stdout, stderr);
        let json;
        try {
          json = JSON.parse(stdout);
        } catch {
          json = undefined;
        }
        h.record(label, {
          args: args.map((arg) => (keys.has(arg) ? "(key)" : arg)),
          code,
          signal,
          stderr,
          stdout: json ?? stdout,
        });
        done({ code, signal, stdout, stderr, json });
      });
    });

  const run = (label, args, options) => settle(label, args, start(args, options));

  const write = (name, value) => {
    const path = join(dir, name);
    writeFileSync(
      path,
      typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value),
    );
    return path;
  };
  const rows = async (label, appId) => {
    const [counts] = await h.sql(
      label,
      `SELECT
        (SELECT count(*) FROM screen WHERE app_id = ?1) AS screens,
        (SELECT count(*) FROM flow WHERE app_id = ?1) AS flows,
        (SELECT count(*) FROM flow_step fs JOIN flow f ON f.id = fs.flow_id WHERE f.app_id = ?1) AS steps,
        (SELECT coalesce(sum(view_count), 0) FROM screen WHERE app_id = ?1) AS views`,
      [appId],
    );
    return counts;
  };
  /** Distinct images, in files next to a manifest that can name them. */
  const images = async (prefix, count) => {
    const labels = Array.from({ length: count }, (_, index) => `${prefix} ${index}`);
    const files = await h.pngs(labels);
    return files.map((file, index) => ({
      localId: `s${index}`,
      file: write(`${prefix}-${index}.png`, file.buffer),
      buffer: file.buffer,
    }));
  };
  const toScreens = (files) =>
    files.map(({ localId, file }, index) => ({
      localId,
      source: { file },
      title: `Screen ${index}`,
      patterns: index === 0 ? ["landing"] : ["signup"],
      elements: [],
      tags: ["journey"],
    }));

  for (const args of [
    ["--help"],
    ["apps", "--help"],
    ["screens", "--help"],
    ["flows", "--help"],
    ["manifest", "--help"],
    ["screens", "search", "--help"],
    ["manifest", "publish", "--help"],
    ["upload", "--help"],
  ]) {
    const { code, stdout, stderr } = await run(`help: ${args.join(" ")}`, args);
    assert.equal(code, 0, args.join(" "));
    assert.ok(stdout.includes("Usage: screen-commons") || stdout.includes("Usage:"));
    assert.equal(stderr, "");
  }
  const usage = await run("no command", []);
  assert.equal(usage.code, 2);
  assert.match(usage.stderr, /^usage: /u);
  const unknown = await run("unknown flag", ["screens", "search", "--nope"]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /^usage: /u);
  const noKey = await run("no key", ["whoami"], { key: null });
  assert.equal(noKey.code, 3);
  assert.match(noKey.stderr, /^missing_api_key: /u);
  const wrongKey = "sc_this_key_is_wrong";
  keys.add(wrongKey);
  const rejected = await run("wrong key", ["whoami"], { key: wrongKey });
  assert.equal(rejected.code, 3);
  assert.match(rejected.stderr, /^unauthorized: /u);
  const anonymous = await run("taxonomy needs no key", ["taxonomy"], { key: null });
  assert.equal(anonymous.code, 0);
  assert.ok(anonymous.json.patterns.length > 0);
  const flagKey = await run("a flag beats the environment", ["whoami", "--api-key", h.adminKey], {
    key: wrongKey,
  });
  assert.equal(flagKey.code, 0);
  assert.equal(flagKey.json.role, "admin");

  const app = {
    name: `CLI ${h.stamp}`,
    websiteUrl: `https://cli-${h.stamp}.example.com`,
  };
  const files = await images("main", 7);
  const tallPage = await h.newPage({ viewport: { width: 1000, height: 3000 } });
  await tallPage.setContent(
    `<body style="margin:0;background:linear-gradient(#123,#fed)"><h1>Tall ${h.stamp}</h1></body>`,
  );
  const tallBytes = await tallPage.screenshot({ type: "png" });
  await tallPage.close();
  const allScreens = [
    ...toScreens(files),
    {
      localId: "tall",
      source: { file: "tall.png" },
      title: "Tall page",
      patterns: ["landing"],
      elements: [],
    },
  ];
  write("tall.png", tallBytes);
  const manifest = {
    version: 1,
    id: `journey-${h.stamp}`,
    app,
    screens: allScreens,
    flows: [
      {
        localId: "signup",
        name: `Signup ${h.stamp}`,
        type: "signing-up",
        steps: [{ screen: "s0", label: "Land" }, { screen: "s1" }, { screen: "s2", label: "Done" }],
      },
      {
        localId: "tour",
        name: `Tour ${h.stamp}`,
        steps: [
          { screen: "s2" },
          { screen: "s3" },
          { screen: "s2", label: "Back" },
          { screen: "tall" },
        ],
      },
    ],
  };
  const manifestPath = write("manifest.json", manifest);
  const validated = await run("manifest validate", ["manifest", "validate", manifestPath], {
    key: null,
    url: null,
  });
  assert.equal(validated.code, 0, validated.stderr);
  assert.equal(validated.json.ok, true);

  const first = await run("manifest publish", ["manifest", "publish", manifestPath]);
  assert.equal(first.code, 0, first.stderr);
  const report = first.json;
  assert.equal(report.ok, true);
  assert.equal(report.screens.length, 8);
  assert.ok(report.screens.every((item) => item.status === "published" && item.url && item.id));
  assert.equal(report.flows.length, 2);
  assert.ok(report.flows.every((item) => item.status === "published" && item.url));
  assert.equal(new Set(report.screens.map((item) => item.id)).size, 8);
  const screenId = Object.fromEntries(report.screens.map((item) => [item.localId, item.id]));
  const flowId = Object.fromEntries(report.flows.map((item) => [item.localId, item.id]));
  const appId = report.app.id;
  assert.deepEqual(await rows("rows after the first publish", appId), {
    screens: 8,
    flows: 2,
    steps: 7,
    views: 0,
  });

  const signup = await run("flows get: signup", ["flows", "get", flowId.signup]);
  assert.equal(signup.code, 0);
  assert.deepEqual(
    signup.json.steps.map((step) => [step.screen.id, step.label]),
    [
      [screenId.s0, "Land"],
      [screenId.s1, null],
      [screenId.s2, "Done"],
    ],
  );
  assert.equal(signup.json.type, "signing-up");
  const tour = await run("flows get: tour", ["flows", "get", flowId.tour]);
  assert.deepEqual(
    tour.json.steps.map((step) => [step.position, step.screen.id, step.label]),
    [
      [0, screenId.s2, null],
      [1, screenId.s3, null],
      [2, screenId.s2, "Back"],
      [3, screenId.tall, null],
    ],
    "shares s2 with signup and repeats it",
  );
  const flowPage = await h.newPage();
  await h.signIn(flowPage);
  await h.goto(flowPage, `/flows/${flowId.tour}`);
  await h.step("the flow in the web app", flowPage);
  assert.equal(await flowPage.getByRole("button", { name: /^Open step/u }).count(), 4);
  await h.goto(flowPage, `/flows/${flowId.tour}?screen=${screenId.s3}`);
  await flowPage.keyboard.press("ArrowRight");
  await flowPage.waitForURL((url) => url.searchParams.get("screen") === screenId.s2);
  await flowPage.keyboard.press("ArrowRight");
  await flowPage.waitForURL((url) => url.searchParams.get("screen") === screenId.tall);
  await h.step("the viewer walks past the repeated screen", flowPage);
  await flowPage.close();

  const [stored] = await h.sql(
    "the first screen's row",
    "SELECT bytes, width, height FROM screen WHERE id = ?1",
    [screenId.s0],
  );
  const download = await run("screens download", [
    "screens",
    "download",
    screenId.s0,
    "--out",
    join(dir, "s0-download.webp"),
  ]);
  assert.equal(download.code, 0, download.stderr);
  assert.deepEqual(
    [download.json.width, download.json.height, download.json.bytes],
    [1440, 900, stored.bytes],
  );
  assert.equal(readFileSync(download.json.path).byteLength, stored.bytes);
  assert.equal(readFileSync(download.json.path).toString("ascii", 8, 12), "WEBP");
  const again = await run("screens download refuses to overwrite", [
    "screens",
    "download",
    screenId.s0,
    "--out",
    download.json.path,
  ]);
  assert.equal(again.code, 2);
  assert.match(again.stderr, /^file_exists: /u);
  const tallFull = await run("the tall page is whole", [
    "screens",
    "download",
    screenId.tall,
    "--out",
    join(dir, "tall-download"),
  ]);
  assert.deepEqual([tallFull.json.width, tallFull.json.height], [1000, 3000], "no cropping");
  const tallThumb = await run("its thumbnail is the policy's top crop", [
    "screens",
    "download",
    screenId.tall,
    "--thumb",
    "--out",
    join(dir, "tall-thumb"),
  ]);
  assert.deepEqual([tallThumb.json.width, tallThumb.json.height], [640, 400]);

  const before = await rows("rows before repeating", appId);
  const objects = (await h.r2()).length;
  const repeated = await run("manifest publish again", ["manifest", "publish", manifestPath]);
  assert.equal(repeated.code, 0, repeated.stderr);
  assert.deepEqual(repeated.json, report, "an identical report");
  assert.deepEqual(await rows("no new rows, and no new views", appId), before);
  assert.equal((await h.r2()).length, objects, "no new objects");

  const edited = structuredClone(manifest);
  edited.screens[1].title = "Renamed by a manifest";
  edited.screens[1].patterns = ["pricing"];
  edited.flows[0].name = `Renamed ${h.stamp}`;
  edited.flows[0].steps = [{ screen: "s2" }, { screen: "s0", label: "Reordered" }];
  edited.flows[1].type = "onboarding";
  const editedPath = write("edited.json", edited);
  const applied = await run("publish an edited manifest", ["manifest", "publish", editedPath]);
  assert.equal(applied.code, 0, applied.stderr);
  const renamed = await run("the screen took the edit", ["screens", "get", screenId.s1]);
  assert.equal(renamed.json.title, "Renamed by a manifest");
  assert.deepEqual(renamed.json.patterns, ["pricing"]);
  const reordered = await run("the flow took the edit", ["flows", "get", flowId.signup]);
  assert.equal(reordered.json.name, `Renamed ${h.stamp}`);
  assert.deepEqual(
    reordered.json.steps.map((step) => [step.screen.id, step.label]),
    [
      [screenId.s2, null],
      [screenId.s0, "Reordered"],
    ],
  );
  const typed = await run("the second flow took its type", ["flows", "get", flowId.tour]);
  assert.equal(typed.json.type, "onboarding");
  const afterEdit = await rows("an edit adds no rows", appId);
  assert.equal(afterEdit.screens, 8);
  assert.equal(afterEdit.flows, 2);

  const killFiles = await images("kill", 8);
  const killManifest = {
    version: 1,
    id: `kill-${h.stamp}`,
    app: { name: `Kill ${h.stamp}`, websiteUrl: `https://kill-${h.stamp}.example.com` },
    screens: toScreens(killFiles),
    flows: [
      {
        localId: "a",
        name: "First half",
        steps: [{ screen: "s0" }, { screen: "s1" }, { screen: "s6" }],
      },
      { localId: "b", name: "Second half", steps: [{ screen: "s6" }, { screen: "s7" }] },
    ],
  };
  const killPath = write("kill.json", killManifest);
  let victim;
  const killProxy = await faultProxy(h.base, (call) =>
    call.path === "/api/v1/captures" && call.nth === 1
      ? { name: "kill the CLI once this batch lands", after: () => victim.kill("SIGKILL") }
      : undefined,
  );
  closers.push(killProxy.close);
  const killArgs = ["manifest", "publish", killPath, "--batch-size", "2"];
  victim = start(killArgs, { url: killProxy.url });
  const killed = await settle("kill the publish mid-way", killArgs, victim);
  assert.equal(killed.signal, "SIGKILL");
  assert.equal(killed.stdout, "");
  h.record("what the proxy saw before the kill", killProxy.log);
  const [partial] = await h.sql(
    "half a catalog after the kill",
    "SELECT a.id AS appId, (SELECT count(*) FROM screen s WHERE s.app_id = a.id) AS screens, (SELECT count(*) FROM flow f WHERE f.app_id = a.id) AS flows FROM app a WHERE a.name = ?1",
    [killManifest.app.name],
  );
  assert.deepEqual([partial.screens, partial.flows], [4, 0]);
  const resumed = await run("rerun after the kill", ["manifest", "publish", killPath]);
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.equal(resumed.json.ok, true);
  assert.deepEqual(await rows("converged after the kill", partial.appId), {
    screens: 8,
    flows: 2,
    steps: 5,
    views: 0,
  });
  const rerun = await run("and once more", ["manifest", "publish", killPath]);
  assert.deepEqual(rerun.json, resumed.json);

  const faultFiles = await images("fault", 6);
  const faultManifest = {
    version: 1,
    id: `fault-${h.stamp}`,
    app: { name: `Fault ${h.stamp}`, websiteUrl: `https://fault-${h.stamp}.example.com` },
    screens: toScreens(faultFiles),
    flows: [
      { localId: "a", name: "One", steps: [{ screen: "s0" }, { screen: "s1" }] },
      { localId: "b", name: "Two", steps: [{ screen: "s1" }, { screen: "s2" }] },
    ],
  };
  const faultPath = write("fault.json", faultManifest);
  const lossy = await faultProxy(h.base, (call) => {
    if (call.path === "/api/v1/captures" && call.nth === 0) {
      return { name: "the upload lands, the response is lost", drop: true };
    }
    if (call.path === "/api/v1/flows" && call.nth === 0) {
      return {
        name: "503 with retry-after",
        answer: {
          status: 503,
          headers: { "content-type": "application/json", "retry-after": "1" },
          body: JSON.stringify({ error: { code: "unavailable", message: "Try again" } }),
        },
      };
    }
    if (call.path === "/api/v1/flows" && call.nth === 1) {
      return { name: "the flow lands, the response is lost", drop: true };
    }
    return undefined;
  });
  closers.push(lossy.close);
  const started = Date.now();
  const faulted = await run("publish through a bad network", ["manifest", "publish", faultPath], {
    url: lossy.url,
  });
  const elapsed = Date.now() - started;
  h.record("what the proxy did", lossy.log);
  assert.equal(faulted.code, 0, faulted.stderr);
  assert.ok(lossy.log.some((call) => call.action === "503 with retry-after"));
  assert.ok(elapsed > 1000, "waited out the Retry-After");
  assert.equal(
    lossy.log.filter((call) => call.path === "/api/v1/captures").length,
    2,
    "retried once",
  );
  assert.deepEqual(await rows("no duplicates through the faults", faulted.json.app.id), {
    screens: 6,
    flows: 2,
    steps: 4,
    views: 0,
  });

  const badFiles = await images("bad", 4);
  const badPath = join(dir, "bad-1.png");
  writeFileSync(badPath, "this is not an image");
  const badManifest = {
    version: 1,
    id: `bad-${h.stamp}`,
    app: { name: `Bad ${h.stamp}`, websiteUrl: `https://bad-${h.stamp}.example.com` },
    screens: toScreens(badFiles),
    flows: [
      { localId: "needs", name: "Needs it", steps: [{ screen: "s0" }, { screen: "s1" }] },
      { localId: "fine", name: "Doesn't", steps: [{ screen: "s2" }, { screen: "s3" }] },
    ],
  };
  const badManifestPath = write("bad.json", badManifest);
  const refusedValidation = await run(
    "validate finds it",
    ["manifest", "validate", badManifestPath],
    {
      key: null,
    },
  );
  assert.equal(refusedValidation.code, 2);
  assert.equal(refusedValidation.json.issues[0].localId, "s1");
  const bad = await run("publish with a bad item", ["manifest", "publish", badManifestPath]);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /^publish_failed: 1 screens and 1 flows failed/u);
  assert.equal(bad.json.ok, false);
  assert.deepEqual(
    bad.json.screens.map((item) => [item.localId, item.status, item.error?.code]),
    [
      ["s0", "published", undefined],
      ["s1", "failed", "invalid_image"],
      ["s2", "published", undefined],
      ["s3", "published", undefined],
    ],
  );
  assert.deepEqual(
    bad.json.flows.map((item) => [item.localId, item.status, item.error?.code]),
    [
      ["needs", "failed", "screen_failed"],
      ["fine", "published", undefined],
    ],
  );
  writeFileSync(badPath, badFiles[1].buffer);
  const fixed = await run("publish after fixing it", ["manifest", "publish", badManifestPath]);
  assert.equal(fixed.code, 0, fixed.stderr);
  assert.equal(fixed.json.screens[0].id, bad.json.screens[0].id);
  assert.equal(fixed.json.flows[1].id, bad.json.flows[1].id);
  assert.deepEqual(await rows("converged after the fix", fixed.json.app.id), {
    screens: 4,
    flows: 2,
    steps: 4,
    views: 0,
  });

  const manyFiles = await images("many", 52);
  const counting = await faultProxy(h.base, () => undefined);
  closers.push(counting.close);
  const many = await run(
    "publish more screens than one batch holds",
    [
      "manifest",
      "publish",
      write("many.json", {
        version: 1,
        id: `many-${h.stamp}`,
        app: { name: `Many ${h.stamp}`, websiteUrl: `https://many-${h.stamp}.example.com` },
        screens: toScreens(manyFiles),
        flows: [],
      }),
    ],
    { url: counting.url },
  );
  assert.equal(many.code, 0, many.stderr);
  assert.deepEqual(
    h.record(
      "requests per batch",
      counting.log.filter((call) => call.path === "/api/v1/captures").map((call) => call.screens),
    ),
    [50, 2],
  );

  const ownerPage = await h.newPage();
  const owner = await h.signUpMember(ownerPage, "/browse/web", "cli-owner");
  const ownerKey = await memberKey(ownerPage, h, "cli owner");
  keys.add(ownerKey);
  const otherPage = await h.newPage();
  await h.signUpMember(otherPage, "/browse/web", "cli-other");
  const otherKey = await memberKey(otherPage, h, "cli other");
  keys.add(otherKey);
  h.record("two members", { owner: owner.email });

  const memberFiles = await images("member", 4);
  const memberManifest = {
    version: 1,
    id: `member-${h.stamp}`,
    app: { name: `Member ${h.stamp}`, websiteUrl: `https://member-${h.stamp}.example.com` },
    screens: toScreens(memberFiles),
    flows: [{ localId: "f", name: "Member flow", steps: [{ screen: "s0" }, { screen: "s1" }] }],
  };
  const memberPath = write("member.json", memberManifest);
  const pending = await run("a member's publish", ["manifest", "publish", memberPath], {
    key: ownerKey,
  });
  assert.equal(pending.code, 0, pending.stderr);
  assert.ok(pending.json.screens.every((item) => item.status === "pending"));
  assert.ok(pending.json.flows.every((item) => item.status === "pending"));
  const pendingAgain = await run(
    "a member's publish, repeated",
    ["manifest", "publish", memberPath],
    {
      key: ownerKey,
    },
  );
  assert.deepEqual(pendingAgain.json, pending.json);
  assert.deepEqual(await rows("a member's rows", pending.json.app.id), {
    screens: 4,
    flows: 1,
    steps: 2,
    views: 0,
  });
  const [publishedByAdmin] = await h.sql(
    "the admin's are published",
    "SELECT DISTINCT status FROM screen WHERE app_id = ?1",
    [appId],
  );
  assert.equal(publishedByAdmin.status, "published");

  const memberEdit = structuredClone(memberManifest);
  memberEdit.screens[3].title = "Edited while pending";
  const memberEdited = await run(
    "a member edits their pending screen by manifest",
    ["manifest", "publish", write("member-edit.json", memberEdit)],
    { key: ownerKey },
  );
  assert.equal(memberEdited.code, 0, memberEdited.stderr);
  const memberScreen = await run(
    "the pending screen took the edit",
    ["screens", "get", pending.json.screens[3].id],
    { key: ownerKey },
  );
  assert.equal(memberScreen.json.title, "Edited while pending");
  assert.equal(memberScreen.json.status, "pending");

  const target = pending.json.screens[0].id;
  const hidden = await run(
    "another member can't delete a pending screen",
    ["screens", "delete", target],
    {
      key: otherKey,
    },
  );
  assert.equal(hidden.code, 4);
  assert.match(hidden.stderr, /^not_found: /u);
  const approved = await h.api(`review/screen/${target}`, {
    method: "POST",
    body: JSON.stringify({ decision: "approve" }),
  });
  assert.equal(approved.status, 204);
  const forbidden = await run(
    "another member can't delete a published screen",
    ["screens", "delete", target],
    {
      key: otherKey,
    },
  );
  assert.equal(forbidden.code, 3);
  assert.match(forbidden.stderr, /^forbidden: /u);
  const forbiddenFlow = await run(
    "nor their flow, once it's visible",
    ["flows", "delete", pending.json.flows[0].id],
    {
      key: otherKey,
    },
  );
  assert.notEqual(forbiddenFlow.code, 0);
  const [still] = await h.sql(
    "the screen is still there",
    "SELECT count(*) AS n FROM screen WHERE id = ?1",
    [target],
  );
  assert.equal(still.n, 1);

  const stolen = await run("someone else's manifest id", ["manifest", "publish", memberPath], {
    key: otherKey,
  });
  assert.equal(stolen.code, 1);
  assert.equal(stolen.json.flows[0].error.code, "bad_request");
  const [flowsAfter] = await h.sql(
    "no second flow",
    "SELECT count(*) AS n FROM flow WHERE id = ?1",
    [pending.json.flows[0].id],
  );
  assert.equal(flowsAfter.n, 1);

  const pageOne = await run("screens search, page one", [
    "screens",
    "search",
    "--app",
    report.app.slug,
    "--limit",
    "3",
  ]);
  assert.equal(pageOne.json.items.length, 3);
  assert.ok(pageOne.json.nextCursor);
  const pageTwo = await run("screens search, page two", [
    "screens",
    "search",
    "--app",
    report.app.slug,
    "--limit",
    "3",
    "--cursor",
    pageOne.json.nextCursor,
  ]);
  const seenIds = new Set(pageOne.json.items.map((item) => item.id));
  assert.ok(pageTwo.json.items.every((item) => !seenIds.has(item.id)));
  const bad400 = await run("a bad filter", ["screens", "search", "--pattern", "not-a-pattern"]);
  assert.equal(bad400.code, 2);
  assert.match(bad400.stderr, /^bad_request: /u);
  const listed = await run("apps list", ["apps", "list", "--limit", "2"]);
  assert.equal(listed.json.items.length, 2);
  const shown = await run("apps get", ["apps", "get", report.app.slug]);
  assert.equal(shown.json.id, appId);
  const missing = await run("apps get: missing", ["apps", "get", `missing-${h.stamp}`]);
  assert.equal(missing.code, 4);
  const flowsFound = await run("flows search", ["flows", "search", "--app", report.app.slug]);
  assert.equal(flowsFound.json.items.length, 2);
  const whoami = await run("whoami", ["whoami"], { key: ownerKey });
  assert.equal(whoami.json.email, owner.email);

  const uploadFile = write("upload.png", (await h.pngs([`Upload ${h.stamp}`]))[0].buffer);
  const uploaded = await run("upload a file", [
    "upload",
    uploadFile,
    "--app",
    report.app.slug,
    "--title",
    "Uploaded by the CLI",
    "--pattern",
    "pricing",
  ]);
  assert.equal(uploaded.code, 0, uploaded.stderr);
  assert.equal(uploaded.json.status, "published");
  const refusedHttp = await run("upload refuses http", [
    "upload",
    "http://localhost/x.png",
    "--app-name",
    "x",
  ]);
  assert.equal(refusedHttp.code, 2);

  const [hostImage] = await h.pngs([`Hosted ${h.stamp}`]);
  const host = await imageHost(dir, {
    "/hosted.png": hostImage.buffer,
    "/twice.png": (await h.pngs([`Twice ${h.stamp}`]))[0].buffer,
    "/moved.png": "/hosted.png",
    "/to-ftp.png": "ftp://localhost/x.png",
    "/loop0.png": "/loop1.png",
    "/loop1.png": "/loop2.png",
    "/loop2.png": "/loop3.png",
    "/loop3.png": "/loop0.png",
    "/huge.png": Buffer.alloc(16 * 1024 * 1024),
    "/page.png": Buffer.from("<html>"),
  });
  closers.push(host.close);
  ca = host.ca;
  const fromUrl = await run("upload an https URL", [
    "upload",
    host.url("/hosted.png"),
    "--app-name",
    `Hosted ${h.stamp}`,
    "--website-url",
    `https://hosted-${h.stamp}.example.com`,
  ]);
  assert.equal(fromUrl.code, 0, fromUrl.stderr);
  const urlManifest = write("urls.json", {
    version: 1,
    id: `urls-${h.stamp}`,
    app: { name: `Hosted ${h.stamp}`, websiteUrl: `https://hosted-${h.stamp}.example.com` },
    screens: [
      { localId: "a", source: { url: host.url("/hosted.png") }, patterns: [], elements: [] },
      { localId: "b", source: { url: host.url("/twice.png") }, patterns: [], elements: [] },
      { localId: "gone", source: { url: host.url("/gone.png") }, patterns: [], elements: [] },
    ],
  });
  const fromUrls = await run("a manifest of URLs", ["manifest", "publish", urlManifest]);
  assert.equal(fromUrls.code, 1);
  assert.equal(fromUrls.json.screens[0].id, fromUrl.json.id, "the same bytes are the same screen");
  assert.equal(fromUrls.json.screens[1].status, "published");
  assert.equal(fromUrls.json.screens[2].error.code, "source_unreadable");

  // The one download policy, through both CLI ways in: a good redirect, then each refusal.
  const moved = await run("upload follows a redirect", [
    "upload",
    host.url("/moved.png"),
    "--app-name",
    `Hosted ${h.stamp}`,
    "--website-url",
    `https://hosted-${h.stamp}.example.com`,
  ]);
  assert.equal(moved.code, 0, moved.stderr);
  assert.equal(moved.json.id, fromUrl.json.id);
  for (const [path, code, text] of [
    ["/to-ftp.png", "source_unreadable", "must use http or https, not ftp"],
    ["/loop0.png", "source_unreadable", "redirected more than 3 times"],
    ["/huge.png", "source_too_large", "the limit is 15728640"],
    ["/page.png", "invalid_image", "not a complete, still PNG, JPEG or WebP"],
  ]) {
    const refused = await run(`upload refuses ${path}`, [
      "upload",
      host.url(path),
      "--app-name",
      `Hosted ${h.stamp}`,
    ]);
    assert.notEqual(refused.code, 0);
    assert.ok(refused.stderr.includes(text), refused.stderr);
    const manifest = write(`refused${path.replace(/\W/gu, "-")}.json`, {
      version: 1,
      id: `refused-${path.replace(/\W/gu, "-")}-${h.stamp}`,
      app: { name: `Hosted ${h.stamp}` },
      screens: [{ localId: "a", source: { url: host.url(path) }, patterns: [], elements: [] }],
    });
    const report = await run(`a manifest refuses ${path}`, ["manifest", "publish", manifest]);
    assert.equal(report.json.screens[0].error.code, code);
    assert.ok(report.json.screens[0].error.message.includes(text), report.stdout);
  }

  const updated = await run("screens update", [
    "screens",
    "update",
    uploaded.json.id,
    "--title",
    "Edited by the CLI",
    "--tag",
    "one",
    "--tag",
    "two",
  ]);
  assert.equal(updated.code, 0, updated.stderr);
  assert.equal(updated.json.title, "Edited by the CLI");
  assert.deepEqual(updated.json.tags, ["one", "two"]);
  const cleared = await run("screens update with a patch", [
    "screens",
    "update",
    uploaded.json.id,
    "--patch",
    '{"title":null,"tags":[]}',
  ]);
  assert.equal(cleared.json.title, null);
  assert.deepEqual(cleared.json.tags, []);

  const flowArgs = [
    "flows",
    "create",
    "--app",
    report.app.slug,
    "--name",
    "Made by the CLI",
    "--step",
    `${screenId.s0}=Start`,
    "--step",
    uploaded.json.id,
  ];
  const created = await run("flows create", flowArgs);
  assert.equal(created.code, 0, created.stderr);
  const madeId = created.json.id;
  const flowEdit = await run("flows update", [
    "flows",
    "update",
    madeId,
    "--name",
    "Edited flow",
    "--step",
    uploaded.json.id,
    "--step",
    `${screenId.s0}=End`,
  ]);
  assert.equal(flowEdit.code, 0, flowEdit.stderr);
  assert.deepEqual(
    flowEdit.json.steps.map((step) => [step.screen.id, step.label]),
    [
      [uploaded.json.id, null],
      [screenId.s0, "End"],
    ],
  );
  const flowGone = await run("flows delete", ["flows", "delete", madeId]);
  assert.deepEqual(flowGone.json, { deleted: true, id: madeId });
  const flowAbsent = await run("the flow is gone", ["flows", "get", madeId]);
  assert.equal(flowAbsent.code, 4);
  const screenGone = await run("screens delete", ["screens", "delete", uploaded.json.id]);
  assert.equal(screenGone.code, 0);
  const [gone] = await h.sql("the row is gone", "SELECT count(*) AS n FROM screen WHERE id = ?1", [
    uploaded.json.id,
  ]);
  assert.equal(gone.n, 0);

  const local = await h.localMcp({ label: "publish" });
  const remote = await h.remoteMcp();
  assert.ok(!(await remote.listTools()).tools.some((tool) => tool.name === "publish_manifest"));
  const beforeTool = await rows("rows before the tool", appId);
  const tool = await h.call(local, "publish_manifest", "publish_manifest", { path: editedPath });
  assert.equal(tool.isError, false, tool.text);
  const toolReport = JSON.parse(tool.text);
  assert.equal(toolReport.ok, true);
  assert.deepEqual(
    toolReport.flows.map((item) => item.id),
    report.flows.map((item) => item.id),
  );
  assert.deepEqual(await rows("the tool adds no rows", appId), beforeTool);
  const toolMissing = await h.call(local, "publish_manifest: missing", "publish_manifest", {
    path: join(dir, "no-such.json"),
  });
  assert.equal(toolMissing.isError, true);
  assert.match(toolMissing.text, /^invalid_manifest: /u);

  const {
    app: installed,
    tarball,
    manifest: packaged,
  } = await h.packagedMcp({ label: "cli-package" });
  assert.equal(packaged.bin["screen-commons"], "dist/cli.js");
  const bin = join(installed, "node_modules/.bin/screen-commons");
  const version = await run("the installed bin", ["--version"], { bin });
  assert.equal(version.stdout.trim(), packaged.version);
  const outsideFiles = await images("outside", 3);
  const outside = await run(
    "publish from the installed package",
    [
      "manifest",
      "publish",
      write("outside.json", {
        version: 1,
        id: `outside-${h.stamp}`,
        app: { name: `Outside ${h.stamp}`, websiteUrl: `https://outside-${h.stamp}.example.com` },
        screens: toScreens(outsideFiles),
        flows: [{ localId: "f", name: "Outside", steps: [{ screen: "s0" }, { screen: "s2" }] }],
      }),
    ],
    { bin, env: { CWD: installed } },
  );
  assert.equal(outside.code, 0, outside.stderr);
  assert.ok(outside.json.ok);
  const npx = await run(
    "npx -p <tarball> screen-commons",
    ["--yes", "-p", tarball, "screen-commons", "whoami"],
    { bin: "npx", env: { CWD: installed } },
  );
  assert.equal(npx.code, 0, npx.stderr);
  assert.equal(npx.json.role, "admin");

  const output = everything.join("\n");
  for (const key of keys) assert.ok(!output.includes(key), "a key reached the output");
  h.record("no key in any output", { commandsOutputBytes: output.length, keys: keys.size });
}
