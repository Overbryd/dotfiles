(() => {
  "use strict";

  function validId(value) {
    return Number.isInteger(value) && value > 0;
  }

  function deletedIdSet(values) {
    return new Set((Array.isArray(values) ? values : []).filter(validId));
  }

  function withoutDeletedNotes(values, deletedIds) {
    const deleted = deletedIdSet(deletedIds);
    return (Array.isArray(values) ? values : []).filter((note) => !deleted.has(note?.id));
  }

  function normalizeNotes(values, storedNextId, deletedIds = []) {
    const input = withoutDeletedNotes(values, deletedIds);
    const reserved = new Set(input.map((note) => note?.id).filter(validId));
    const used = new Set();
    let cursor = Math.max(0, ...reserved) + 1;

    const notes = input.map((note) => {
      let id = note?.id;
      if (!validId(id) || used.has(id)) {
        while (reserved.has(cursor) || used.has(cursor)) cursor += 1;
        id = cursor;
        cursor += 1;
      }
      used.add(id);
      return { ...note, id };
    });

    const nextId = Math.max(
      validId(storedNextId) ? storedNextId : 1,
      Math.max(0, ...used) + 1,
      cursor,
    );
    return { notes, nextId };
  }

  globalThis.PiBrowserNotes = { deletedIdSet, normalizeNotes, withoutDeletedNotes };
})();
