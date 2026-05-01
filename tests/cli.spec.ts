import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";
import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


const REPO_ROOT = join(__dirname, "..");
const CLI = join(REPO_ROOT, "packages", "mountly", "cli", "index.js");

test("cli prints help and exits 0", () => {
  story.given("the CLI is invoked");
  const out = execSync(`node ${CLI} --help`, { encoding: "utf8" });
  story.then("the output contains mountly");
  expect(out).toContain("mountly");
  story.then("the output contains init");
  expect(out).toContain("init");
});

test("cli init scaffolds a react widget package", () => {
  story.given("a temporary directory is created");
  const dir = mkdtempSync(join(tmpdir(), "mountly-cli-"));
  try {
    story.and("the CLI init command is run");
    const out = execSync(
      `node ${CLI} init my-widget --framework react --dir ${dir}/my-widget`,
      { encoding: "utf8" },
    );
    story.then("the scaffolded directory has package.json");
    const files = readdirSync(`${dir}/my-widget`);
    expect(files).toContain("package.json");
    story.then("the src directory exists");
    expect(files).toContain("src");
    story.then("Component.tsx was created");
    expect(existsSync(`${dir}/my-widget/src/Component.tsx`)).toBe(true);
    story.then("styles.css was created");
    expect(existsSync(`${dir}/my-widget/src/styles.css`)).toBe(true);
    story.then("index.ts was created");
    expect(existsSync(`${dir}/my-widget/src/index.ts`)).toBe(true);
    story.then("templates are rendered");
    expect(existsSync(`${dir}/my-widget/src/Component.tsx.tmpl`)).toBe(false);
    story.then("output contains cd command");
    expect(out).toContain(`cd ${dir}/my-widget`);
    story.then("output contains install command");
    expect(out).toContain("pnpm install");
    story.then("output contains build command");
    expect(out).toContain("pnpm build");
    story.then("output contains widget.mount");
    expect(out).toContain("widget.mount");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli init scaffolds a vue widget package", () => {
  const dir = mkdtempSync(join(tmpdir(), "mountly-cli-vue-"));
  try {
    const out = execSync(
      `node ${CLI} init my-vue-widget --framework vue --dir ${dir}/my-vue-widget`,
      { encoding: "utf8" },
    );
    const files = readdirSync(`${dir}/my-vue-widget`);
    expect(files).toContain("package.json");
    expect(files).toContain("src");
    expect(existsSync(`${dir}/my-vue-widget/src/Component.ts`)).toBe(true);
    expect(existsSync(`${dir}/my-vue-widget/src/styles.css`)).toBe(true);
    expect(existsSync(`${dir}/my-vue-widget/src/index.ts`)).toBe(true);
    expect(existsSync(`${dir}/my-vue-widget/src/Component.ts.tmpl`)).toBe(false);

    expect(out).toContain(`cd ${dir}/my-vue-widget`);
    expect(out).toContain("pnpm install");
    expect(out).toContain("pnpm build");
    expect(out).toContain("widget.mount");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli init scaffolds a svelte widget package", () => {
  const dir = mkdtempSync(join(tmpdir(), "mountly-cli-svelte-"));
  try {
    const out = execSync(
      `node ${CLI} init my-svelte-widget --framework svelte --dir ${dir}/my-svelte-widget`,
      { encoding: "utf8" },
    );
    const files = readdirSync(`${dir}/my-svelte-widget`);
    expect(files).toContain("package.json");
    expect(files).toContain("src");
    expect(existsSync(`${dir}/my-svelte-widget/src/Component.ts`)).toBe(true);
    expect(existsSync(`${dir}/my-svelte-widget/src/styles.css`)).toBe(true);
    expect(existsSync(`${dir}/my-svelte-widget/src/index.ts`)).toBe(true);
    expect(existsSync(`${dir}/my-svelte-widget/tsup.config.ts`)).toBe(true);
    expect(existsSync(`${dir}/my-svelte-widget/src/Component.ts.tmpl`)).toBe(false);

    expect(out).toContain(`cd ${dir}/my-svelte-widget`);
    expect(out).toContain("pnpm install");
    expect(out).toContain("pnpm build");
    expect(out).toContain("widget.mount");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli init --no-tailwind produces a Tailwind-free package", () => {
  const dir = mkdtempSync(join(tmpdir(), "mountly-cli-no-tw-"));
  try {
    execSync(
      `node ${CLI} init bare --framework react --no-tailwind --dir ${dir}/bare`,
      { stdio: "ignore" },
    );
    const pkg = JSON.parse(readFileSync(`${dir}/bare/package.json`, "utf8"));

    // No Tailwind devDeps
    expect(pkg.devDependencies?.tailwindcss).toBeUndefined();
    expect(pkg.devDependencies?.["@tailwindcss/cli"]).toBeUndefined();
    expect(pkg.devDependencies?.["mountly-tailwind"]).toBeUndefined();

    // Build script does not invoke tailwindcss
    expect(pkg.scripts.build).not.toContain("tailwindcss");

    // package.json is valid JSON (already proven by JSON.parse above)
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli rejects unknown framework with exit 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "mountly-cli-"));
  let exitCode = 0;
  try {
    execSync(
      `node ${CLI} init x --framework solid --dir ${dir}/x`,
      { stdio: "pipe" },
    );
  } catch (e: any) {
    exitCode = e.status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  expect(exitCode).toBe(1);
});

test("cli init --no-tailwind scaffolds a widget that builds from packed artifacts", () => {
  // npm install + tsup build needs more than the default 15s.
  test.setTimeout(120_000);
  // Pre-publish, rewrite the scaffold to consume local tarballs from npm pack.
  // This exercises the same artifact shape users will install from the registry.
  const dir = mkdtempSync(join(tmpdir(), "mountly-cli-build-"));
  const widgetDir = join(dir, "buildable-widget");
  const tarballsDir = join(dir, "tarballs");

  const packInto = (pkgDir: string): string => {
    const filename = execSync(`npm pack --silent --pack-destination "${tarballsDir}"`, {
      cwd: pkgDir,
      encoding: "utf8",
    }).trim();
    return join(tarballsDir, filename);
  };

  try {
    execSync(`mkdir -p ${tarballsDir}`);
    execSync(
      `node ${CLI} init buildable-widget --framework react --no-tailwind --dir ${widgetDir}`,
      { stdio: "ignore" },
    );

    const coreTarball = packInto(join(REPO_ROOT, "packages", "mountly"));
    const reactTarball = packInto(
      join(REPO_ROOT, "packages", "adapters", "mountly-react"),
    );
    const tailwindTarball = packInto(
      join(REPO_ROOT, "packages", "mountly-tailwind"),
    );

    const pkgPath = join(widgetDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg.dependencies["mountly-react"] = `file:${reactTarball}`;
    // mountly-react has a peer dep on mountly; satisfy it locally so the
    // install doesn't reach for the registry during pre-publish validation.
    pkg.dependencies["mountly"] = `file:${coreTarball}`;
    // Keep devDependencies resolvable regardless of --no-tailwind, since this
    // template entry exists in the scaffold for the default path.
    if (pkg.devDependencies?.["mountly-tailwind"]) {
      pkg.devDependencies["mountly-tailwind"] = `file:${tailwindTarball}`;
    }
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    execSync("npm install --no-package-lock --no-audit --no-fund", {
      cwd: widgetDir,
      stdio: "pipe",
    });

    execSync("npm run build", {
      cwd: widgetDir,
      stdio: "pipe",
    });

    expect(existsSync(join(widgetDir, "dist", "index.js"))).toBe(true);
    expect(existsSync(join(widgetDir, "dist", "index.d.ts"))).toBe(true);

    // Regression guard for finding #2: CSS must be bundled as a string and
    // handed to createWidget, not as `{}`.
    const bundled = readFileSync(join(widgetDir, "dist", "index.js"), "utf8");
    expect(bundled).toContain("createWidget");
    expect(bundled).toContain("ui-card");
    expect(bundled).not.toContain("styles = {}");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli init vue --no-tailwind scaffolds a widget that builds from packed artifacts", () => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(join(tmpdir(), "mountly-cli-vue-build-"));
  const widgetDir = join(dir, "buildable-vue-widget");
  const tarballsDir = join(dir, "tarballs");

  const packInto = (pkgDir: string): string => {
    const filename = execSync(`npm pack --silent --pack-destination "${tarballsDir}"`, {
      cwd: pkgDir,
      encoding: "utf8",
    }).trim();
    return join(tarballsDir, filename);
  };

  try {
    execSync(`mkdir -p ${tarballsDir}`);
    execSync(
      `node ${CLI} init buildable-vue-widget --framework vue --no-tailwind --dir ${widgetDir}`,
      { stdio: "ignore" },
    );

    const coreTarball = packInto(join(REPO_ROOT, "packages", "mountly"));
    const vueTarball = packInto(
      join(REPO_ROOT, "packages", "adapters", "mountly-vue"),
    );
    const tailwindTarball = packInto(
      join(REPO_ROOT, "packages", "mountly-tailwind"),
    );

    const pkgPath = join(widgetDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg.dependencies["mountly-vue"] = `file:${vueTarball}`;
    pkg.dependencies["mountly"] = `file:${coreTarball}`;
    if (pkg.devDependencies?.["mountly-tailwind"]) {
      pkg.devDependencies["mountly-tailwind"] = `file:${tailwindTarball}`;
    }
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    execSync("npm install --no-package-lock --no-audit --no-fund", {
      cwd: widgetDir,
      stdio: "pipe",
    });

    execSync("npm run build", {
      cwd: widgetDir,
      stdio: "pipe",
    });

    expect(existsSync(join(widgetDir, "dist", "index.js"))).toBe(true);
    expect(existsSync(join(widgetDir, "dist", "index.d.ts"))).toBe(true);

    const bundled = readFileSync(join(widgetDir, "dist", "index.js"), "utf8");
    expect(bundled).toContain("createWidget");
    expect(bundled).toContain("ui-card");
    expect(bundled).not.toContain("styles = {}");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli init svelte --no-tailwind scaffolds a widget that builds from packed artifacts", () => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(join(tmpdir(), "mountly-cli-svelte-build-"));
  const widgetDir = join(dir, "buildable-svelte-widget");
  const tarballsDir = join(dir, "tarballs");

  const packInto = (pkgDir: string): string => {
    const filename = execSync(`npm pack --silent --pack-destination "${tarballsDir}"`, {
      cwd: pkgDir,
      encoding: "utf8",
    }).trim();
    return join(tarballsDir, filename);
  };

  try {
    execSync(`mkdir -p ${tarballsDir}`);
    execSync(
      `node ${CLI} init buildable-svelte-widget --framework svelte --no-tailwind --dir ${widgetDir}`,
      { stdio: "ignore" },
    );

    const coreTarball = packInto(join(REPO_ROOT, "packages", "mountly"));
    const svelteTarball = packInto(
      join(REPO_ROOT, "packages", "adapters", "mountly-svelte"),
    );
    const tailwindTarball = packInto(
      join(REPO_ROOT, "packages", "mountly-tailwind"),
    );

    const pkgPath = join(widgetDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg.dependencies["mountly-svelte"] = `file:${svelteTarball}`;
    pkg.dependencies["mountly"] = `file:${coreTarball}`;
    if (pkg.devDependencies?.["mountly-tailwind"]) {
      pkg.devDependencies["mountly-tailwind"] = `file:${tailwindTarball}`;
    }
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    execSync("npm install --no-package-lock --no-audit --no-fund", {
      cwd: widgetDir,
      stdio: "pipe",
    });

    execSync("npm run build", {
      cwd: widgetDir,
      stdio: "pipe",
    });

    expect(existsSync(join(widgetDir, "dist", "index.js"))).toBe(true);
    expect(existsSync(join(widgetDir, "dist", "index.d.ts"))).toBe(true);

    const bundled = readFileSync(join(widgetDir, "dist", "index.js"), "utf8");
    expect(bundled).toContain("createWidget");
    expect(bundled).toContain("ui-card");
    expect(bundled).not.toContain("styles = {}");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
