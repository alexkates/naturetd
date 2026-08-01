import versionData from "./versions.json";

export type VersionAnnouncement = {
  version: string;
  title: string;
  publishedAt: string;
  summary: string;
  changes: string[];
};

export const VERSIONS = versionData satisfies VersionAnnouncement[];
export const CURRENT_VERSION = VERSIONS[0];
