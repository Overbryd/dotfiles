def run(ctx):
    def inspect():
        ctx.page.goto(ctx.base_url, wait_until="networkidle")
        data = ctx.page.evaluate("""
        () => {
          const comments = [];
          const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
          let node;
          while ((node = walker.nextNode())) {
            comments.push({
              text: node.data.trim(),
              parent: node.parentElement?.tagName?.toLowerCase() || null,
              previous: node.previousElementSibling?.outerHTML?.slice(0, 500) || null,
              next: node.nextElementSibling?.outerHTML?.slice(0, 500) || null,
            });
          }

          const annotated = [...document.querySelectorAll('*')]
            .map((el) => ({
              tag: el.tagName.toLowerCase(),
              attrs: Object.fromEntries([...el.attributes]
                .filter((a) => /phx|source|file|line|loc|component/i.test(a.name + '=' + a.value))
                .map((a) => [a.name, a.value])),
              html: el.outerHTML.slice(0, 700),
            }))
            .filter((item) => Object.keys(item.attrs).length > 0);

          return {
            title: document.title,
            url: location.href,
            comments,
            annotated,
            htmlPrefix: document.documentElement.outerHTML.slice(0, 3000),
          };
        }
        """)
        print("INSPECTION_JSON_START")
        import json
        print(json.dumps(data, indent=2, ensure_ascii=False))
        print("INSPECTION_JSON_END")

    ctx.step("inspect Phoenix source annotations", inspect)
    ctx.screenshot("phoenix-app")
