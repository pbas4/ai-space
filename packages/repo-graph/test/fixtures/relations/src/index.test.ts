import test from "node:test";

import { Service } from "./index.js";

function localHelper(): void {}

test("service runs", () => {
  localHelper();
  new Service().run();
});
