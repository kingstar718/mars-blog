import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const project = fileURLToPath(new URL("../", import.meta.url));

test(
  "homepage build resolves local images, media variants, and highlighted statistics",
  { timeout: 120000 },
  async () => {
    const fixture = await mkdtemp(join(tmpdir(), "mars-blog-home-render-"));
    try {
      await cp(join(project, "src"), join(fixture, "src"), {
        recursive: true,
        filter: source => source !== join(project, "src", "content"),
      });
      await cp(join(project, "tsconfig.json"), join(fixture, "tsconfig.json"));
      await mkdir(join(fixture, "scripts"));
      await cp(
        join(project, "scripts/remark-note-breaks.mjs"),
        join(fixture, "scripts/remark-note-breaks.mjs")
      );
      await writeFile(join(fixture, "package.json"), '{"type":"module"}');
      await symlink(
        join(project, "node_modules"),
        join(fixture, "node_modules"),
        "junction"
      );
      await writeFile(
        join(fixture, "astro.config.mjs"),
        // 此用例验证图片引用解析；使用 Astro 自带直通服务，避免依赖 Sharp。
        `import config from ${JSON.stringify(new URL("../astro.config.mjs", import.meta.url).href)};\nexport default {...config, image: {service: {entrypoint: 'astro/assets/services/noop'}}};`
      );
      await mkdir(join(fixture, "src/content/posts"), { recursive: true });
      await mkdir(join(fixture, "src/content/notes"), { recursive: true });
      await mkdir(join(fixture, "src/content/pages"), { recursive: true });
      await writeFile(
        join(fixture, "src/content/posts/example.md"),
        "---\ntitle: Example\npubDatetime: 2020-01-01T00:00:00Z\n---\nHello."
      );
      await writeFile(
        join(fixture, "src/content/notes/example.md"),
        "---\npubDatetime: 2020-01-01T00:00:00Z\n---\nNote first line.\nNote second line."
      );
      await writeFile(
        join(fixture, "src/content/pages/photo.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>'
      );
      await writeFile(
        join(fixture, "src/content/media-manifest.json"),
        JSON.stringify({
          sample: [
            { format: "jpeg", width: 400, height: 200 },
            { format: "jpeg", width: 800, height: 400 },
          ],
        })
      );
      await writeFile(
        join(fixture, "src/content/pages/about.md"),
        "---\ntitle: About\n---\n![local](./photo.svg)\n\n![media](/media/sample)\n\n[{{latest_post_title}}]({{latest_post_url}})\n\n```json\n{{posts_count}} {{unknown}}\n```"
      );

      await run(
        process.execPath,
        [join(project, "node_modules/astro/bin/astro.mjs"), "build"],
        { cwd: fixture, timeout: 110000, maxBuffer: 4 * 1024 * 1024 }
      );
      const html = await readFile(join(fixture, "dist/index.html"), "utf8");
      assert.match(html, /<img\b[^>]*src="\/_astro\/photo\.[^"]+"/);
      assert.doesNotMatch(html, /__ASTRO_IMAGE_/);
      assert.match(html, /src="\/media\/sample\/800\.jpg"/);
      assert.match(
        html,
        /srcset="\/media\/sample\/400\.jpg 400w, \/media\/sample\/800\.jpg 800w"/
      );
      assert.match(html, /href="\/posts\/example">Example<\/a>/);
      const code = html.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/)?.[0];
      assert.ok(code);
      assert.equal(code.replace(/<[^>]*>/g, ""), "1 {{unknown}}");
      assert.match(html, /id="edit-page"/);
      assert.match(html, /data-page-editor-slot/);
      const notes = await readFile(
        join(fixture, "dist/notes/index.html"),
        "utf8"
      );
      assert.match(notes, /Note first line\.<br\s*\/?>\s*Note second line\./);
      const feed = await readFile(join(fixture, "dist/feed.xml"), "utf8");
      assert.match(feed, /Note first line\.&lt;br&gt;\s*Note second line\./);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  }
);
