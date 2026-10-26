import { redirect } from "next/navigation";
import { CURRENT_USERNAME } from "@/lib/user";

export default function ProfileRedirect() {
  redirect(`/u/${CURRENT_USERNAME}`);
}
