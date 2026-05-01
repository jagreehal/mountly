import { expect, test, type Page } from '@playwright/test';
import {
  execSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(__dirname, '..');

function run(command: string, cwd: string): string {
  return execSync(command, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function write(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function packInto(pkgDir: string, tarballsDir: string): string {
  const filename = run(
    `npm pack --silent --pack-destination ${JSON.stringify(tarballsDir)}`,
    pkgDir
  ).trim();
  return join(tarballsDir, filename);
}

async function startVite(
  cwd: string,
  port: number
): Promise<ChildProcessWithoutNullStreams> {
  const child = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let output = '';
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for Vite dev server.\n${output}`));
    }, 20_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('Local:') || output.includes('ready in')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Vite exited early with ${code}.\n${output}`));
    });
  });

  return child;
}

async function renderedText(page: Page): Promise<string> {
  return page.evaluate(() => {
    function textDeep(node: Node): string {
      let text = node.nodeType === Node.TEXT_NODE ? node.textContent ?? '' : '';
      if (node instanceof Element && node.shadowRoot) {
        text += textDeep(node.shadowRoot);
      }
      for (const child of Array.from(node.childNodes)) {
        text += textDeep(child);
      }
      return text;
    }
    return textDeep(document.body).replace(/\s+/g, ' ').trim();
  });
}

