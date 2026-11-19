-- Run from the repository root: nvim --headless '+luafile .config/nvim/tests/treesitter.lua'
local ok, err = xpcall(function()
  for _, case in ipairs({
    { '<script type="application/json">{"ok":true}</script>', 'json' },
    { '<script type="module">const ok = true;</script>', 'javascript' },
    { '<style>body { color: red; }</style>', 'css' },
  }) do
    vim.cmd('enew!')
    vim.api.nvim_buf_set_lines(0, 0, -1, false, { case[1] })
    vim.bo.filetype = 'html'
    vim.treesitter.start()
    local parser = vim.treesitter.get_parser(0)
    parser:parse(true)
    assert(parser:children()[case[2]], 'Missing injected language: ' .. case[2])
    assert(vim.treesitter.highlighter.active[vim.api.nvim_get_current_buf()])
  end

  vim.cmd('enew!')
  vim.api.nvim_buf_set_lines(0, 0, -1, false, { 'local JSON = true' })
  vim.bo.filetype = 'lua'
  local root = vim.treesitter.get_parser(0):parse(true)[1]:root()
  local query = vim.treesitter.query.parse('lua', [[
    ((identifier) @name
      (#kind-eq? @name "identifier")
      (#nth? @name 0)
      (#downcase! @name))
  ]])
  local found = false
  for id, _, metadata in query:iter_captures(root, 0) do
    assert(metadata[id].text == 'json', 'Legacy downcase directive failed')
    found = true
  end
  assert(found, 'Legacy predicates did not match')

  if vim.fn.has('nvim-0.12') == 1 then
    local api = vim.treesitter.query
    api.add_predicate('dotfiles-list?', function(match, _, _, predicate)
      assert(type(match[predicate[2]]) == 'table', 'Native predicate API was changed')
      return true
    end, { force = true })
    api.add_directive('dotfiles-list!', function(match, _, _, predicate)
      assert(type(match[predicate[2]]) == 'table', 'Native directive API was changed')
    end, { force = true })
    query = api.parse('lua', '((identifier) @name (#dotfiles-list? @name) (#dotfiles-list! @name))')
    assert(query:iter_captures(root, 0)(), 'Native query callbacks did not run')
  end
end, debug.traceback)

if not ok then
  io.stderr:write(err .. '\n')
  vim.cmd('cquit 1')
end
print('Tree-sitter injection and highlighting tests passed')
vim.cmd('qa!')
