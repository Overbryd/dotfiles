def run(ctx):
    errors = []
    ctx.page.on("pageerror", lambda error: errors.append(str(error)))

    def setup():
        ctx.page.goto(ctx.base_url)
        ctx.page.set_content("""
          <!doctype html><html><head><style>
            body { margin: 40px; font: 16px system-ui; }
            h1 { padding: 30px; background: #e8f0fe; }
          </style></head><body><h1 id="target">Product grid</h1></body></html>
        """)
        ctx.page.evaluate("""
          () => {
            window.__piMessages = [];
            window.__roots = new WeakMap();
            const attachShadow = Element.prototype.attachShadow;
            Element.prototype.attachShadow = function(options) {
              const root = attachShadow.call(this, options);
              window.__roots.set(this, root);
              return root;
            };
            window.chrome = { runtime: {
              onMessage: { addListener(listener) { window.__piListener = listener; } },
              sendMessage(message) { window.__piMessages.push(message); return Promise.resolve(); },
            } };
            // An extension reload can leave its DOM behind without the old script's state.
            const stale = document.createElement('div');
            stale.id = '__pi-browser-context-notes';
            stale.attachShadow({ mode: 'closed' }).innerHTML = '<div id="notes"></div>';
            document.documentElement.append(stale);
            window.__staleLayer = stale;
          }
        """)
        ctx.page.add_script_tag(path=str(ctx.project_dir / "extension" / "ui" / "shadow.js"))
        ctx.page.evaluate("css => PiInspectUI.configure(css, 'light')", (ctx.project_dir / "extension" / "ui" / "components.css").read_text())
        ctx.page.add_script_tag(path=str(ctx.project_dir / "extension" / "content.js"))
        ctx.page.evaluate("""() => {
          window.__piListener({ type: 'pi-context:render-notes', notes: [] }, {}, response => {
            window.__initialSync = response;
          });
        }""")

    def save_note(note_id):
        ctx.page.evaluate("""id => window.__piListener({ type: 'pi-context:start-picker', noteId: id }, {}, () => {})""", note_id)
        ctx.page.get_by_role("heading", name="Product grid").click(position={"x": 30 + (note_id - 1) * 350, "y": 30})
        editor = ctx.page.locator("#__pi-browser-context-note-editor")
        ctx.expect(editor).to_be_visible()
        ctx.page.evaluate("""() => {
          const editor = document.getElementById('__pi-browser-context-note-editor');
          if (editor.shadowRoot !== null) throw new Error('Test must use closed shadow roots');
          window.__roots.get(editor).querySelector('textarea').focus();
        }""")
        ctx.page.keyboard.insert_text(f"Feedback {note_id}")
        button = ctx.page.evaluate("""() => {
          const root = window.__roots.get(document.getElementById('__pi-browser-context-note-editor'));
          const rect = root.querySelector('button[type=submit]').getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }""")
        ctx.page.mouse.click(button["x"], button["y"])
        assert not errors, errors
        ctx.expect(editor).to_have_count(0)
        state = ctx.page.evaluate("""() => {
          const host = document.getElementById('__pi-browser-context-notes');
          const root = window.__roots.get(host);
          return {
            closed: host.shadowRoot === null,
            badges: [...root.querySelectorAll('.badge')].map(el => el.textContent),
            visible: [...root.querySelectorAll('.dot')].every(el => el.getBoundingClientRect().width > 0),
            delivered: __piMessages.filter(message => message.type === 'pi-context:element-selected').length,
          };
        }""")
        assert state == {
            "closed": True,
            "badges": [f"#{number}" for number in range(1, note_id + 1)],
            "visible": True,
            "delivered": note_id,
        }, state
        ctx.expect(ctx.page.locator("#__pi-browser-context-notes")).to_have_count(1)

    def recover_orphaned_layer():
        save_note(1)
        assert ctx.page.evaluate("__initialSync.ok") is True
        assert ctx.page.evaluate("__staleLayer.isConnected") is False
        ctx.page.evaluate("window.__currentLayer = document.getElementById('__pi-browser-context-notes')")
        ctx.screenshot("saved-note-after-layer-recovery", full_page=False)

    def reuse_owned_layer():
        save_note(2)
        assert ctx.page.evaluate("document.getElementById('__pi-browser-context-notes') === __currentLayer")

    def recover_replaced_layer():
        ctx.page.evaluate("""() => {
          const host = document.getElementById('__pi-browser-context-notes');
          host.replaceWith(host.cloneNode(false));
        }""")
        save_note(3)
        assert not errors, errors

    ctx.step("inject content script over a leftover closed-shadow note layer", setup)
    ctx.step("save sends once, closes the composer, and displays the page marker", recover_orphaned_layer)
    ctx.step("reuse the live layer for subsequent notes", reuse_owned_layer)
    ctx.step("recover after the page replaces the note-layer element", recover_replaced_layer)
