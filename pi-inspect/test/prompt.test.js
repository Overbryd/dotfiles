import assert from "node:assert/strict";
import test from "node:test";
import { formatAnnotationPrompt } from "../pi-extension/prompt.js";

test("formats compact source-aware browser feedback", () => {
  const prompt = formatAnnotationPrompt([
    {
      id: 3,
      comment: "The cards need more space.",
      reference: {
        label: "product grid",
        selector: "[data-product-tilt-field]",
        phoenix: [{
          name: "BWeb.StorefrontComponents.product_grid",
          definedAt: { path: "lib/components.ex", line: 105 },
          calledFrom: { path: "lib/storefront.html.heex", line: 71 },
        }],
      },
    },
  ], { title: "Store", url: "http://localhost:4000", viewport: { width: 1280, height: 720 } });

  assert.match(prompt, /Note #3/);
  assert.match(prompt, /Defined at: lib\/components\.ex:105/);
  assert.match(prompt, /Called from: lib\/storefront\.html\.heex:71/);
  assert.match(prompt, /browser_inspect/);
});
