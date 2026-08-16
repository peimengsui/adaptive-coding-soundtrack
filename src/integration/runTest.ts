import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, "../..");
  const extensionTestsPath = path.resolve(__dirname, "suite", "index");
  const testWorkspace = path.resolve(extensionDevelopmentPath, "test-fixture");

  await runTests({
    version: process.env.VSCODE_TEST_VERSION ?? "stable",
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [testWorkspace, "--disable-extensions", "--disable-workspace-trust"],
  });
}

void main().catch((error: unknown) => {
  console.error("Extension Host tests failed", error);
  process.exitCode = 1;
});
