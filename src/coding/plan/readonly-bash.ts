const READONLY_COMMANDS = new Set([
  "cat",
  "find",
  "git",
  "grep",
  "head",
  "ls",
  "pwd",
  "rg",
  "sed",
  "tail",
  "wc",
]);

const MUTATING_TOKENS = /(?:^|\s)(?:>|>>|<<?|rm|mv|cp|touch|mkdir|rmdir|chmod|chown|dd|tee|python|python3|node|bun|npm|pnpm|yarn|curl|wget|ssh|git\s+(?:add|apply|checkout|clean|commit|merge|pull|push|rebase|reset|restore|switch|write-tree)|sed\s+-i)(?:\s|$)/;
const SHELL_CONTROL = /[;&|`$()]/;

export function isReadonlyBashCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed || SHELL_CONTROL.test(trimmed) || MUTATING_TOKENS.test(trimmed)) {
    return false;
  }
  const [first = "", second = ""] = trimmed.split(/\s+/);
  if (!READONLY_COMMANDS.has(first)) {
    return false;
  }
  if (first === "git") {
    return ["status", "diff", "log", "show", "grep"].includes(second);
  }
  return true;
}
