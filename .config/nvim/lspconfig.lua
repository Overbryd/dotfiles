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
  cmd = { "elixir-ls" },
  capabilities=cmp_capabilities,
  elixirLS = {
    dialyzerEnabled = false,
    fetchDeps = false
  },
}

