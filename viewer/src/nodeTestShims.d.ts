// Tests run in Node but the project has no @types/node; declare the calls they use.
declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
  /** Without an encoding Node returns a Buffer, which is a Uint8Array. */
  export function readFileSync(path: URL): Uint8Array;
  export function existsSync(path: URL): boolean;
}
