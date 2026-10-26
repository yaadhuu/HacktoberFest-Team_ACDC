import { redirect } from "next/navigation";

/** Friend-invite landing: /<token> -> guest upload into that galaxy. Static routes (/galaxy, /upload...) take precedence. */
export default function InviteRedirect({ params }: { params: { token: string } }) {
  redirect(`/join?g=${encodeURIComponent(decodeURIComponent(params.token))}`);
}
