local gen = require('gen')

gen.setup({
  model = 'deepseek-coder:6.7b',
  display_mode = 'split',
})

vim.keymap.set({ 'n', 'v' }, '<leader>ai', ':Gen<CR>')

-- gen.prompts['Prompt_Name'] = {
--   'prompt' = "Do something nice with this text:\n$text",
--   replace = true
-- }

