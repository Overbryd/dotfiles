import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../extension/lib/phoenix-source.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const { applyPhoenixComment, parsePhoenixComment } = context.PiPhoenixSource;

test("parses Phoenix component, caller, and closing annotations", () => {
  assert.deepEqual(
    structuredClone(parsePhoenixComment("<BWeb.StorefrontComponents.product_grid> lib/blickwinkel_web/components/storefront_components.ex:105 (blickwinkel_web)")),
    {
      type: "open",
      name: "BWeb.StorefrontComponents.product_grid",
      definedAt: {
        path: "lib/blickwinkel_web/components/storefront_components.ex",
        line: 105,
        application: "blickwinkel_web",
      },
    },
  );

  assert.deepEqual(
    structuredClone(parsePhoenixComment("@caller lib/blickwinkel_web/controllers/page_html/storefront.html.heex:71 (blickwinkel_web)")),
    {
      type: "caller",
      calledFrom: {
        path: "lib/blickwinkel_web/controllers/page_html/storefront.html.heex",
        line: 71,
        application: "blickwinkel_web",
      },
    },
  );

  assert.deepEqual(
    structuredClone(parsePhoenixComment("</BWeb.StorefrontComponents.product_grid>")),
    { type: "close", name: "BWeb.StorefrontComponents.product_grid" },
  );
});

test("associates @caller with the following component range", () => {
  const state = { stack: [], pendingCaller: null };
  applyPhoenixComment(state, "@caller lib/page.html.heex:71 (my_app)");
  applyPhoenixComment(state, "<MyApp.Components.grid> lib/components.ex:105 (my_app)");

  assert.equal(state.stack.length, 1);
  assert.equal(state.stack[0].definedAt.line, 105);
  assert.equal(state.stack[0].calledFrom.line, 71);

  applyPhoenixComment(state, "</MyApp.Components.grid>");
  assert.equal(state.stack.length, 0);
});
