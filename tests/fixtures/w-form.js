// Light-DOM form: inputs must stay reachable to the page and to form APIs.
export default {
  mount(el) {
    const form = document.createElement("form");
    form.className = "widget-form";
    form.innerHTML = `<input type="text" name="test-field" class="test-input" value="test-value" /><button type="submit">Submit</button>`;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      window.__formSubmitted = true;
      window.__formValue = form.querySelector(".test-input").value;
    });
    el.replaceChildren(form);
  },
  unmount(el) {
    el.replaceChildren();
  },
};
