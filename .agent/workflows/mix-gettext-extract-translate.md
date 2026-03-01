---
description: Extract translation strings and translate untranslated msg strings locales
---

Run `mix gettext.extract --merge` and go through all language files.
For each msgstr which is empty find an appropriate translation for the given language/locale.
Translations are in `.po` files.
If unsure, please ask about the context, otherwise proceed.