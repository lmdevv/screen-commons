export type Platform = "Web" | "iOS" | "Android";

export type PreviewKind =
  | "analytics"
  | "calendar"
  | "checkout"
  | "editor"
  | "inbox"
  | "music"
  | "settings"
  | "travel";

export interface ProductVersion {
  id: string;
  label: string;
  capturedAt: string;
  releaseNote: string;
}

export interface LibraryScreen {
  id: string;
  imageKey?: string;
  title: string;
  description: string;
  preview: PreviewKind;
  accent: string;
  capturedAt: string;
  viewport: string;
  visibleText: string[];
  tags: string[];
}

export interface LibraryFlow {
  id: string;
  name: string;
  description: string;
  productSlug: string;
  versionId: string;
  platform: Platform;
  category: string;
  screens: LibraryScreen[];
  updatedAt: string;
  contributor: string;
  featured?: boolean;
}

export interface LibraryProduct {
  slug: string;
  name: string;
  initials: string;
  description: string;
  accent: string;
  industry: string;
  platforms: Platform[];
  versions: ProductVersion[];
  flows: LibraryFlow[];
  tags: string[];
  updatedAt: string;
}

export interface CatalogFilters {
  query: string;
  platform: Platform | "All";
  category: string;
}
