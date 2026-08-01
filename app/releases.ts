import releaseData from "./releases.json";

export type ReleaseCategory = {
  name: string;
  items: string[];
};

export type GameRelease = {
  version: string;
  title: string;
  publishedAt: string;
  summary: string;
  categories: ReleaseCategory[];
};

export const RELEASES = releaseData satisfies GameRelease[];
export const CURRENT_RELEASE = RELEASES[0];
