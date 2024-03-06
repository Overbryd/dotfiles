local gen = require('gen')

gen.setup({
  model = 'deepseek-coder:6.7b',
  display_mode = 'split',
})

vim.keymap.set({ 'n', 'v' }, '<leader>ai', ':Gen<CR>')

-- Note: available replacements
-- $text
--

gen.prompts['UltiSnips'] = {
  prompt = "Write a UltiSnips snippet, generalizing the necessary parts in the following code:\n$text",
  replace = false,
}

