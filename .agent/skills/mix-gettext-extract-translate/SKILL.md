---
name: mix-gettext-extract-translate
description: Extract Gettext strings and translate empty locale messages.
disable-model-invocation: true
---

Run `mix gettext.extract --merge` and go through all language files.
For each msgstr which is empty find an appropriate translation for the given language/locale.
Translations are in `.po` files.
If unsure, please ask about the context, otherwise proceed.