# screen-commons-mcp

The local [Model Context Protocol](https://modelcontextprotocol.io) server for [Screen Commons](https://github.com/lmdevv/screen-commons), an open-source UI reference library. It runs next to your agent over stdio and exposes:

- **Catalog tools** with the same names, arguments and results as an instance's remote `/mcp` server: search screens and flows, view images, upload screens as base64, a URL or a local file path, create flows, and edit or delete what you contributed.
- **Browser tools** that navigate, screenshot, crawl and capture sites, through your real browser with the Screen Commons extension, or through headless Chromium.

## Use it

Create an API key in **Settings → API keys** on your instance, then add the server to your MCP client:

```json
{
  "mcpServers": {
    "screen-commons": {
      "command": "npx",
      "args": ["-y", "screen-commons-mcp"],
      "env": {
        "SCREEN_COMMONS_URL": "https://your-instance.example.com",
        "SCREEN_COMMONS_API_KEY": "sc_…"
      }
    }
  }
}
```

The browser tools need Chrome or Chromium installed; set `CHROME_PATH` if it isn't found automatically. Node.js 20.18.1 or newer is required. Run `npx screen-commons-mcp --help` for every option.

See the [MCP documentation](https://github.com/lmdevv/screen-commons/blob/main/apps/web/content/docs/mcp.md) for the tool reference and extension pairing.

## License

Apache-2.0
