import { test, expect } from '@playwright/test';
import { story } from 'executable-stories-playwright';

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});

test('custom element warns on invalid props JSON and falls back to empty props', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning') warnings.push(msg.text());
  });

  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import('/packages/mountly/dist/index.js');

    defineMountlyFeature();
    const moduleId = 'ce-invalid-props';
    unregisterCustomElement(moduleId);

    registerCustomElement(moduleId, () =>
      createOnDemandFeature({
        moduleId,
        loadModule: async () => ({
          mount(container: HTMLElement, props: Record<string, unknown>) {
            container.textContent = JSON.stringify(props);
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      })
    );

    const root = document.createElement('mountly-feature');
    root.setAttribute('module-id', moduleId);
    root.setAttribute('props', '{bad json');
    root.innerHTML = `<button id="trigger">Open</button><div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('#trigger') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    return {
      slotText: root.querySelector('#slot')?.textContent ?? '',
    };
  });

  expect(result.slotText).toBe('{}');
  expect(
    warnings.some((w) => w.includes('invalid JSON in props attribute'))
  ).toBe(true);
});

test('changing module-id tears down previous feature and mounts the new feature', async ({
  page,
}) => {
  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import('/packages/mountly/dist/index.js');

    defineMountlyFeature();
    const oldId = 'ce-module-a';
    const nextId = 'ce-module-b';
    unregisterCustomElement(oldId);
    unregisterCustomElement(nextId);

    let oldUnmounts = 0;
    registerCustomElement(oldId, () =>
      createOnDemandFeature({
        moduleId: oldId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = 'A';
          },
          unmount() {
            oldUnmounts += 1;
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      })
    );

    registerCustomElement(nextId, () =>
      createOnDemandFeature({
        moduleId: nextId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = 'B';
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      })
    );

    const root = document.createElement('mountly-feature');
    root.setAttribute('module-id', oldId);
    root.innerHTML = `<button id="trigger">Open</button><div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('#trigger') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    root.setAttribute('module-id', nextId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('#trigger') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    return {
      oldUnmounts,
      slotText: root.querySelector('#slot')?.textContent ?? '',
    };
  });

  expect(result.oldUnmounts).toBeGreaterThanOrEqual(1);
  expect(result.slotText).toBe('B');
});

test('disconnectedCallback detaches and unmounts active custom-element feature', async ({
  page,
}) => {
  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import('/packages/mountly/dist/index.js');

    defineMountlyFeature();
    const moduleId = 'ce-disconnect';
    unregisterCustomElement(moduleId);

    let unmounts = 0;
    registerCustomElement(moduleId, () =>
      createOnDemandFeature({
        moduleId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = 'mounted';
          },
          unmount(container: HTMLElement) {
            unmounts += 1;
            container.textContent = '';
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      })
    );

    const root = document.createElement('mountly-feature');
    root.setAttribute('module-id', moduleId);
    root.innerHTML = `<button id="trigger">Open</button><div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('#trigger') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.remove();

    return { unmounts };
  });

  expect(result.unmounts).toBe(1);
});

test('custom element warns with actionable hint when module-id is unregistered', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning') warnings.push(msg.text());
  });

  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import('/packages/mountly/dist/index.js');

    defineMountlyFeature();
    // Register one feature so the warning can list at least one known id.
    unregisterCustomElement('known-feature');
    registerCustomElement('known-feature', () =>
      createOnDemandFeature({
        moduleId: 'known-feature',
        loadModule: async () => ({ mount() {}, unmount() {} }),
        render: () => {},
      })
    );

    const root = document.createElement('mountly-feature');
    root.setAttribute('module-id', 'typo-feature');
    document.body.appendChild(root);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const hint = warnings.find((w) => w.includes('typo-feature'));
  expect(hint, 'must warn for the unregistered module-id').toBeTruthy();
  expect(hint).toContain('registerCustomElement');
  expect(hint).toContain('known-feature');
});

test('custom element with trigger=viewport mounts automatically on visibility', async ({
  page,
}) => {
  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import('/packages/mountly/dist/index.js');

    defineMountlyFeature();
    const moduleId = 'ce-viewport';
    unregisterCustomElement(moduleId);

    registerCustomElement(moduleId, () =>
      createOnDemandFeature({
        moduleId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = 'viewport mounted';
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      })
    );

    const root = document.createElement('mountly-feature');
    root.setAttribute('module-id', moduleId);
    root.setAttribute('trigger', 'viewport');
    root.innerHTML = `<div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    // IntersectionObserver + mount pipeline is async.
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      slotText: root.querySelector('#slot')?.textContent ?? '',
    };
  });

  expect(result.slotText).toBe('viewport mounted');
});

