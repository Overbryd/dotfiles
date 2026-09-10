def run(ctx):
    def verify():
        ctx.page.goto(ctx.base_url, wait_until="networkidle")
        script_path = str(ctx.project_dir / "extension" / "lib" / "phoenix-source.js")
        ctx.page.add_script_tag(path=script_path)
        stack = ctx.page.locator("[data-product-tilt-field]").evaluate(
            "element => PiPhoenixSource.sourceStackForElement(element)"
        )

        product_grid = next(
            (frame for frame in stack if frame["name"] == "BWeb.StorefrontComponents.product_grid"),
            None,
        )
        assert product_grid is not None, stack
        assert product_grid["definedAt"]["path"] == "lib/blickwinkel_web/components/storefront_components.ex"
        assert product_grid["definedAt"]["line"] == 105
        assert product_grid["calledFrom"]["path"] == "lib/blickwinkel_web/controllers/page_html/storefront.html.heex"
        assert product_grid["calledFrom"]["line"] == 71
        print("Resolved Phoenix stack:", stack)

    ctx.step("resolve selected product grid to Phoenix source", verify)
