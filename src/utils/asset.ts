const FALLBACK_KEY = "seed3d-asset";

const slugify = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const deriveAssetKey = (rawName?: string | null) => {
  const trimmed = rawName?.trim();
  if (!trimmed) {
    return FALLBACK_KEY;
  }

  const fileName = trimmed.split(/[\\/]/).pop() || trimmed;
  const withoutExt = fileName.replace(/\.[^/.\\]+$/, "");
  const slug = slugify(withoutExt);

  return slug || FALLBACK_KEY;
};