test('packed npm packages install into a clean Vite consumer and render all adapters', async ({
  page,
}) => {
  test.setTimeout(240_000);

  const dir = mkdtempSync(join(tmpdir(), 'mountly-npm-consumer-'));
  const consumerDir = join(dir, 'consumer');
  const tarballsDir = join(dir, 'tarballs');
  let server: ChildProcessWithoutNullStreams | null = null;

  try {
    mkdirSync(tarballsDir, { recursive: true });
    mkdirSync(consumerDir, { recursive: true });

    run(
      'pnpm --filter mountly --filter mountly-react --filter mountly-vue --filter mountly-svelte --filter mountly-tsrx build',
      REPO_ROOT
    );

    const tarballs = {
      mountly: packInto(join(REPO_ROOT, 'packages', 'mountly'), tarballsDir),
      react: packInto(
        join(REPO_ROOT, 'packages', 'adapters', 'mountly-react'),
        tarballsDir
      ),
      vue: packInto(
        join(REPO_ROOT, 'packages', 'adapters', 'mountly-vue'),
        tarballsDir
      ),
      svelte: packInto(
        join(REPO_ROOT, 'packages', 'adapters', 'mountly-svelte'),
        tarballsDir
      ),
      tsrx: packInto(
        join(REPO_ROOT, 'packages', 'adapters', 'mountly-tsrx'),
        tarballsDir
      ),
    };

    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify(
        {
          type: 'module',
          scripts: {
            build: 'vite build',
            dev: 'vite',
          },
          dependencies: {
            mountly: `file:${tarballs.mountly}`,
            'mountly-react': `file:${tarballs.react}`,
            'mountly-vue': `file:${tarballs.vue}`,
            'mountly-svelte': `file:${tarballs.svelte}`,
            'mountly-tsrx': `file:${tarballs.tsrx}`,
            react: '18.3.1',
            'react-dom': '18.3.1',
            vue: '^3.5.33',
            svelte: '^5.55.5',
          },
          devDependencies: {
            '@sveltejs/vite-plugin-svelte': '^7.0.0',
            vite: '^8.0.10',
          },
        },
        null,
        2
      )
    );

    write(
      join(consumerDir, 'vite.config.mjs'),
      `
        import { defineConfig } from "vite";
        import { svelte } from "@sveltejs/vite-plugin-svelte";

        export default defineConfig({
          plugins: [svelte()],
          build: {
            rollupOptions: {
              input: "index.html",
            },
          },
        });
      `
    );

    write(
      join(consumerDir, 'src', 'react-card.js'),
      `
        import React from "react";
        import { createWidget } from "mountly-react";

        function ReactCard(props) {
          return React.createElement(
            "section",
            { "data-testid": "react-card", className: "consumer-card" },
            \`React 18 card: \${props.name}\`,
          );
        }

        export default createWidget(ReactCard, {
          styles: ".consumer-card { color: rgb(10, 80, 160); }",
        });
      `
    );

    write(
      join(consumerDir, 'src', 'vue-card.js'),
      `
        import { h } from "vue";
        import { createWidget } from "mountly-vue";

        const VueCard = {
          props: ["name"],
          render() {
            return h("section", { "data-testid": "vue-card" }, \`Vue card: \${this.name}\`);
          },
        };

        export default createWidget(VueCard);
      `
    );

    write(
      join(consumerDir, 'src', 'SvelteCard.svelte'),
      `
        <script>
          let { name = "missing" } = $props();
        </script>

        <section data-testid="svelte-card">Svelte card: {name}</section>
      `
    );

    write(
      join(consumerDir, 'src', 'svelte-card.js'),
      `
        import { mount, unmount } from "svelte";
        import { createWidget } from "mountly-svelte";
        import SvelteCard from "./SvelteCard.svelte";

        export default createWidget(SvelteCard, { mount, unmount });
      `
    );

    write(
      join(consumerDir, 'src', 'tsrx-card.js'),
      `
        import { createWidget } from "mountly-tsrx";

        export default createWidget({
          render(target, props) {
            const section = document.createElement("section");
            section.dataset.testid = "tsrx-card";
            section.textContent = \`TSRX card: \${props.name}\`;
            target.append(section);
            return () => section.remove();
          },
        });
      `
    );

    write(
      join(consumerDir, 'index.html'),
      `
        <!doctype html>
        <html>
          <body>
            <react-card trigger="click" props='{"name":"Ada"}'></react-card>
            <vue-card trigger="click" props='{"name":"Lin"}'></vue-card>
            <svelte-card trigger="click" props='{"name":"Mae"}'></svelte-card>
            <tsrx-card trigger="click" props='{"name":"Ken"}'></tsrx-card>

            <script type="module">
              import { defineMountlyFeature } from "mountly";

              defineMountlyFeature({
                modules: {
                  "react-card": "/src/react-card.js",
                  "vue-card": "/src/vue-card.js",
                  "svelte-card": "/src/svelte-card.js",
                  "tsrx-card": "/src/tsrx-card.js"
                }
              });

              // Trigger all click-activated features deterministically in tests.
              queueMicrotask(() => {
                for (const feature of document.querySelectorAll("mountly-feature")) {
                  feature.click();
                }
              });
            </script>
          </body>
        </html>
      `
    );

    run('npm install --no-package-lock --no-audit --no-fund', consumerDir);
    run('npm run build', consumerDir);

    expect(existsSync(join(consumerDir, 'dist', 'index.html'))).toBe(true);
    expect(
      readFileSync(
        join(consumerDir, 'node_modules', 'mountly', 'package.json'),
        'utf8'
      )
    ).toContain('"name": "mountly"');
    expect(
      readFileSync(
        join(consumerDir, 'node_modules', 'mountly-react', 'package.json'),
        'utf8'
      )
    ).toContain('">=18 <20"');

    const port = 5317 + Math.floor(Math.random() * 1000);
    server = await startVite(consumerDir, port);
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect
      .poll(
        async () => {
          const text = await renderedText(page);
          return {
            react: text.includes('React 18 card: Ada'),
            vue: text.includes('Vue card: Lin'),
            svelte: text.includes('Svelte card: Mae'),
            tsrx: text.includes('TSRX card: Ken'),
          };
        },
        { timeout: 30_000 }
      )
      .toEqual({
        react: true,
        vue: true,
        svelte: true,
        tsrx: true,
      });

    const reactColor = await page.evaluate(() => {
      function queryDeep(
        selector: string,
        root: Document | ShadowRoot | Element
      ): Element | null {
        const direct = root.querySelector(selector);
        if (direct) return direct;
        for (const element of Array.from(root.querySelectorAll('*'))) {
          if (element.shadowRoot) {
            const found = queryDeep(selector, element.shadowRoot);
            if (found) return found;
          }
        }
        return null;
      }
      const section = queryDeep("[data-testid='react-card']", document);
      return section ? getComputedStyle(section).color : '';
    });
    expect(reactColor).toBe('rgb(10, 80, 160)');
  } finally {
    server?.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
