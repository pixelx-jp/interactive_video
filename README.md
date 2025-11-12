## Seed3D Demo Web

Interactive demo that turns a single image into a 3D model using the
[`fal-ai/bytedance/seed3d/image-to-3d`](https://fal.ai/models/fal-ai/bytedance/seed3d/image-to-3d/api)
endpoint. The UI lets you:

- upload your own image or use the bundled `caregiver_frame_0000s.jpg`
- follow the queue status/logs exposed by the fal.ai API
- download the generated ZIP, extract the GLB, and rotate/zoom it directly in the browser

### Prerequisites

1. **fal.ai API key** – store it in `seed3d-demo/.env.local` as `FAL_KEY=...`.
   The repo-level `.env` already contains `Flux_API_KEY`; copy that value to
   `FAL_KEY` or use your own fal.ai key.
2. Node 18+ (Next.js 16 requirement)

### Install & run

```bash
cd seed3d-demo
npm install
cp .env.local.example .env.local   # add your FAL_KEY
npm run dev
```

Visit `http://localhost:3000` and start a job. Building for production:

```bash
npm run build
npm run start
```

### How it works

- `app/api/jobs` – accepts a `multipart/form-data` upload, converts the file
  to a Base64 data URI (per fal.ai docs) and enqueues a Seed3D job with
  `fal.queue.submit`.
- `app/api/jobs/[requestId]` – polls fal.ai for queue status, returning logs
  and final download URL (`model.url`) plus `usage_tokens`。完成时会自动下载
  fal 提供的 ZIP，并把它保存到 `public/generated/<asset>.zip`
 （`<asset>` 来自输入图片文件名的 slug），同时解压出
  `public/generated/<asset>.glb` 供前端直接引用（所有路径都会在 API
  响应里返回）。
- `app/page.tsx` – client-side React UI that:
  - allows the caregiver sample to be pre-loaded
  - polls `/api/jobs/:id` every 5s until `COMPLETED`
  - downloads the ZIP once, extracts the GLB via `fflate`, and renders it with a
    `<model-viewer>` powered wrapper so the mouse can orbit/zoom.

### Sample assets

`public/samples/caregiver_frame_0000s.jpg` is copied from
`../caregiver_frames/` for quick manual tests.

### 缓存与本地副本

- 选图时会先根据文件名生成 `assetKey`（例如 `caregiver_frame_0000s`）并检查
  `public/generated/<assetKey>.glb` 是否已存在；如有，直接加载该 GLB，跳过
  Seed3D 推理，同时在界面上展示本地路径与下载链接。
- 如果需要重新生成同名图片，可点击“强制重新生成”，新的结果会覆盖
  `public/generated/<assetKey>.zip|.glb`。
- `.gitignore` 已忽略 `public/generated/*`，但可通过
  `http://localhost:3000/generated/<assetKey>.zip` 或 `.glb`
  下载备份。ZIP 中仍包含 Seed3D 提供的全部材质文件。
