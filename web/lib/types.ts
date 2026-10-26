export type ClusterId = string;

export type Cluster = {
  id: ClusterId;
  label: string;
  color: string;
  centroid: [number, number, number];
};

export type ImageItem = {
  id: string;
  url: string;
  thumb: string;
  caption: string;
  tags: string[];
  ocr?: string;
  cluster: ClusterId;
  xyz: [number, number, number];
  uploader?: { name: string; avatar?: string };
  source: "preloaded" | "live";
  createdAt: string;
};

export type SearchMatch = {
  image: ImageItem;
  score: number;
  reason: string;
  bbox?: { x: number; y: number; w: number; h: number };
};