test('custom element with trigger=url-change mounts on history updates', async ({
  page,
}) => {
  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import('/packages/mountly/dist/index.js');

    defineMountlyFeature();
    const moduleId = 'ce-url-change';
    unregisterCustomElement(moduleId);

    registerCustomElement(moduleId, () =>
      createOnDemandFeature({
        moduleId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = 'url-change mounted';
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      })
    );

    const root = document.createElement('mountly-feature');
    root.setAttribute('module-id', moduleId);
    root.setAttribute('trigger', 'url-change');
    root.setAttribute('url-events', 'pushstate');
    root.innerHTML = `<div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    await new Promise((resolve) => setTimeout(resolve, 0));
    history.pushState({ n: 1 }, '', '?ce=1');
    await new Promise((resolve) => setTimeout(resolve, 0));

    return {
      slotText: root.querySelector('#slot')?.textContent ?? '',
    };
  });

  expect(result.slotText).toBe('url-change mounted');
});

test('custom element with trigger=idle mounts without interaction', async ({
  page,
}) => {
  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import('/packages/mountly/dist/index.js');

    defineMountlyFeature();
    const moduleId = 'ce-idle';
    unregisterCustomElement(moduleId);

    registerCustomElement(moduleId, () =>
      createOnDemandFeature({
        moduleId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = 'idle mounted';
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      })
    );

    const root = document.createElement('mountly-feature');
    root.setAttribute('module-id', moduleId);
    root.setAttribute('trigger', 'idle');
    root.setAttribute('idle-timeout', '1');
    root.innerHTML = `<div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    await new Promise((resolve) => setTimeout(resolve, 20));

    return {
      slotText: root.querySelector('#slot')?.textContent ?? '',
    };
  });

  expect(result.slotText).toBe('idle mounted');
});

