"""Exercise the actual panel UI with mocked Chrome APIs and a local fake bridge."""


def run(ctx):
    errors = []
    ctx.page.on("pageerror", lambda error: errors.append(str(error)))
    ctx.page.add_init_script("""
      window.__bridgeMessages = [];
      window.__pageMessages = [];
      window.__permissionRequests = [];
      window.__storageReads = 0;
      window.__sockets = [];
      const stored = {};
      const standalone = new URL(location.href).searchParams.has('standalone');
      window.chrome = {
        ...(standalone ? {} : { devtools: {
          inspectedWindow: { tabId: 42 },
          panels: { themeName: 'default' },
        } }),
        tabs: {
          async get(id) {
            if (id !== 42) throw new Error('Wrong inspected tab');
            return { id, url: 'http://localhost:4000/store', title: 'Storefront' };
          },
          query() { throw new Error('Must not query the active tab'); },
          async sendMessage(id, message) {
            if (id !== 42) throw new Error('Wrong target tab');
            window.__pageMessages.push({ id, ...message });
            return { ok: true };
          },
        },
        runtime: {
          onMessage: { addListener(listener) { window.__pageListener = listener; } },
        },
        storage: {
          local: {
            async get() { window.__storageReads++; return { ...stored }; },
            async set(values) { Object.assign(stored, values); },
          },
          onChanged: { addListener() {} },
        },
        permissions: {
          async contains() { return false; },
          async request(options) { window.__permissionRequests.push(options); return true; },
          async remove(options) { window.__permissionRequests.push({ removed: options }); return true; },
        },
      };
      window.WebSocket = class extends EventTarget {
        static OPEN = 1;
        readyState = 1;
        constructor() {
          super();
          window.__sockets.push(this);
          queueMicrotask(() => this.dispatchEvent(new Event('open')));
        }
        receive(message) {
          this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
        }
        send(value) {
          const message = JSON.parse(value);
          window.__bridgeMessages.push(message);
          if (message.type === 'hello') queueMicrotask(() => this.receive({ type: 'hello', status: 'pairing-required' }));
          if (message.type === 'pair') queueMicrotask(() => this.receive({ type: 'paired', secret: 'test-secret' }));
        }
        close() { this.readyState = 3; }
      };
    """)

    def open_panel():
        ctx.page.emulate_media(color_scheme="dark")
        ctx.page.set_viewport_size({"width": 720, "height": 560})
        ctx.page.goto(ctx.base_url)
        ctx.expect(ctx.page.get_by_role("heading", name="Connect to pi")).to_be_visible()
        ctx.expect(ctx.page.locator("html")).to_have_attribute("data-theme", "light")
        ctx.expect(ctx.page.get_by_role("button", name="Draft all")).to_be_disabled()
        ctx.expect(ctx.page.get_by_role("button", name="Draft all")).to_have_css("cursor", "default")
        for button in ctx.page.locator("button:enabled:visible").all():
            ctx.expect(button).to_have_css("cursor", "pointer")
        ctx.expect(ctx.page.get_by_text("No notes yet")).to_be_visible()
        ctx.screenshot("devtools-light-pairing")
        ctx.page.get_by_role("textbox", name="Pairing code").fill("123456")
        ctx.page.get_by_role("textbox", name="Pairing code").press("Enter")
        ctx.expect(ctx.page.get_by_role("status")).to_have_text("Connected to pi")
        ctx.expect(ctx.page.locator("#pairing")).to_be_hidden()
        assert ctx.page.evaluate("__bridgeMessages.some(m => m.type === 'pair' && m.code === '123456')")
        assert ctx.page.evaluate("__permissionRequests.length") == 0

    ctx.step("pair inside DevTools and follow its explicit theme", open_panel)

    def inspect_and_edit():
        ctx.page.get_by_role("button", name="Select element").click()
        ctx.page.wait_for_function("__pageMessages.some(m => m.type === 'pi-context:start-picker' && m.id === 42)")
        ctx.page.evaluate("""
          () => {
            const message = {
              type: 'pi-context:element-selected', noteId: 1,
              comment: 'Increase spacing between the product cards.',
              reference: {
                label: 'Product grid', selector: '[data-product-grid]',
                url: 'http://localhost:4000/store', viewport: { width: 1280, height: 800 },
                phoenix: [{
                  name: 'Storefront.Components.product_grid',
                  definedAt: { path: 'lib/storefront_web/components/products.ex', line: 105, application: 'storefront' },
                  calledFrom: { path: 'lib/storefront_web/controllers/page_html/storefront.html.heex', line: 71, application: 'storefront' },
                }],
              },
            };
            window.__pageListener(message, { tab: { id: 99 } });
            if (document.querySelectorAll('.annotation').length) throw new Error('Accepted an unrelated tab');
            window.__pageListener(message, { tab: { id: 42 } });
          }
        """)
        ctx.expect(ctx.page.locator(".annotation")).to_have_count(1)
        for button in ctx.page.locator("button:enabled:visible").all():
            ctx.expect(button).to_have_css("cursor", "pointer")
        ctx.page.get_by_role("textbox", name="Note text").fill("Use a 24px gap between product cards.")
        ctx.page.get_by_role("button", name="Draft", exact=True).click()
        ctx.page.get_by_role("button", name="Send", exact=True).click()
        assert ctx.page.evaluate("__bridgeMessages.some(m => m.type === 'deliver' && m.mode === 'draft' && m.annotationIds[0] === 1)")
        assert ctx.page.evaluate("__bridgeMessages.some(m => m.type === 'deliver' && m.mode === 'send')")
        ctx.page.get_by_role("button", name="Show", exact=True).click()
        ctx.page.wait_for_function("__pageMessages.some(m => m.type === 'pi-context:highlight' && m.id === 42)")
        ctx.screenshot("devtools-light-notes")
        ctx.page.get_by_label("Enable browser driving on all sites").check()
        ctx.page.get_by_label("Enable browser driving on all sites").uncheck()
        assert ctx.page.evaluate("__permissionRequests.length") == 2

    ctx.step("select, edit, highlight, draft, send, and retain opt-in driving", inspect_and_edit)

    def layouts():
        for theme in ["dark", "light"]:
            ctx.page.emulate_media(color_scheme="light" if theme == "dark" else "dark")
            ctx.page.evaluate("""theme => {
              chrome.devtools.panels.themeName = theme === 'dark' ? 'dark' : 'default';
              setPiNotesVisible(true);
            }""", theme)
            ctx.expect(ctx.page.locator("html")).to_have_attribute("data-theme", theme)
            for width, height in [(320, 640), (920, 280)]:
                ctx.page.set_viewport_size({"width": width, "height": height})
                assert ctx.page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                ctx.expect(ctx.page.get_by_role("status")).to_be_in_viewport()
                ctx.page.get_by_role("button", name="Select element").focus()
                ctx.screenshot(f"devtools-{theme}-{width}x{height}")
        ctx.page.get_by_label("Resolved", exact=True).check()
        ctx.expect(ctx.page.get_by_role("button", name="Send all")).to_be_disabled()
        ctx.page.get_by_role("button", name="Clear resolved notes").click()
        ctx.expect(ctx.page.locator(".annotation")).to_have_count(0)
        ctx.expect(ctx.page.get_by_text("No notes yet")).to_be_visible()

    ctx.step("check light/dark, narrow/tall and wide/short layouts, then resolve a note", layouts)

    def standalone():
        ctx.page.goto(ctx.base_url + "?standalone")
        ctx.expect(ctx.page.get_by_text("Open Pi Inspect in DevTools", exact=True)).to_be_visible()
        ctx.expect(ctx.page.locator("#workspace")).to_be_hidden()
        assert ctx.page.evaluate("__sockets.length") == 0
        assert ctx.page.evaluate("__storageReads") == 0
        assert not errors, errors

    ctx.step("reject standalone use without storage or bridge side effects", standalone)
