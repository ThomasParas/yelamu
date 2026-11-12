// Tests run in Node but the project has no @types/node; declare the one call they use.
declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
}
