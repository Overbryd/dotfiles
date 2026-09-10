def run(ctx):
    def verify():
        ctx.page.goto(ctx.base_url, wait_until="networkidle")
        ctx.page.evaluate("""
          () => {
            window.chrome = {
              runtime: {
                onMessage: { addListener(listener) { window.__piListener = listener; } },
                sendMessage() {},
              },
            };
            const fixture = document.createElement("div");
            fixture.id = "pi-driving-fixture";
            fixture.innerHTML = `
              <button id="drive-button">Drive button</button>
              <input id="drive-input" value="old">
              <input id="drive-password" type="password">
              <select id="drive-select"><option value="a">A</option><option value="b">B</option></select>
              <div id="drive-scroll-target" style="margin-top: 1800px">Scroll target</div>`;
            document.body.append(fixture);
            document.querySelector("#drive-button").addEventListener("click", (event) => event.currentTarget.dataset.clicked = "yes");
            window.__inputEvents = 0;
            document.querySelector("#drive-input").addEventListener("input", () => window.__inputEvents += 1);
          }
        """)
        ctx.page.add_script_tag(path=str(ctx.project_dir / "extension" / "lib" / "phoenix-source.js"))
        ctx.page.add_script_tag(path=str(ctx.project_dir / "extension" / "ui" / "shadow.js"))
        ctx.page.evaluate("css => PiInspectUI.configure(css, 'light')", (ctx.project_dir / "extension" / "ui" / "components.css").read_text())
        ctx.page.add_script_tag(path=str(ctx.project_dir / "extension" / "content.js"))

        def command(message):
            return ctx.page.evaluate(
                "message => new Promise(resolve => window.__piListener(message, {}, resolve))",
                message,
            )

        clicked = command({"type": "pi-context:click", "selector": "#drive-button"})
        assert clicked["ok"] is True
        assert ctx.page.locator("#drive-button").get_attribute("data-clicked") == "yes"

        typed = command({"type": "pi-context:type", "selector": "#drive-input", "text": "new", "clear": True})
        assert typed["ok"] is True
        assert ctx.page.locator("#drive-input").input_value() == "new"
        assert ctx.page.evaluate("window.__inputEvents") == 1

        appended = command({"type": "pi-context:type", "selector": "#drive-input", "text": " value", "clear": False})
        assert appended["ok"] is True
        assert ctx.page.locator("#drive-input").input_value() == "new value"

        refused = command({"type": "pi-context:type", "selector": "#drive-password", "text": "secret"})
        assert refused["ok"] is False
        assert "Refusing" in refused["error"]

        selected = command({"type": "pi-context:select", "selector": "#drive-select", "value": "b"})
        assert selected["ok"] is True
        assert ctx.page.locator("#drive-select").input_value() == "b"

        scrolled = command({"type": "pi-context:scroll", "selector": "#drive-scroll-target", "block": "center"})
        assert scrolled["ok"] is True
        ctx.expect(ctx.page.locator("#drive-scroll-target")).to_be_in_viewport()

    ctx.step("drive click, type, select, and scroll actions", verify)
