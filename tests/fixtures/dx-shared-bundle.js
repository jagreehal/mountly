function makeWidget(name) {
  return {
    mount(container, props = {}) {
      container.innerHTML = `<span data-testid="${name}">${name}:${
        props.id ?? 'none'
      }</span>`;
    },
    unmount(container) {
      container.innerHTML = '';
    },
  };
}

export const pokemonCard = makeWidget('pokemonCard');
export const weatherCard = makeWidget('weatherCard');
export const sportsCard = makeWidget('sportsCard');
export const appendCard = {
  mount(container, props = {}) {
    const el = document.createElement('section');
    el.dataset.testid = 'appendCard';
    el.textContent = `append:${props.id ?? 'none'}`;
    container.appendChild(el);
  },
  unmount(container) {
    container.replaceChildren();
  },
};

export default makeWidget('defaultWidget');