test('custom element with trigger=media mounts when media query matches', async ({
  page,
}) => {
  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import('/packages/mountly/dist/index.js');

    defineMountlyFeature();
    const moduleId = 'ce-media';
    unregisterCustomElement(moduleId);

    registerCustomElement(moduleId, () =>
      createOnDemandFeature({
        moduleId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = 'media mounted';
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      })
    );

    const root = document.createElement('mountly-feature');
    root.setAttribute('module-id', moduleId);
    root.setAttribute('trigger', 'media');
    root.setAttribute('activate-media-query', '(min-width: 1px)');
    root.innerHTML = `<div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 20));

    return {
      slotText: root.querySelector('#slot')?.textContent ?? '',
    };
  });

  expect(result.slotText).toBe('media mounted');
});

test('defineMountlyFeature accepts one shared source and auto-defines alias tags', async ({
  page,
}) => {
  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  const result = await page.evaluate(async () => {
    document.body.innerHTML = `
      <pokemon-card trigger="idle" idle-timeout="1" props='{"id":"ditto"}'></pokemon-card>
      <weather-card trigger="idle" idle-timeout="1" props='{"id":"rain"}'></weather-card>
    `;

    const { defineMountlyFeature } = await import(
      '/packages/mountly/dist/index.js'
    );
    defineMountlyFeature('/tests/fixtures/dx-shared-bundle.js');

    await new Promise((resolve) => setTimeout(resolve, 30));

    return {
      pokemon:
        document.querySelector("[data-testid='pokemonCard']")?.textContent ??
        '',
      pokemonCount: document.querySelectorAll("[data-testid='pokemonCard']")
        .length,
      weather:
        document.querySelector("[data-testid='weatherCard']")?.textContent ??
        '',
      weatherCount: document.querySelectorAll("[data-testid='weatherCard']")
        .length,
      pokemonDefined: !!customElements.get('pokemon-card'),
      weatherDefined: !!customElements.get('weather-card'),
    };
  });

  expect(result.pokemon).toBe('pokemonCard:ditto');
  expect(result.pokemonCount).toBe(1);
  expect(result.weather).toBe('weatherCard:rain');
  expect(result.weatherCount).toBe(1);
  expect(result.pokemonDefined).toBe(true);
  expect(result.weatherDefined).toBe(true);
});

test('prefix option namespaces alias tags without changing module ids', async ({
  page,
}) => {
  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  const result = await page.evaluate(async () => {
    document.body.innerHTML = `
      <acme-weather-card trigger="idle" idle-timeout="1" props='{"id":"rain"}'></acme-weather-card>
      <weather-card trigger="idle" idle-timeout="1" props='{"id":"plain"}'></weather-card>
    `;

    const { defineMountlyFeature } = await import(
      '/packages/mountly/dist/index.js'
    );
    defineMountlyFeature({
      source: '/tests/fixtures/dx-shared-bundle.js',
      prefix: 'acme',
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    return {
      text:
        document.querySelector("[data-testid='weatherCard']")?.textContent ??
        '',
      count: document.querySelectorAll("[data-testid='weatherCard']").length,
      prefixedDefined: !!customElements.get('acme-weather-card'),
      plainDefined: !!customElements.get('weather-card'),
      nestedModuleId: document
        .querySelector('acme-weather-card > mountly-feature')
        ?.getAttribute('module-id'),
    };
  });

  expect(result.text).toBe('weatherCard:rain');
  expect(result.count).toBe(1);
  expect(result.prefixedDefined).toBe(true);
  expect(result.plainDefined).toBe(false);
  expect(result.nestedModuleId).toBe('weather-card');
});

test('prefix option works with baseUrl and modules byte-control path', async ({
  page,
}) => {
  test.setTimeout(30_000);
  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  await page.evaluate(async () => {
    document.body.innerHTML = `
      <acme-weather-card trigger="idle" idle-timeout="1" props='{"city":"Bristol"}'></acme-weather-card>
      <acme-sports-card trigger="idle" idle-timeout="1" props='{"team":"City"}'></acme-sports-card>
      <mountly-feature module-id="weather-card" trigger="idle" idle-timeout="1" props='{"city":"Bristol"}'></mountly-feature>
    `;

    const { defineMountlyFeature } = await import(
      '/packages/mountly/dist/index.js'
    );
    defineMountlyFeature({
      baseUrl: '/tests/fixtures/dx-widgets',
      modules: ['weather-card'],
      prefix: 'acme',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await expect(page.locator("[data-testid='weather-card']").first()).toHaveText(
    'weather:Bristol',
    { timeout: 10000 }
  );

  const result = await page.evaluate(() => ({
    weather:
      document.querySelector("[data-testid='weather-card']")?.textContent ?? '',
    sports:
      document.querySelector("[data-testid='sports-card']")?.textContent ?? '',
    weatherDefined: !!customElements.get('acme-weather-card'),
    sportsDefined: !!customElements.get('acme-sports-card'),
    nestedModuleId: document
      .querySelector('acme-weather-card > mountly-feature')
      ?.getAttribute('module-id'),
  }));

  expect(result.weather).toBe('weather:Bristol');
  expect(result.sports).toBe('');
  expect(result.weatherDefined).toBe(true);
  expect(result.sportsDefined).toBe(false);
  expect(result.nestedModuleId).toBe('weather-card');
});

test('defineMountlyFeature hydrates existing alias tags synchronously', async ({
  page,
}) => {
  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  const result = await page.evaluate(async () => {
    document.body.innerHTML = `
      <acme-weather-card trigger="click" props='{"city":"Bristol"}'></acme-weather-card>
    `;

    const { defineMountlyFeature } = await import(
      '/packages/mountly/dist/index.js'
    );
    defineMountlyFeature({
      baseUrl: '/tests/fixtures/dx-widgets',
      modules: ['weather-card'],
      prefix: 'acme',
    });

    const nested = document.querySelector(
      'acme-weather-card > mountly-feature'
    ) as HTMLElement | null;

    return {
      hasNested: !!nested,
      nestedModuleId: nested?.getAttribute('module-id') ?? null,
      nestedTrigger: nested?.getAttribute('trigger') ?? null,
      nestedProps: nested?.getAttribute('props') ?? null,
    };
  });

  expect(result.hasNested).toBe(true);
  expect(result.nestedModuleId).toBe('weather-card');
  expect(result.nestedTrigger).toBe('click');
  expect(result.nestedProps).toBe('{"city":"Bristol"}');
});

test('alias tags do not duplicate mounts during custom-element upgrade', async ({
  page,
}) => {
  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  const result = await page.evaluate(async () => {
    document.body.innerHTML = `
      <append-card trigger="idle" idle-timeout="1" props='{"id":"once"}'></append-card>
    `;

    const { defineMountlyFeature } = await import(
      '/packages/mountly/dist/index.js'
    );
    defineMountlyFeature('/tests/fixtures/dx-shared-bundle.js');

    await new Promise((resolve) => setTimeout(resolve, 30));

    return {
      count: document.querySelectorAll("[data-testid='appendCard']").length,
      text:
        document.querySelector("[data-testid='appendCard']")?.textContent ?? '',
    };
  });

  expect(result.count).toBe(1);
  expect(result.text).toBe('append:once');
});

test('modules array limits auto-registration for byte control', async ({
  page,
}) => {
  test.setTimeout(30_000);
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning') warnings.push(msg.text());
  });

  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  await page.evaluate(async () => {
    document.body.innerHTML = `
      <mountly-feature module-id="weather-card" trigger="idle" idle-timeout="1" props='{"city":"London"}'></mountly-feature>
    `;

    const { defineMountlyFeature } = await import(
      '/packages/mountly/dist/index.js'
    );
    defineMountlyFeature({
      baseUrl: '/tests/fixtures/dx-widgets',
      modules: ['weather-card'],
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await expect(page.locator("[data-testid='weather-card']")).toHaveText(
    'weather:London',
    { timeout: 10000 }
  );

  const result = await page.evaluate(() => ({
    weather:
      document.querySelector("[data-testid='weather-card']")?.textContent ?? '',
    sports:
      document.querySelector("[data-testid='sports-card']")?.textContent ?? '',
    weatherDefined: !!customElements.get('weather-card'),
    sportsDefined: !!customElements.get('sports-card'),
  }));

  expect(result.weather).toBe('weather:London');
  expect(result.sports).toBe('');
  expect(result.weatherDefined).toBe(true);
  expect(result.sportsDefined).toBe(false);
  expect(warnings).not.toEqual(
    expect.arrayContaining([expect.stringContaining('sports-card')])
  );
});

test('alias map lets a valid custom tag mount a non-hyphen module id', async ({
  page,
}) => {
  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  const result = await page.evaluate(async () => {
    document.body.innerHTML = `
      <pokemon-card trigger="idle" idle-timeout="1" props='{"id":"ditto"}'></pokemon-card>
    `;

    const { defineMountlyFeature } = await import(
      '/packages/mountly/dist/index.js'
    );
    defineMountlyFeature({
      modules: {
        pokemon: '/tests/fixtures/dx-pokemon-module.js',
      },
      aliases: {
        'pokemon-card': 'pokemon',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    return {
      text:
        document.querySelector("[data-testid='pokemon-module']")?.textContent ??
        '',
      aliasDefined: !!customElements.get('pokemon-card'),
      invalidTagDefined: !!customElements.get('pokemon'),
    };
  });

  expect(result.text).toBe('pokemon:ditto');
  expect(result.aliasDefined).toBe(true);
  expect(result.invalidTagDefined).toBe(false);
});

test('explicit modules map supports per-component bundle URLs', async ({
  page,
}) => {
  test.setTimeout(30_000);
  await page.goto('http://localhost:5175/tests/fixtures/empty.html');

  await page.evaluate(async () => {
    document.body.innerHTML = `
      <mountly-feature module-id="weather-card" trigger="idle" idle-timeout="1" props='{"city":"Paris"}'></mountly-feature>
      <mountly-feature module-id="sports-card" trigger="idle" idle-timeout="1" props='{"team":"PSG"}'></mountly-feature>
    `;

    const { defineMountlyFeature } = await import(
      '/packages/mountly/dist/index.js'
    );
    defineMountlyFeature({
      modules: {
        'weather-card': '/tests/fixtures/dx-widgets/weather-card/dist/index.js',
        'sports-card': '/tests/fixtures/dx-widgets/sports-card/dist/index.js',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await expect(page.locator("[data-testid='weather-card']")).toHaveText(
    'weather:Paris',
    { timeout: 10000 }
  );
  await expect(page.locator("[data-testid='sports-card']")).toHaveText(
    'sports:PSG',
    { timeout: 10000 }
  );

  const result = await page.evaluate(() => ({
    weather:
      document.querySelector("[data-testid='weather-card']")?.textContent ?? '',
    sports:
      document.querySelector("[data-testid='sports-card']")?.textContent ?? '',
  }));

  expect(result.weather).toBe('weather:Paris');
  expect(result.sports).toBe('sports:PSG');
});
