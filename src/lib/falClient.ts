import { fal } from "@fal-ai/client";

const FAL_ENDPOINT = "fal-ai/bytedance/seed3d/image-to-3d";

if (!process.env.FAL_KEY) {
  console.warn(
    "FAL_KEY is not set. API routes depending on fal.ai Seed3D will fail until it is configured."
  );
}

fal.config({
  credentials: process.env.FAL_KEY,
});

export { fal, FAL_ENDPOINT };
