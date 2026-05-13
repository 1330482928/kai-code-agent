import { createContextItem, type ContextItem } from "../context/items.js";

export function buildBaseContextItems(): ContextItem[] {
  return [
    createContextItem({
      id: "base:kai-code-agent",
      kind: "base",
      source: "kai.static",
      priority: 0,
      sticky: true,
      cacheStable: true,
      content: [
        "You are Kai Code Agent, a pragmatic coding agent running in a local workspace.",
        "Use tools through the provided tool protocol and keep hidden thinking out of visible text.",
        "Respect the active profile, transcript-first session facts, and user instructions.",
      ].join("\n"),
    }),
  ];
}
