import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import {
  adaptMcpTools,
  createProfileToolRegistry,
  formatToolResultForModel,
  HumanInteractionManager,
  loadMcpConfig,
  main,
  McpAdapterError,
  McpClientError,
  McpClientManager,
  mcpToolName,
  normalizeMcpToolResult,
  openSqliteSessionStore,
  replaySessionPlain,
  applyTurnEvent,
  createTurnRendererState,
  renderPlainUiEvent,
  runTool,
  summarizeToolUse,
  ToolRegistry,
  type ExecutableToolUse,
  type JsonObject,
  type McpServerConfig,
  type McpToolDefinition,
} from "../src/index.js";

const tempDirs: string[] = [];
const hasBun = "Bun" in globalThis;
const bunIt = hasBun ? it : it.skip;

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("stage-09 MCP client", () => {
  it("loads merged MCP settings, skips disabled servers, and redacts invalid config", async () => {
    const cwd = await tempDir();
    const home = await tempDir();
    await mkdir(path.join(home, ".kai-code-agent"), { recursive: true });
    await mkdir(path.join(cwd, ".kai"), { recursive: true });
    await writeJson(path.join(home, ".kai-code-agent", "settings.json"), {
      mcpServers: {
        fixture: {
          command: "bad-command",
          args: ["bad"],
          env: { TOKEN: "user-secret" },
          approval: "ask",
        },
        disabled: {
          command: "disabled-command",
          enabled: false,
        },
      },
    });
    await writeJson(path.join(cwd, ".kai", "settings.json"), {
      mcpServers: {
        fixture: fixtureServerSettings({ approval: "allow" }),
        invalid: {
          command: "bad",
          approval: "never",
          env: { TOKEN: "project-secret" },
        },
      },
    });
    await writeJson(path.join(cwd, ".kai", "settings.local.json"), {
      mcpServers: {
        fixture: {
          env: { TOKEN: "local-secret" },
        },
      },
    });

    const loaded = await loadMcpConfig({ cwd, homeDir: home });

    expect(loaded.servers).toHaveLength(1);
    expect(loaded.servers[0]).toMatchObject({
      name: "fixture",
      command: process.execPath,
      approval: "allow",
      env: { TOKEN: "local-secret" },
    });
    expect(loaded.servers.some((server) => server.name === "disabled")).toBe(false);
    expect(loaded.errors).toHaveLength(1);
    expect(loaded.errors[0]?.message).toContain("invalid");
    expect(loaded.errors[0]?.message).not.toContain("project-secret");
  });

  it("lists and calls a fixture MCP server through the stdio client manager", async () => {
    const cwd = await tempDir();
    const manager = new McpClientManager({
      cwd,
      servers: [fixtureServerConfig({ approval: "allow" })],
    });

    try {
      const tools = await manager.listTools("fixture");
      expect(tools.map((tool) => tool.name)).toContain("echo");

      const rawResult = await manager.callTool("fixture", "echo", { message: "hello" });
      const result = normalizeMcpToolResult({ serverName: "fixture", toolName: "echo", result: rawResult });
      expect(result.ok).toBe(true);
      expect(result.output).toBe("echo: hello");
    } finally {
      await manager.closeAll();
    }
  });

  it("normalizes failed MCP startup as a client error", async () => {
    const manager = new McpClientManager({
      servers: [{
        name: "broken",
        command: "kai-missing-mcp-command-for-test",
        args: [],
        env: {},
        approval: "allow",
        enabled: true,
      }],
    });

    await expect(manager.listTools("broken")).rejects.toBeInstanceOf(McpClientError);
    await manager.closeAll();
  });

  it("adapts MCP tools with namespacing, schemas, approval, collision checks, and bounded results", async () => {
    const cwd = await tempDir();
    const calls: Array<{ serverName: string; toolName: string; input: JsonObject }> = [];
    const clientManager = {
      async callTool(serverName: string, toolName: string, input: JsonObject) {
        calls.push({ serverName, toolName, input });
        if (toolName === "large") {
          return { content: [{ type: "text", text: "x".repeat(15_000) }] };
        }
        if (toolName === "image") {
          return { content: [{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }] };
        }
        return { content: [{ type: "text", text: `echo: ${String(input.message ?? "")}` }] };
      },
    };
    const toolDefs: McpToolDefinition[] = [
      {
        name: "echo",
        description: "Echo",
        inputSchema: { type: "object", properties: { message: { type: "string" } } },
      },
      {
        name: "large",
        description: "Large",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "image",
        description: "Image",
        inputSchema: { type: "object", properties: {} },
      },
    ];
    const adapted = adaptMcpTools({
      server: fixtureServerConfig({ approval: "allow" }),
      tools: toolDefs,
      clientManager,
    });

    expect(adapted[0]?.name).toBe("mcp__fixture__echo");
    expect(adapted[0]?.tool.parameters).toMatchObject({ properties: { message: { type: "string" } } });
    const registry = new ToolRegistry(adapted.map((tool) => tool.tool));
    const echo = await runTool(registry, toolUse("mcp__fixture__echo", { message: "ok" }), context(cwd));
    expect(echo.ok).toBe(true);
    expect(echo.output).toBe("echo: ok");
    expect(calls).toHaveLength(1);

    const large = await runTool(registry, toolUse("mcp__fixture__large", {}), context(cwd));
    const formatted = formatToolResultForModel("mcp__fixture__large", large);
    expect(formatted.length).toBeLessThanOrEqual(6100);
    expect(formatted).toContain("[truncated");

    const image = await runTool(registry, toolUse("mcp__fixture__image", {}), context(cwd));
    expect(image.output).toContain("[image image/png");
    expect(formatToolResultForModel("mcp__fixture__image", image)).not.toContain("aW1hZ2U=");

    const rejectedCalls: JsonObject[] = [];
    const rejected = adaptMcpTools({
      server: fixtureServerConfig({ approval: "reject" }),
      tools: [toolDefs[0]!],
      clientManager: {
        async callTool(_serverName: string, _toolName: string, input: JsonObject) {
          rejectedCalls.push(input);
          return { content: [{ type: "text", text: "should not execute" }] };
        },
      },
    })[0]!;
    const rejectedResult = await runTool(new ToolRegistry([rejected.tool]), toolUse(rejected.name, { message: "no" }), context(cwd));
    expect(rejectedResult.ok).toBe(false);
    expect(rejectedResult.error?.kind).toBe("permission");
    expect(rejectedCalls).toHaveLength(0);

    const manager = new HumanInteractionManager();
    manager.onRequest((request) => {
      if (request.type === "approval") {
        manager.resolveApproval(request.id, false);
      }
    });
    const denied = adaptMcpTools({
      server: fixtureServerConfig({ approval: "ask" }),
      tools: [toolDefs[0]!],
      clientManager,
      humanInteractionManager: manager,
    })[0]!;
    const deniedResult = await runTool(new ToolRegistry([denied.tool]), toolUse(denied.name, { message: "deny" }), context(cwd));
    expect(deniedResult.ok).toBe(false);
    expect(deniedResult.error?.kind).toBe("permission");

    expect(() => adaptMcpTools({
      server: fixtureServerConfig({ approval: "allow" }),
      tools: [
        { name: "dupe tool", inputSchema: { type: "object", properties: {} } },
        { name: "dupe_tool", inputSchema: { type: "object", properties: {} } },
      ],
      clientManager,
    })).toThrow(McpAdapterError);
  });

  it("composes dynamic MCP tools into build profile and excludes them from plan profile", () => {
    const mcpTool = adaptMcpTools({
      server: fixtureServerConfig({ approval: "allow" }),
      tools: [{ name: "echo", inputSchema: { type: "object", properties: {} } }],
      clientManager: { async callTool() { return { content: [{ type: "text", text: "ok" }] }; } },
    })[0]!.tool;

    const defaultRegistry = createProfileToolRegistry({ profileName: "build", externalTools: [mcpTool] });
    const planRegistry = createProfileToolRegistry({ profileName: "plan", externalTools: [mcpTool] });

    expect(defaultRegistry.providerSchemas().map((schema) => schema.function.name)).toContain("mcp__fixture__echo");
    expect(planRegistry.providerSchemas().map((schema) => schema.function.name)).not.toContain("mcp__fixture__echo");
  });

  it("summarizes MCP tool use without exposing raw argument JSON as the title", () => {
    const summary = summarizeToolUse(toolUse("mcp__fixture__echo", { message: "hello" }));
    expect(summary).toMatchObject({
      title: "MCP fixture/echo",
      detail: "{\"message\":\"hello\"}",
    });
    expect(mcpToolName("Fixture Server", "Echo Tool")).toBe("mcp__fixture_server__echo_tool");

    const stdout = createWritableCollector();
    const stderr = createWritableCollector();
    renderPlainUiEvent({ type: "tool_start", id: "call_mcp", name: "mcp__fixture__echo", summary }, {
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    expect(stdout.output()).toBe("");
    expect(stderr.output()).toContain("[tool] MCP fixture/echo");

    const inkState = applyTurnEvent(createTurnRendererState(), {
      type: "tool_start",
      id: "call_mcp",
      name: "mcp__fixture__echo",
      summary,
    });
    expect(inkState.tools[0]?.summary.title).toBe("MCP fixture/echo");
  });

  it("runs CLI mcp list and fixture provider MCP tool calls", async () => {
    const cwd = await tempDir();
    const home = await tempDir();
    await writeMcpSettings(cwd, { approval: "allow" });
    const listOut = createWritableCollector();
    const runOut = createWritableCollector();
    const runErr = createWritableCollector();

    await main(["mcp", "list"], { cwd, env: { HOME: home }, stdout: listOut.stream });
    expect(listOut.output()).toContain("fixture\tapproval=allow");
    expect(listOut.output()).toContain("mcp__fixture__echo");

    await main([
      "run",
      "--provider",
      "fixture",
      "--script",
      path.join(process.cwd(), "fixtures/provider/mcp-echo.json"),
      "call echo tool",
    ], { cwd, env: { HOME: home }, stdout: runOut.stream, stderr: runErr.stream });
    expect(runOut.output()).toBe("MCP echo completed.\n");
  });

  bunIt("records MCP tool results in sessions without replaying raw transport objects", async () => {
    const cwd = await tempDir();
    const home = await tempDir();
    const dbPath = path.join(cwd, "sessions.sqlite");
    const stdout = createWritableCollector();
    const stderr = createWritableCollector();
    await writeMcpSettings(cwd, { approval: "allow" });

    await main([
      "run",
      "--provider",
      "fixture",
      "--script",
      path.join(process.cwd(), "fixtures/provider/mcp-echo.json"),
      "--session",
      "new",
      "call echo tool",
    ], {
      cwd,
      env: { HOME: home },
      stdout: stdout.stream,
      stderr: stderr.stream,
      sessionDbPath: dbPath,
    });

    const sessionId = /Session: ([^\n]+)/.exec(stderr.output())?.[1];
    expect(sessionId).toBeTruthy();
    const store = await openSqliteSessionStore(dbPath);
    try {
      const loaded = store.loadSession(sessionId!);
      expect(loaded).toBeTruthy();
      const replay = replaySessionPlain(loaded!);
      expect(replay).toContain("mcp__fixture__echo ok: echo: stage09");
      expect(replay).not.toContain("\"content\"");
      expect(replay).not.toContain("aW1hZ2U=");
    } finally {
      store.close();
    }
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kai-stage09-test-"));
  tempDirs.push(dir);
  return dir;
}

async function writeMcpSettings(cwd: string, options: { approval: "allow" | "ask" | "reject" }): Promise<void> {
  await mkdir(path.join(cwd, ".kai"), { recursive: true });
  await writeJson(path.join(cwd, ".kai", "settings.json"), {
    mcpServers: {
      fixture: fixtureServerSettings(options),
    },
  });
}

function fixtureServerSettings(options: { approval: "allow" | "ask" | "reject" }): JsonObject {
  return {
    command: process.execPath,
    args: [path.join(process.cwd(), "fixtures/mcp/fixture-server.mjs")],
    approval: options.approval,
  };
}

function fixtureServerConfig(options: { approval: "allow" | "ask" | "reject" }): McpServerConfig {
  return {
    name: "fixture",
    command: process.execPath,
    args: [path.join(process.cwd(), "fixtures/mcp/fixture-server.mjs")],
    env: {},
    approval: options.approval,
    enabled: true,
  };
}

function toolUse(name: string, input: Record<string, unknown>): ExecutableToolUse {
  return { id: `call_${name}`, name, input: input as ExecutableToolUse["input"] };
}

function context(cwd: string) {
  return {
    cwd,
    signal: new AbortController().signal,
    sessionId: "test-session",
    toolCallId: "test-call",
    emit() {
      return undefined;
    },
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createWritableCollector(): {
  stream: Writable;
  output(): string;
} {
  let text = "";
  return {
    stream: new Writable({
      write(chunk, _encoding, callback) {
        text += chunk.toString();
        callback();
      },
    }),
    output() {
      return text;
    },
  };
}
