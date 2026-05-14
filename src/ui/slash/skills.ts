import type { SkillCatalogEntry } from "../../skills/index.js";
import type { CommandEntry } from "../command-registry.js";

export function createSkillSlashCommands(entries: readonly SkillCatalogEntry[]): CommandEntry[] {
  return entries.map((entry) => {
    const commandName = skillSlashCommandName(entry);
    return {
      name: commandName,
      description: entry.description,
      usage: `/${commandName} <prompt>`,
      run(args) {
        const text = args.join(" ").trim();
        return {
          type: "prompt_submission" as const,
          submission: {
            text,
            metadata: {
              slashCommand: `/${commandName}`,
              requestedSkillName: commandName,
            },
          },
        };
      },
    };
  });
}

export function skillSlashCommandName(entry: Pick<SkillCatalogEntry, "normalizedName">): string {
  return entry.normalizedName;
}
