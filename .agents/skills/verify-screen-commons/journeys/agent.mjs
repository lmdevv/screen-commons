import assert from "node:assert/strict";

const PROMPT = "How does Fixture Tunes let users create a playlist?";
const STEPS = [
  {
    title: "Your Library",
    stepLabel: "Open Your Library",
    body: `<h1>Your Library <button>+</button></h1><ul><li>Liked Songs</li><li>Road trip</li><li>Focus</li></ul>`,
  },
  {
    title: "Your Library menu",
    stepLabel: "Tap the plus button",
    body: `<h1>Your Library</h1><div class="sheet"><p>Create</p><ul><li><b>Playlist</b> Build a playlist with songs</li><li>Blend</li></ul></div>`,
  },
  {
    title: "New playlist",
    stepLabel: "Name the playlist and tap Create",
    body: `<h1>Give your playlist a name</h1><input value="My playlist #4"><p><button>Create</button></p>`,
  },
];

async function render(page, { body }, scale) {
  await page.setViewportSize({ width: 1440 * scale, height: 900 * scale });
  await page.setContent(`<body style="margin:0;zoom:${scale};font:28px system-ui;background:#121212;color:#fff">
    <main style="padding:64px;height:900px;box-sizing:border-box">${body}</main>
    <style>button{font:inherit;border-radius:999px;padding:8px 28px;background:#1ed760;border:0}
    li{padding:16px 0;list-style:none}.sheet{background:#282828;border-radius:24px;padding:24px 48px}
    input{font:inherit;padding:16px;width:640px}</style></body>`);
  return (await page.screenshot({ type: "png" })).toString("base64");
}

async function playlistFlow(h) {
  const findFlow = () =>
    h.sql(
      "the Fixture Tunes playlist flow",
      `SELECT flow.id FROM flow JOIN app ON app.id = flow.app_id
       WHERE app.slug = 'fixture-tunes' AND flow.name = 'Creating a playlist' AND flow.status = 'published'`,
    );
  const [existing] = await findFlow();
  if (existing) return existing.id;
  const page = await h.newPage();
  const screens = [];
  for (const step of STEPS) {
    screens.push({
      title: step.title,
      stepLabel: step.stepLabel,
      text: `${step.title}. ${step.stepLabel}.`,
      width: 1440,
      height: 900,
      image: { type: "image/png", base64: await render(page, step, 1) },
      thumbnail: { type: "image/png", base64: await render(page, step, 0.5) },
    });
  }
  const { status, body } = await h.api("captures", {
    method: "POST",
    body: JSON.stringify({
      app: {
        slug: "fixture-tunes",
        name: "Fixture Tunes",
        websiteUrl: "https://fixture-tunes.example",
        category: "entertainment",
        tagline: "Music for verification runs",
      },
      flow: { name: "Creating a playlist", type: "creating" },
      source: "upload",
      screens,
    }),
  });
  assert.equal(status, 201, `publishing the playlist flow: ${JSON.stringify(body)}`);
  assert.equal(body.flow.status, "published");
  const [created] = await findFlow();
  return created.id;
}

export default async function agent(h) {
  const flowId = await playlistFlow(h);

  const session = await h.agent({
    client: process.env.SC_AGENT_CLIENT ?? "claude",
    prompt: PROMPT,
  });
  h.record("what the agent did", {
    exitCode: session.exitCode,
    stopped: session.stopped,
    toolCalls: session.toolCalls,
    answer: session.answer,
  });
  assert.equal(session.stopped, null, `the agent ran to the end: ${session.stopped}`);
  assert.equal(session.exitCode, 0, "the agent exited 0");
  const tools = session.toolCalls.map(({ tool }) => tool);
  const searched = tools.indexOf("search_flows");
  assert.ok(searched >= 0, `the agent called search_flows: ${tools.join(", ")}`);
  assert.ok(
    session.toolCalls
      .slice(searched + 1)
      .some(
        ({ tool, arguments: args }) => tool === "get_flow" && JSON.stringify(args).includes(flowId),
      ),
    `the agent then opened the playlist flow ${flowId} with get_flow: ${tools.join(", ")}`,
  );
  assert.match(session.answer ?? "", /playlist/iu, "the answer is about playlists");

  const rest = await h.api("screens?limit=5");
  const mcp = await h.mcp("tools/list");
  const rows = { rest: rest.headers["x-sc-d1-rows"], mcp: mcp.headers["x-sc-d1-rows"] };
  h.record("x-sc-d1-rows on REST and MCP", { counter: h.d1Counter, rows });
  if (h.d1Counter) {
    assert.ok(Number(rows.rest) > 0, "a REST read reports the D1 rows it read");
    assert.ok(rows.mcp !== undefined, "an MCP response carries the header too");
  } else {
    assert.deepEqual(rows, { rest: undefined, mcp: undefined }, "no header without the counter");
  }
}
