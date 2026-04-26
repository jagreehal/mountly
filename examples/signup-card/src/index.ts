import {
  createOnDemandFeature,
  safeUnmount,
  type FeatureContext,
} from "mountly";
import * as mod from "./mount.js";

export interface SignupCardContext extends FeatureContext {
  // Add your own context fields here (they're merged into the FeatureContext
  // handed to loadData). Keep them serializable if you want data-cache dedup.
  [key: string]: unknown;
}

export const signupCard = createOnDemandFeature({
  moduleId: "signup-card",

  loadModule: async () => ({
    mount: mod.mountSignupCard as (
      container: HTMLElement,
      props: Record<string, unknown>
    ) => void,
    unmount: mod.unmountSignupCard,
    update: mod.updateSignupCard,
  }),

  // Optional: implement if your widget fetches data at activation.
  //
  // loadData: async (ctx) => {
  //   const r = await fetch(`/api/your-endpoint/${ctx.id}`);
  //   if (!r.ok) throw new Error(r.statusText);
  //   return r.json();
  // },

  render: ({ mod: featureMod, data, container, props }) => {
    featureMod.mount(container, {
      data: data ?? (props.data as unknown) ?? null,
      onClose: () => safeUnmount(container),
    });
  },
});

export { SignupCard } from "./Component.js";
export {
  mountSignupCard,
  unmountSignupCard,
  updateSignupCard,
} from "./mount.js";
