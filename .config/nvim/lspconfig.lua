local lsp = require('lspconfig')
local cmp_capabilities = require('cmp_nvim_lsp').default_capabilities()

-- yamlls
lsp.yamlls.setup{
  capabilities=cmp_capabilities,
  on_attach=on_attach,
  -- capabilities=require('cmp_nvim_lsp').update_capabilities(vim.lsp.protocol.make_client_capabilities()),
  settings={
    redhat={
      telemetry={
        enabled=false
      }
    },
    yaml={
      schemas={
        ["https://json.schemastore.org/github-workflow.json"]="/.github/workflows/*"
      }
    }
  }
}

-- jsonls
lsp.jsonls.setup{
  capabilities=cmp_capabilities,
}

-- terraform-ls
lsp.terraformls.setup{
  capabilities=cmp_capabilities,
}

-- elixirls
lsp.elixirls.setup{
  capabilities=cmp_capabilities,
  cmd = { "elixir-ls" },
  elixirLS = {
    dialyzerEnabled = false,
    fetchDeps = false
  },
  on_attach = require("lsp-format").on_attach,
}

-- tailwindcss
lsp.tailwindcss.setup({
  capabilities=cmp_capabilities,
  root_dir = lsp.util.root_pattern(
    "tailwind.config.js",
    "tailwind.config.js",
    "package.json",
    "mix.exs",
    ".git"
  ),
  filetypes = {
    "html",
    "elixir",
    "eelixir",
    "heex",
  },
  init_options = {
    userLanguages = {
      elixir = "html-eex",
      eelixir = "html-eex",
      heex = "html-eex",
    }
  },
  settings = {
    tailwindCSS = {
      experimental = {
        classRegex = {
          -- add Elixir classRegex
          'class[:]\\s*"([^"]*)"',
        }
      }
    }
  }
})

