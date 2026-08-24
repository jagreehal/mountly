// Mounts markup that itself contains an island: the core's MutationObserver
// is what makes the child work, with no parent/child ordering knob.
export default {
  mount(el) {
    el.innerHTML = `<div id="child" data-mountly="/tests/fixtures/w-echo.js" data-props='{"msg":"child"}'>child</div>`;
  },
  unmount(el) {
    el.replaceChildren();
  },
};
