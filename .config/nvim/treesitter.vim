lua <<EOF
-- Neovim 0.12 removed all=false support; adapt the legacy plugin's callbacks
-- while registering them, then restore the native query API.
if vim.fn.has('nvim-0.12') == 1 then
  local query = vim.treesitter.query
  local registrations = { add_predicate = query.add_predicate, add_directive = query.add_directive }
  for name, register in pairs(registrations) do
    query[name] = function(predicate, handler, opts)
      if type(opts) == 'table' and opts.all == false then
        local legacy_handler = handler
        handler = function(match, ...)
          local nodes = {}
          for id, captures in pairs(match) do
            nodes[id] = captures[#captures]
          end
          return legacy_handler(nodes, ...)
        end
      end
      return register(predicate, handler, opts)
    end
  end
  local ok, err = pcall(require, 'nvim-treesitter.query_predicates')
  for name, register in pairs(registrations) do
    query[name] = register
  end
  if not ok then
    error(err)
  end
end

require('nvim-treesitter.configs').setup {
  ensure_installed = {
    "yaml",
    "json",
    "rust",
    "elixir",
    "eex",
    "heex",
    "python",
    "javascript",
    "vim",
    "lua",
    "css",
    "html",
    "terraform",
    "zig",
    "swift",
  },
  highlight = {
    enable = true,
    additional_vim_regex_highlighting = false,
  },
  autotag = {
    enable = true
  }
}
EOF

