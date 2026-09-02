import { BaseService, type Validator } from "./base.js";

// @ts-expect-error This intentionally missing package exercises external nodes.
import { unavailable } from "missing-package";

export { BaseService as PublicBase } from "./base.js";
export * as baseNamespace from "./base.js";
export * from "./empty.js";
export * from "./unsupported.js";
// @ts-expect-error The root test build does not apply this fixture's path mapping.
export * from "external-package";
// @ts-expect-error This intentionally missing package exercises external re-exports.
export { externalValue } from "missing-reexport";

class DefaultService {}

export default DefaultService;

class ConstructedService {}
const ConstructorAlias = ConstructedService;

export function makeAliasedService(): ConstructedService {
  return new ConstructorAlias();
}

export class Service extends BaseService implements Validator {
  override validate(): boolean {
    return super.validate();
  }

  run(): boolean {
    const base = new BaseService();
    unavailable();
    return base.validate();
  }
}

export function callComputed(
  target: Record<string, () => unknown>,
  name: string,
): unknown {
  return target[name]?.();
}

export async function loadBase() {
  return import("./base.js");
}
