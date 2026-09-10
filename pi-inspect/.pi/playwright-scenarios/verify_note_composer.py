def run(ctx):
    def verify():
        ctx.page.goto(ctx.base_url, wait_until="networkidle")
        ctx.page.evaluate("""
          () => {
            window.__piMessages = [];
            window.__piListener = null;
            window.chrome = {
              runtime: {
                onMessage: { addListener(listener) { window.__piListener = listener; } },
                sendMessage(message) { window.__piMessages.push(message); },
              },
            };
            const original = Element.prototype.attachShadow;
            Element.prototype.attachShadow = function(options) {
              return original.call(this, { ...options, mode: "open" });
            };
          }
        """)
        ctx.page.add_script_tag(path=str(ctx.project_dir / "extension" / "lib" / "phoenix-source.js"))
        ctx.page.add_script_tag(path=str(ctx.project_dir / "extension" / "ui" / "shadow.js"))
        ctx.page.evaluate("css => PiInspectUI.configure(css, 'light')", (ctx.project_dir / "extension" / "ui" / "components.css").read_text())
        ctx.page.add_script_tag(path=str(ctx.project_dir / "extension" / "content.js"))
        response = ctx.page.evaluate("""
          () => new Promise((resolve) => {
            window.__piListener({ type: "pi-context:start-picker", noteId: 7 }, {}, resolve);
          })
        """)
        assert response == {"ok": True}

        heading = ctx.page.get_by_role("heading", name="Cards for humanity")
        heading.hover()
        heading.click(position={"x": 30, "y": 30})

        editor = ctx.page.locator("#__pi-browser-context-note-editor")
        ctx.expect(editor).to_be_visible()
        ctx.expect(editor.locator("strong")).to_have_text("Note #7")
        for button in editor.get_by_role("button").all():
            ctx.expect(button).to_have_css("cursor", "pointer")
        editor.locator("textarea").fill("Increase spacing around this heading.")
        editor.get_by_role("button", name="Save note").click()
        ctx.expect(editor).to_have_count(0)

        notes_layer = ctx.page.locator("#__pi-browser-context-notes")
        marker = notes_layer.locator("article")
        ctx.expect(notes_layer).to_be_visible()
        ctx.expect(marker.locator(".badge")).to_have_text("#7")
        ctx.expect(marker.locator("strong")).to_have_text("Note #7")
        ctx.expect(marker.locator("p")).to_have_text("Increase spacing around this heading.")

        message = ctx.page.evaluate("window.__piMessages.at(-1)")
        assert message["type"] == "pi-context:element-selected"
        assert message["noteId"] == 7
        assert message["comment"] == "Increase spacing around this heading."
        assert message["reference"]["phoenix"]

        box = marker.bounding_box()
        ctx.page.mouse.move(box["x"] + 5, box["y"] + 5)
        ctx.expect(marker).to_have_class("expanded")
        detail_box = marker.locator(".detail").bounding_box()
        ctx.page.mouse.move(detail_box["x"] + detail_box["width"] + 25, detail_box["y"] + detail_box["height"] / 2)
        ctx.expect(marker).to_have_class("expanded")
        marker.locator("p").click()
        marker.locator("textarea").fill("Use more space around this heading.")
        for button in marker.locator("button:visible").all():
            ctx.expect(button).to_have_css("cursor", "pointer")
        marker.get_by_role("button", name="Save", exact=True).click()
        updated = ctx.page.evaluate("window.__piMessages.at(-1)")
        assert updated == {
            "type": "pi-context:note-updated",
            "noteId": 7,
            "comment": "Use more space around this heading.",
        }

        original_x = marker.bounding_box()["x"]
        ctx.page.evaluate("window.scrollTo(0, 1200)")
        ctx.expect(marker).to_have_class("offscreen")
        dot = marker.locator(".dot")
        ctx.expect(dot).to_be_visible()
        ctx.expect(dot).to_have_css("cursor", "pointer")
        ctx.expect(marker.locator(".badge")).to_be_hidden()
        border_box = marker.bounding_box()
        assert abs(border_box["x"] - original_x) < 2
        assert border_box["y"] <= 5

        dot.click()
        ctx.expect(heading).to_be_in_viewport()
        ctx.expect(marker.locator(".badge")).to_be_visible()
        visible_box = marker.bounding_box()
        ctx.page.mouse.move(visible_box["x"] + 5, visible_box["y"] + 5)
        ctx.expect(marker).to_have_class("expanded")
        marker.get_by_role("button", name="Delete", exact=True).click()
        ctx.expect(notes_layer.locator("article")).to_have_count(0)
        deleted = ctx.page.evaluate("window.__piMessages.at(-1)")
        assert deleted == {"type": "pi-context:note-deleted", "noteId": 7}

        ctx.page.evaluate("""
          () => new Promise((resolve) => {
            const created = window.__piMessages.find((message) => message.type === "pi-context:element-selected");
            window.__piListener({
              type: "pi-context:render-notes",
              visible: true,
              deletedNoteIds: [7],
              notes: [{ id: 7, comment: created.comment, reference: created.reference }],
            }, {}, resolve);
          })
        """)
        ctx.expect(notes_layer.locator("article")).to_have_count(0)

    ctx.step("compose and save an anchored numerical note", verify)
