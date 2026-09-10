import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../extension/lib/notes.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const { normalizeNotes } = context.PiBrowserNotes;

test("migrates legacy note IDs and preserves monotonic numerical IDs", () => {
  const result = structuredClone(normalizeNotes([
    { id: "legacy-uuid", comment: "old" },
    { id: 4, comment: "numbered" },
    { id: 4, comment: "duplicate" },
  ], 9));

  assert.deepEqual(result.notes.map((note) => note.id), [5, 4, 6]);
  assert.equal(result.nextId, 9);
});

test("starts empty note collections at one", () => {
  const result = structuredClone(normalizeNotes([], undefined));
  assert.deepEqual(result, { notes: [], nextId: 1 });
});

test("deleted numerical IDs cannot be resurrected by stale notes", () => {
  const result = structuredClone(normalizeNotes([
    { id: 3, comment: "keep" },
    { id: 4, comment: "stale deleted note" },
  ], 5, [4]));

  assert.deepEqual(result.notes, [{ id: 3, comment: "keep" }]);
  assert.equal(result.nextId, 5);
});
