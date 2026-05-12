import { pathToFileURL } from "node:url";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const [command] = argv;

  if (command === "version" || command === "--version" || command === "-v") {
    console.log("kai-code-agent 0.0.0");
    return;
  }

  console.log(
    "Kai Code Agent scaffold is ready. Start with code-agent-roadmap/stages/stage-01-minimal-loop.md.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

