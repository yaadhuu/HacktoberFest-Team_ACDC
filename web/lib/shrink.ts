/** Downscale to <=2000px JPEG in the browser: keeps uploads under Vercel's 4.5 MB request cap. */
export async function shrinkImage(file: File, max = 2000): Promise<File> {
  if (file.size < 1.5 * 1024 * 1024 && !/heic|heif/i.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.86));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified }) : file;
  } catch {
    return file;
  }
}
