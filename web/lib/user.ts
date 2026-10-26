import { IMAGES } from "./mock";
import type { ImageItem } from "./types";

export type Profile = {
  username: string;
  displayName: string;
  bio: string;
  avatar: string;
  joined: string;
  badges: { id: string; label: string }[];
};

export const PROFILES: Record<string, Profile> = {
  sarah: {
    username: "sarah",
    displayName: "Sarah Jenkins",
    bio: "Visual archivist. Chasing high-chroma summers.",
    avatar: "https://i.pravatar.cc/120?img=47",
    joined: "2024-06-02",
    badges: [
      { id: "first", label: "First Light" },
      { id: "explorer", label: "Explorer" },
    ],
  },
  ravi: {
    username: "ravi",
    displayName: "Ravi Kumar",
    bio: "Lab notes and city textures.",
    avatar: "https://i.pravatar.cc/120?img=12",
    joined: "2024-11-14",
    badges: [{ id: "founder", label: "Cluster Founder" }],
  },
};

export const CURRENT_USERNAME = "sarah";

export function imagesForUser(username: string): ImageItem[] {
  const name = PROFILES[username]?.displayName.split(" ")[0];
  if (!name) return [];
  return IMAGES.filter((i) => i.uploader?.name?.startsWith(name));
}

export function statsForUser(username: string) {
  const imgs = imagesForUser(username);
  const clusters = new Set(imgs.map((i) => i.cluster));
  return { photos: imgs.length, clusters: clusters.size, searches: 24 };
}
