import type { App } from "@modelcontextprotocol/ext-apps";

export interface DownloadableFile {
  /** The name the user saves it as. */
  name: string;
  data: Blob | string;
  /** Defaults to the Blob's own type, or `text/plain` for a string. */
  mimeType?: string;
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  // Chunked: spreading a whole large file into one call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Hand the user a file. A View's iframe usually cannot download on its own, so
 * a host that supports `ui/download-file` is asked to save it, with its own
 * confirmation. Anywhere else — a host without it, the dev harness, an ordinary
 * page — an `<a download>` is clicked, which a strict sandbox may still block.
 *
 * Resolves `false` when the host declined or the user cancelled.
 */
export async function downloadFile(app: App | undefined, file: DownloadableFile): Promise<boolean> {
  const text = typeof file.data === "string";
  const mimeType =
    file.mimeType || (text ? "text/plain" : (file.data as Blob).type) || "application/octet-stream";

  if (app?.getHostCapabilities()?.downloadFile) {
    const uri = `file:///${encodeURIComponent(file.name)}`;
    const resource = text
      ? { uri, mimeType, text: file.data as string }
      : { uri, mimeType, blob: await base64(file.data as Blob) };
    const { isError } = await app.downloadFile({ contents: [{ type: "resource", resource }] });
    return !isError;
  }

  const blob = text ? new Blob([file.data], { type: mimeType }) : (file.data as Blob);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking on the same tick can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
