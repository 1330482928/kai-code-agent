import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const mode = process.env.KAI_MCP_FIXTURE_MODE ?? "normal";

const server = new McpServer({
  name: "kai-fixture-mcp",
  version: "0.0.0",
});

if (mode === "collision") {
  server.registerTool("dupe tool", {
    description: "First colliding fixture tool",
    inputSchema: {},
  }, async () => ({
    content: [{ type: "text", text: "first" }],
  }));
  server.registerTool("dupe_tool", {
    description: "Second colliding fixture tool",
    inputSchema: {},
  }, async () => ({
    content: [{ type: "text", text: "second" }],
  }));
} else {
  server.registerTool("echo", {
    description: "Echo a message from the fixture MCP server",
    inputSchema: {
      message: z.string().optional(),
    },
  }, async ({ message }) => ({
    content: [{ type: "text", text: `echo: ${message ?? ""}` }],
  }));

  server.registerTool("large", {
    description: "Return a large text payload",
    inputSchema: {},
  }, async () => ({
    content: [{ type: "text", text: "x".repeat(15_000) }],
  }));

  server.registerTool("fail", {
    description: "Return an MCP error result",
    inputSchema: {},
  }, async () => ({
    content: [{ type: "text", text: "fixture failure" }],
    isError: true,
  }));

  server.registerTool("image", {
    description: "Return non-text content",
    inputSchema: {},
  }, async () => ({
    content: [{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }],
  }));
}

const transport = new StdioServerTransport();
await server.connect(transport);
