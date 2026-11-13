// dist/cjs holds CommonJS files inside a "type": "module" package: this marks the folder as CommonJS
import { writeFileSync } from "node:fs";

writeFileSync(new URL("../dist/cjs/package.json", import.meta.url), JSON.stringify({ type: "commonjs" }) + "\n");
