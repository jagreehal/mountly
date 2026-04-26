import {
  createOnDemandFeature,
  safeUnmount,
  type FeatureContext,
} from "mountly";
import * as mod from "./mount.js";
import type { ImageLightboxData } from "./Component.js";

export interface ImageLightboxContext extends FeatureContext {
  src?: string;
  alt?: string;
  caption?: string;
}

export const imageLightbox = createOnDemandFeature({
  moduleId: "image-lightbox",

  loadModule: async () => ({
    mount: mod.mountImageLightbox as (
      container: HTMLElement,
      props: Record<string, unknown>
    ) => void,
    unmount: mod.unmountImageLightbox,
    update: ((container: HTMLElement, props: Record<string, unknown>) => {
      const data = props.data as ImageLightboxData | undefined;
      if (!data) return;
      mod.updateImageLightbox(container, {
        data,
        onClose: () => safeUnmount(container),
      });
    }) as (container: HTMLElement, props: Record<string, unknown>) => void,
  }),

  render: ({ mod: featureMod, container, props }) => {
    const data = props.data as ImageLightboxData | undefined;
    if (!data) {
      throw new Error(
        "[image-lightbox] no data: pass { src, alt, caption? } as props.data"
      );
    }
    featureMod.mount(container, {
      data,
      onClose: () => safeUnmount(container),
    });
  },
});

export { ImageLightbox, type ImageLightboxData } from "./Component.js";
export {
  mountImageLightbox,
  unmountImageLightbox,
  updateImageLightbox,
} from "./mount.js";

/** Lightboxes are viewport-locked, so hosts don't need to reserve space — but
 *  they can use these hints for trigger thumbnails. */
export const imageLightboxDimensions = {
  thumbnailMinWidth: 120,
  thumbnailMinHeight: 80,
} as const;
