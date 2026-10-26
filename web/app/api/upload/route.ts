import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const b64 = `data:${file.type};base64,${bytes.toString("base64")}`;
    const res = await cloudinary.uploader.upload(b64, {
      folder: "bliss",
      resource_type: "image",
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    });
    const thumb = cloudinary.url(res.public_id, {
      width: 500, height: 625, crop: "fill", quality: "auto", fetch_format: "auto", secure: true,
    });
    return NextResponse.json({ url: res.secure_url, thumb, public_id: res.public_id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "upload failed" }, { status: 500 });
  }
}
