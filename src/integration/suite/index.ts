import * as fs from "node:fs";
import * as path from "node:path";
import Mocha from "mocha";

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", color: true, timeout: 20_000 });
  const testsRoot = __dirname;
  for (const filename of fs.readdirSync(testsRoot).filter((file) => file.endsWith(".test.js"))) {
    mocha.addFile(path.resolve(testsRoot, filename));
  }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => failures > 0 ? reject(new Error(`${failures} test(s) failed`)) : resolve());
  });
}
