def run(ctx):
    def setup():
        ctx.page.goto(ctx.base_url)
        ctx.page.set_content("""
          <!doctype html><html><head><style>
            body { margin: 0; min-height: 3000px; font: 16px system-ui; }
            .page-item { width: 300px; height: 300px; background: #e8f0fe; }
            #second { background: #d2e3fc; }
            #scrollport { position: fixed; left: 400px; top: 100px; width: 300px; height: 200px; overflow: auto; }
            .nested-item { height: 250px; background: #e6f4ea; }
            #nested-second { background: #ceead6; }
          </style></head><body>
            <div id="first" class="page-item">First page region</div>
            <div id="second" class="page-item">Second page region</div>
            <div id="scrollport">
              <div id="nested-first" class="nested-item">First scrollable region</div>
              <div id="nested-second" class="nested-item">Second scrollable region</div>
            </div>
          </body></html>
        """)
        ctx.page.evaluate("""
          () => {
            window.__pointerMoves = 0;
            document.addEventListener('pointermove', () => window.__pointerMoves++);
            window.chrome = { runtime: {
              onMessage: { addListener(listener) { window.__piListener = listener; } },
              sendMessage() {},
            } };
          }
        """)
        ctx.page.add_script_tag(path=str(ctx.project_dir / "extension" / "ui" / "shadow.js"))
        ctx.page.evaluate("css => PiInspectUI.configure(css, 'light')", (ctx.project_dir / "extension" / "ui" / "components.css").read_text())
        ctx.page.add_script_tag(path=str(ctx.project_dir / "extension" / "content.js"))
        ctx.page.evaluate("""() => window.__piListener({ type: 'pi-context:start-picker', noteId: 1 }, {}, () => {})""")

    def expect_highlight(target, x, y):
        ctx.page.wait_for_function("""
          ({ target, x, y }) => {
            const element = document.getElementById(target);
            const overlay = document.getElementById('__pi-browser-context-overlay');
            if (!overlay || getComputedStyle(overlay).display === 'none') return false;
            if (document.elementFromPoint(x, y) !== element) return false;
            const expected = element.getBoundingClientRect();
            const actual = overlay.getBoundingClientRect();
            return ['x', 'y', 'width', 'height'].every(key => Math.abs(expected[key] - actual[key]) < 1);
          }
        """, arg={"target": target, "x": x, "y": y})

    def page_scroll():
        ctx.page.mouse.move(100, 150)
        expect_highlight("first", 100, 150)
        moves = ctx.page.evaluate("__pointerMoves")
        ctx.page.evaluate("window.scrollTo(0, 100)")
        expect_highlight("first", 100, 150)
        ctx.page.evaluate("window.scrollTo(0, 350)")
        expect_highlight("second", 100, 150)
        assert ctx.page.evaluate("__pointerMoves") == moves
        ctx.screenshot("picker-after-page-scroll", full_page=False)

    def nested_scroll():
        ctx.page.mouse.move(450, 150)
        expect_highlight("nested-first", 450, 150)
        moves = ctx.page.evaluate("__pointerMoves")
        ctx.page.evaluate("document.getElementById('scrollport').scrollTop = 100")
        expect_highlight("nested-first", 450, 150)
        ctx.page.evaluate("document.getElementById('scrollport').scrollTop = 250")
        expect_highlight("nested-second", 450, 150)
        assert ctx.page.evaluate("__pointerMoves") == moves
        ctx.screenshot("picker-after-nested-scroll", full_page=False)
        ctx.page.keyboard.press("Escape")
        ctx.page.evaluate("""async () => {
          document.getElementById('scrollport').scrollTop = 0;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }""")
        ctx.expect(ctx.page.locator("#__pi-browser-context-overlay")).to_be_hidden()

    ctx.step("start the picker on a page with a nested scroll container", setup)
    ctx.step("recompute bounds and target after page scroll without moving the pointer", page_scroll)
    ctx.step("handle nested scrolling and keep the highlight hidden after Escape", nested_scroll)
