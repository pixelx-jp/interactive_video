"use client";

import { unzipSync } from "fflate";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Upload, Play, Pause, Pencil, Hand, Trash2, Image as ImageIcon, Sparkles, Send } from "lucide-react";

import { ModelPreview } from "../components/ModelPreview";

const POLL_INTERVAL = 5000;

// Supported locales and their labels/flags for the language dropdown
const LOCALES = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "vi", label: "Vietnamese", flag: "🇻🇳" },
  { code: "id", label: "Indonesian", flag: "🇮🇩" },
  { code: "fil", label: "Filipino", flag: "🇵🇭" },
  { code: "my", label: "Burmese", flag: "🇲🇲" },
  { code: "zh-CN", label: "Chinese (Simplified)", flag: "🇨🇳" },
  { code: "th", label: "Thai", flag: "🇹🇭" },
  { code: "pt-BR", label: "Portuguese (Brazil)", flag: "🇧🇷" },
  { code: "hi", label: "Hindi", flag: "🇮🇳" },
] as const;

type FrameInfo = {
  timestamp: number;
  filename: string;
  path: string;
  url: string;
};

type FrameResult = {
  filename: string;
  assetKey: string;
  cached: boolean;
  glbUrl?: string;
  requestId?: string;
  error?: string;
};

type ModelState = {
  filename: string;
  assetKey: string;
  timestamp: number;
  status: "cached" | "generating" | "completed" | "failed";
  glbUrl?: string;
  requestId?: string;
  error?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  generatedImage?: string;
};

export default function Home() {
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState<FrameInfo[]>([]);
  const [models, setModels] = useState<ModelState[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState("#ff0000");
  const [drawWidth, setDrawWidth] = useState(3);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [sendVideoFrame, setSendVideoFrame] = useState(true);
  const [sendModelFrame, setSendModelFrame] = useState(true);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [enableImageGen, setEnableImageGen] = useState(false);

  // Language selection and translation state
  const [selectedLocale, setSelectedLocale] = useState<string>("en");
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const originalHtmlRef = useRef<string | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);

  const videoObjectUrl = useRef<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const modelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const modelContainerRef = useRef<HTMLDivElement | null>(null);
  const imageUploadRef = useRef<HTMLInputElement | null>(null);

  // 清理定时器和对象URL
  useEffect(() => {
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
      }
      if (videoObjectUrl.current) {
        URL.revokeObjectURL(videoObjectUrl.current);
      }
    };
  }, []);

  // 同步模型canvas尺寸
  useEffect(() => {
    const syncModelCanvasSize = () => {
      if (modelContainerRef.current && modelCanvasRef.current) {
        const container = modelContainerRef.current;
        const rect = container.getBoundingClientRect();
        modelCanvasRef.current.width = rect.width;
        modelCanvasRef.current.height = rect.height;
      }
    };

    // 延迟同步，确保容器已渲染
    const timeoutId = setTimeout(syncModelCanvasSize, 100);
    window.addEventListener('resize', syncModelCanvasSize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', syncModelCanvasSize);
    };
  }, [models.length, selectedModelIndex]);

  /**
   * Capture the current English HTML baseline so we can safely translate
   * from English to a target locale without breaking event handlers.
   */
  const captureOriginalHtml = useCallback(() => {
    // If document is available, snapshot the current body HTML as baseline
    originalHtmlRef.current = typeof document !== "undefined" ? document.body.innerHTML : null;
  }, []);

  /**
   * Keep the English baseline up-to-date while English is selected.
   * We disconnect the observer when a non-English locale is active.
   */
  useEffect(() => {
    // If current selected locale is English, attach a mutation observer
    if (selectedLocale === "en") {
      // If there is an existing observer, disconnect it to avoid duplicates
      if (mutationObserverRef.current) {
        // Branch: observer exists, disconnect before re-attaching
        mutationObserverRef.current.disconnect();
      } else {
        // Branch: no observer exists, continue to create one
      }

      // Create a fresh observer to keep baseline synced with page changes
      mutationObserverRef.current = new MutationObserver(() => {
        // Update baseline whenever DOM changes while English is active
        originalHtmlRef.current = document.body.innerHTML;
      });
      mutationObserverRef.current.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // Initial capture to seed the baseline
      captureOriginalHtml();
    } else {
      // If a non-English locale is active, disconnect observer to avoid capturing translated HTML
      if (mutationObserverRef.current) {
        // Branch: observer exists, disconnect now
        mutationObserverRef.current.disconnect();
        mutationObserverRef.current = null;
      } else {
        // Branch: observer not present, nothing to do
      }
    }

    // Cleanup: always disconnect observer on unmount
    return () => {
      if (mutationObserverRef.current) {
        // Branch: observer exists during cleanup, disconnect
        mutationObserverRef.current.disconnect();
        mutationObserverRef.current = null;
      } else {
        // Branch: no observer during cleanup, nothing to do
      }
    };
  }, [selectedLocale, captureOriginalHtml]);

  /**
   * Translate the page by updating text nodes only, preserving event handlers.
   * This calls our server API, which invokes Lingo.dev to localize the HTML.
   */
  const translatePage = useCallback(
    async (targetLocale: string) => {
      // If already translating, skip to prevent concurrent translations
      if (isTranslating) {
        // Branch: translation already in progress; do nothing
        return;
      } else {
        // Branch: not translating; proceed
      }

      setIsTranslating(true);

      try {
        // If target is English, restore from original baseline rather than calling API
        if (targetLocale === "en") {
          // Branch: user selected English; restore text nodes from baseline snapshot
          if (originalHtmlRef.current) {
            // Apply baseline by updating text nodes only
            const parser = new DOMParser();
            const doc = parser.parseFromString(originalHtmlRef.current, "text/html");
            const sourceIterator = doc.createNodeIterator(doc.body, NodeFilter.SHOW_TEXT);
            const targetIterator = document.createNodeIterator(document.body, NodeFilter.SHOW_TEXT);

            let srcNode = sourceIterator.nextNode() as Text | null;
            let tgtNode = targetIterator.nextNode() as Text | null;

            while (srcNode && tgtNode) {
              // Skip excluded tags on source side
              const srcParentName = (srcNode.parentNode?.nodeName ?? "").toUpperCase();
              if (
                srcParentName === "SCRIPT" ||
                srcParentName === "STYLE" ||
                srcParentName === "NOSCRIPT" ||
                srcParentName === "TEXTAREA" ||
                srcParentName === "INPUT" ||
                srcParentName === "SELECT"
              ) {
                // Branch: source node under excluded tag; advance both iterators
                srcNode = sourceIterator.nextNode() as Text | null;
                tgtNode = targetIterator.nextNode() as Text | null;
                continue;
              } else {
                // Branch: source node under allowed tag; continue
              }

              // Skip excluded tags on target side
              const tgtParentName = (tgtNode.parentNode?.nodeName ?? "").toUpperCase();
              if (
                tgtParentName === "SCRIPT" ||
                tgtParentName === "STYLE" ||
                tgtParentName === "NOSCRIPT" ||
                tgtParentName === "TEXTAREA" ||
                tgtParentName === "INPUT" ||
                tgtParentName === "SELECT"
              ) {
                // Branch: target node under excluded tag; advance both iterators
                srcNode = sourceIterator.nextNode() as Text | null;
                tgtNode = targetIterator.nextNode() as Text | null;
                continue;
              } else {
                // Branch: target node under allowed tag; continue
              }

              // Update target text content with original English content
              tgtNode.nodeValue = srcNode.nodeValue;

              // Move to next nodes
              srcNode = sourceIterator.nextNode() as Text | null;
              tgtNode = targetIterator.nextNode() as Text | null;
            }
          } else {
            // Branch: no baseline snapshot available; nothing to restore
          }

          setIsTranslating(false);
          return;
        } else {
          // Branch: non-English target selected; proceed with translation call
        }

        // Ensure we have an English baseline before translating
        if (!originalHtmlRef.current) {
          // Branch: baseline missing; capture current DOM as fallback
          originalHtmlRef.current = document.body.innerHTML;
        } else {
          // Branch: baseline exists; use it for translation
        }

        const htmlToTranslate = originalHtmlRef.current ?? document.body.innerHTML;

        // Before calling external API: send HTML to our server for translation via Lingo.dev
        const resp = await fetch("/api/translate-html", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            html: htmlToTranslate,
            sourceLocale: "en",
            targetLocale,
          }),
        });

        // Handle server errors explicitly; show a helpful message
        if (!resp.ok) {
          // Branch: server responded with non-OK; surface error response
          const payload = await resp.json();
          throw new Error(payload.error || "Translation failed");
        } else {
          // Branch: server responded OK; continue
        }

        const payload = await resp.json();
        const translatedHtml: string = payload.translated;

        // Update text nodes only to preserve event listeners and React bindings
        const parser = new DOMParser();
        const translatedDoc = parser.parseFromString(translatedHtml, "text/html");
        const sourceIterator = translatedDoc.createNodeIterator(translatedDoc.body, NodeFilter.SHOW_TEXT);
        const targetIterator = document.createNodeIterator(document.body, NodeFilter.SHOW_TEXT);

        let srcNode = sourceIterator.nextNode() as Text | null;
        let tgtNode = targetIterator.nextNode() as Text | null;

        while (srcNode && tgtNode) {
          // Skip excluded tags on source side
          const srcParentName = (srcNode.parentNode?.nodeName ?? "").toUpperCase();
          if (
            srcParentName === "SCRIPT" ||
            srcParentName === "STYLE" ||
            srcParentName === "NOSCRIPT" ||
            srcParentName === "TEXTAREA" ||
            srcParentName === "INPUT" ||
            srcParentName === "SELECT"
          ) {
            // Branch: source node under excluded tag; advance
            srcNode = sourceIterator.nextNode() as Text | null;
            tgtNode = targetIterator.nextNode() as Text | null;
            continue;
          } else {
            // Branch: source node under allowed tag; continue
          }

          // Skip excluded tags on target side
          const tgtParentName = (tgtNode.parentNode?.nodeName ?? "").toUpperCase();
          if (
            tgtParentName === "SCRIPT" ||
            tgtParentName === "STYLE" ||
            tgtParentName === "NOSCRIPT" ||
            tgtParentName === "TEXTAREA" ||
            tgtParentName === "INPUT" ||
            tgtParentName === "SELECT"
          ) {
            // Branch: target node under excluded tag; advance
            srcNode = sourceIterator.nextNode() as Text | null;
            tgtNode = targetIterator.nextNode() as Text | null;
            continue;
          } else {
            // Branch: target node under allowed tag; continue
          }

          // Apply translated text content
          tgtNode.nodeValue = srcNode.nodeValue;

          // Move forward
          srcNode = sourceIterator.nextNode() as Text | null;
          tgtNode = targetIterator.nextNode() as Text | null;
        }
      } catch (err: unknown) {
        // Log any translation error and show it via existing error banner
        const message = err instanceof Error ? err.message : "Unknown translation error";
        setError(`Translation error: ${message}`);
        console.error("Translation error:", err);
      } finally {
        // Always clear translating state
        setIsTranslating(false);
      }
    },
    [isTranslating]
  );

  /**
   * Handle changes from the language dropdown and trigger translation.
   */
  const handleLocaleChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value;
    setSelectedLocale(newLocale);
    await translatePage(newLocale);
  };

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    // 清理之前的状态
    if (videoObjectUrl.current) {
      URL.revokeObjectURL(videoObjectUrl.current);
      videoObjectUrl.current = null;
    }

    setSelectedVideo(file);
    setVideoUrl(null);
    setFrames([]);
    setModels([]);
    setLogs([]);
    setError(null);
    setIsPlaying(false);

    if (file) {
      const url = URL.createObjectURL(file);
      videoObjectUrl.current = url;
      setVideoUrl(url);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    // 找到最接近当前时间的模型
    if (models.length > 0) {
      let closestIndex = 0;
      let minDiff = Math.abs(models[0].timestamp - time);

      models.forEach((model, index) => {
        const diff = Math.abs(model.timestamp - time);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = index;
        }
      });

      setSelectedModelIndex(closestIndex);
    }
  };

  // Drawing functions
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode) return;
    setIsDrawing(true);
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // 计算canvas坐标（考虑canvas内部尺寸和显示尺寸的比例）
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isDrawingMode) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // 计算canvas坐标（考虑canvas内部尺寸和显示尺寸的比例）
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      ctx.strokeStyle = drawColor;
      ctx.lineWidth = drawWidth * scaleX; // 线宽也需要缩放
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
    /**
     * Clear the drawing on the provided canvas reference safely.
     * Accepts a nullable ref to avoid type errors when the ref is not yet mounted.
     */
    const ref = canvasRef as React.RefObject<HTMLCanvasElement | null>;
    if (ref.current) {
      // Branch: canvas element is available; clear its contents
      const ctx = ref.current.getContext("2d");
      if (ctx) {
        // Branch: 2D context obtained; perform clear
        ctx.clearRect(0, 0, ref.current.width, ref.current.height);
      } else {
        // Branch: 2D context not available; skip clearing
      }
    } else {
      // Branch: canvas ref is null; nothing to clear
    }
  };

  // 处理图片上传
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setUploadedImages((prev) => [...prev, result]);
        }
      };
      reader.readAsDataURL(file);
    });

    // 重置input以允许重复上传同一文件
    e.target.value = "";
  };

  // 获取当前视频帧的截图（包含涂画）
  const captureVideoFrame = (): string | null => {
    if (!videoRef.current) return null;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      // 绘制视频帧
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 叠加涂画层
      if (videoCanvasRef.current) {
        ctx.drawImage(videoCanvasRef.current, 0, 0, canvas.width, canvas.height);
      }

      return canvas.toDataURL("image/jpeg", 0.8);
    }

    return null;
  };

  // 获取3D模型的截图（包含涂画）
  const captureModelView = async (): Promise<string | null> => {
    if (!modelContainerRef.current) return null;

    const container = modelContainerRef.current;

    try {
      // 查找model-viewer元素并进行类型声明以避免使用 any
      const modelViewer = container.querySelector(
        "model-viewer"
      ) as (HTMLElement & { toDataURL: (type?: string, quality?: number) => string }) | null;
      if (!modelViewer) return null;

      // 获取model-viewer的截图
      const modelDataUrl = modelViewer.toDataURL("image/jpeg", 0.8);

      // 如果没有涂画层，直接返回model截图
      if (!modelCanvasRef.current) {
        return modelDataUrl;
      }

      // 创建canvas来合成model和涂画层
      return new Promise((resolve) => {
        const modelImage = new Image();
        modelImage.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = container.clientWidth;
          canvas.height = container.clientHeight;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            // 绘制model-viewer
            ctx.drawImage(modelImage, 0, 0, canvas.width, canvas.height);

            // 叠加涂画层
            if (modelCanvasRef.current) {
              ctx.drawImage(modelCanvasRef.current, 0, 0, canvas.width, canvas.height);
            }

            resolve(canvas.toDataURL("image/jpeg", 0.8));
          } else {
            resolve(modelDataUrl);
          }
        };
        modelImage.onerror = () => resolve(modelDataUrl);
        modelImage.src = modelDataUrl;
      });
    } catch (error) {
      console.error("Failed to capture model view:", error);
      return null;
    }
  };

  // 发送聊天消息
  const handleSendChat = async () => {
    if (!chatInput.trim() || isSendingChat) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setIsSendingChat(true);

    // 添加用户消息到聊天记录
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      // 根据checkbox状态捕获图片
      const frameImage = sendVideoFrame ? captureVideoFrame() : null;
      const modelImage = sendModelFrame ? await captureModelView() : null;

      // 保存debug图片
      if (frameImage || modelImage || uploadedImages.length > 0) {
        await fetch("/api/save-debug-images", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            frameImage,
            modelImage,
            uploadedImages,
            timestamp: Date.now(),
          }),
        }).catch(err => console.error("Failed to save debug images:", err));
      }

      let generatedImage: string | undefined;
      let replyText = "";

      // 如果启用了图片生成，直接生成图片，不调用chat API
      if (enableImageGen) {
        const sourceImage = frameImage || modelImage || (uploadedImages.length > 0 ? uploadedImages[0] : null);

        if (sourceImage) {
          try {
            const imageGenResponse = await fetch("/api/generate-image", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                image: sourceImage,
                prompt: userMessage,
              }),
            });

            const imageGenData = await imageGenResponse.json();

            if (imageGenResponse.ok && imageGenData.imageUrl) {
              generatedImage = imageGenData.imageUrl;
            } else {
              console.error("Image generation failed:", imageGenData.error);
              replyText = `Image generation failed: ${imageGenData.error}`;
            }
          } catch (imageError) {
            console.error("Image generation error:", imageError);
            replyText = `Image generation error: ${imageError instanceof Error ? imageError.message : "Unknown error"}`;
          }
        } else {
          replyText = "No image source available for generation";
        }
      } else {
        // 如果没有启用图片生成，调用chat API获取文字回复
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: userMessage,
            frameImage,
            modelImage,
            uploadedImages,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Chat failed");
        }

        replyText = data.reply;
      }

      // 发送后清空上传的图片
      setUploadedImages([]);

      // 添加助手回复到聊天记录
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: replyText, generatedImage },
      ]);
    } catch (error) {
      console.error("Chat error:", error);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
        },
      ]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleTransform = async () => {
    if (!selectedVideo) {
      setError("Please select a video file first");
      return;
    }

    setIsExtracting(true);
    setError(null);
    setLogs([]);
    setFrames([]);
    setModels([]);

    // Step 1: 提取视频帧
    const formData = new FormData();
    formData.append("video", selectedVideo);

    try {
      const extractResponse = await fetch("/api/extract-frames", {
        method: "POST",
        body: formData,
      });

      const extractData = await extractResponse.json();

      if (!extractResponse.ok) {
        throw new Error(extractData.error || "Frame extraction failed");
      }

      const extractedFrames = extractData.frames;
      setFrames(extractedFrames);

      // Step 2: 批量生成3D模型
      setIsExtracting(false);
      setIsGenerating(true);

      const generateResponse = await fetch("/api/generate-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          frames: extractedFrames.map((f: FrameInfo) => ({
            filename: f.filename,
            url: f.url,
          })),
        }),
      });

      const generateData = await generateResponse.json();

      if (!generateResponse.ok) {
        throw new Error(generateData.error || "Batch generation failed");
      }

      const results: FrameResult[] = generateData.results;

      // 初始化模型状态
      const initialModels: ModelState[] = results.map((result, index) => {
        // 从filename提取timestamp (例如 video_name_0.jpg -> 0)
        const match = result.filename.match(/_(\d+)\./);
        const timestamp = match ? parseInt(match[1]) : index * 2;

        return {
          filename: result.filename,
          assetKey: result.assetKey,
          timestamp,
          status: result.error
            ? "failed"
            : result.cached
            ? "cached"
            : "generating",
          glbUrl: result.glbUrl,
          requestId: result.requestId,
          error: result.error,
        };
      });

      setModels(initialModels);

      // 设置初始选中的模型为第一个（0s）
      setSelectedModelIndex(0);
      setCurrentTime(0);
      setIsPlaying(false);

      // 开始轮询生成中的任务
      const toGenerateCount = results.filter((r) => !r.cached && !r.error).length;
      if (toGenerateCount > 0) {
        startPolling(initialModels);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setIsExtracting(false);
      setIsGenerating(false);
    }
  };

  const downloadAndExtractGlb = async (zipUrl: string): Promise<string> => {
    const response = await fetch(zipUrl);
    if (!response.ok) {
      throw new Error("Model download failed");
    }
    const archive = new Uint8Array(await response.arrayBuffer());
    const files = unzipSync(archive);
    const glbEntry = Object.keys(files).find((name) =>
      name.toLowerCase().endsWith(".glb")
    );
    if (!glbEntry) {
      throw new Error("GLB file not found in archive");
    }
    const glbBytes = new Uint8Array(files[glbEntry]);
    const blob = new Blob([glbBytes], {
      type: "model/gltf-binary",
    });
    return URL.createObjectURL(blob);
  };

  const checkJobStatus = useCallback(
    async (model: ModelState): Promise<ModelState> => {
      if (!model.requestId) return model;

      try {
        const response = await fetch(
          `/api/jobs/${model.requestId}?asset=${encodeURIComponent(model.assetKey)}`
        );
        const payload = await response.json();

        if (!response.ok) {
          return {
            ...model,
            status: "failed",
            error: payload.error || "Generation failed",
          };
        }

        if (payload.status === "COMPLETED") {
          if (payload.result?.localGlbUrl) {
            // 服务器已保存文件到 public/generated/，直接使用
            return {
              ...model,
              status: "completed",
              glbUrl: payload.result.localGlbUrl,
            };
          } else if (payload.result?.modelUrl) {
            // 备用方案：下载并解压（不推荐，因为不会持久化）
            const glbUrl = await downloadAndExtractGlb(payload.result.modelUrl);
            return {
              ...model,
              status: "completed",
              glbUrl,
            };
          }
        } else if (payload.status === "FAILED") {
          return {
            ...model,
            status: "failed",
            error: payload.error || "Generation failed",
          };
        }

        return model;
      } catch (err) {
        console.error(`检查任务 ${model.requestId} 失败:`, err);
        return model;
      }
    },
    []
  );


  const startPolling = useCallback(
    (initialModels: ModelState[]) => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
      }

      const checkAndUpdate = async () => {
        setModels((currentModels) => {
          const generatingModels = currentModels.filter(
            (m) => m.status === "generating"
          );

          if (generatingModels.length === 0) {
            if (pollTimer.current) {
              clearInterval(pollTimer.current);
              pollTimer.current = null;
              // 使用 setTimeout 来避免在 setState 中调用 addLog
              setTimeout(() => addLog("All models generated"), 0);
            }
            return currentModels;
          }

          // 并行检查所有生成中的任务
          Promise.all(
            generatingModels.map((model) => checkJobStatus(model))
          ).then((updatedModels) => {
            setModels((prev) => {
              const newModels = [...prev];
              let hasCompleted = false;
              updatedModels.forEach((updated) => {
                const index = newModels.findIndex(
                  (m) => m.assetKey === updated.assetKey
                );
                if (index !== -1) {
                  const wasGenerating = newModels[index].status === "generating";
                  const isCompleted = updated.status === "completed";
                  if (wasGenerating && isCompleted) {
                    hasCompleted = true;
                    setTimeout(() =>
                      addLog(`✓ ${updated.filename} generated (saved locally)`),
                      0
                    );
                  }
                  newModels[index] = updated;
                }
              });
              return newModels;
            });
          });

          return currentModels;
        });
      };

      // 立即检查一次
      checkAndUpdate();
      // 然后定期检查
      pollTimer.current = setInterval(checkAndUpdate, POLL_INTERVAL);
    },
    [checkJobStatus, addLog]
  );

  const isBusy = isExtracting || isGenerating;
  const hasGeneratingModels = models.some((m) => m.status === "generating");

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-7xl space-y-8">

        {/* Language Selector Bar */}
        <div className="flex justify-end items-center gap-2">
          <label className="text-xs text-secondary">Language</label>
          <select
            aria-label="Select language"
            value={selectedLocale}
            onChange={handleLocaleChange}
            className="text-sm rounded-sm px-2 py-1 border bg-white"
            disabled={isTranslating}
          >
            {LOCALES.map((loc) => (
              <option key={loc.code} value={loc.code}>
                {loc.flag} {loc.label}
              </option>
            ))}
          </select>
          {isTranslating && (
            <div className="flex items-center gap-1 text-xs text-secondary" aria-live="polite">
              <span
                className="h-3 w-3 animate-spin rounded-full border"
                style={{ borderColor: "#1f1e1b", borderTopColor: "transparent" }}
              />
              <span>Translating…</span>
            </div>
          )}
        </div>

        {/* Header */}
        <header className="text-center space-y-2">
          <h1 className="text-3xl tracking-tight text-[color:var(--ss-text-primary)]">
            Interactive Training
          </h1>
          <p className="text-sm text-secondary">
            Transform videos into interactive 3D learning experiences
          </p>
        </header>

        {/* Main Content */}
        <div className="space-y-8">
          {/* Upload & Video Section */}
          <section className="mx-auto max-w-4xl space-y-4">
            {!videoUrl && (
              <div className="ss-surface p-8 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleVideoChange}
                  disabled={isBusy}
                  className="hidden"
                  id="video-upload"
                />
                <label
                  htmlFor="video-upload"
                  className="flex flex-col items-center gap-4 cursor-pointer"
                >
                  <div className="p-4 rounded-sm border border-[color:var(--ss-border)] bg-white/50">
                    <Upload className="h-8 w-8 text-[color:var(--ss-text-secondary)]" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-[color:var(--ss-text-primary)]">
                      Click to upload video
                    </p>
                    <p className="text-xs text-secondary">
                      MP4, MOV, or other video formats
                    </p>
                  </div>
                </label>
              </div>
            )}

            {videoUrl && models.length === 0 && (
              <div className="mx-auto w-full max-w-4xl space-y-4">
                <div className="relative overflow-hidden ss-surface">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full bg-black rounded-[calc(var(--ss-radius-md)-1px)]"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={(e) => {
                      const video = e.currentTarget;
                      if (videoCanvasRef.current) {
                        // 使用视频元素的实际显示尺寸
                        videoCanvasRef.current.width = video.clientWidth;
                        videoCanvasRef.current.height = video.clientHeight;
                      }
                    }}
                  />
                  {isBusy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
                      <div className="h-12 w-12 animate-spin rounded-full border-2" style={{ borderColor: '#1f1e1b', borderTopColor: 'transparent' }}></div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                  <Button
                    onClick={togglePlay}
                    isDisabled={isBusy}
                    isIconOnly
                    variant="bordered"
                    size="sm"
                    className="border-[color:var(--ss-border)] text-[color:var(--ss-text-primary)] hover:bg-[rgba(31,30,27,0.04)] rounded-sm"
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <button
                    onClick={handleTransform}
                    disabled={isBusy || !selectedVideo}
                    className="rounded-sm px-8 py-3 text-xs uppercase tracking-[0.32em] hover:bg-[rgba(31,30,27,0.04)] disabled:cursor-not-allowed transition-all border"
                    style={{
                      borderColor: '#1f1e1b',
                      color: '#1f1e1b',
                      opacity: (isBusy || !selectedVideo) ? 0.5 : 1
                    }}
                  >
                    {isBusy
                      ? isExtracting
                        ? "EXTRACTING..."
                        : "GENERATING..."
                      : "TRANSFORM"}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="ss-surface px-4 py-3 text-sm text-secondary border-rose-500/40">
                {error}
              </div>
            )}
          </section>

          {/* Video & 3D Model Side by Side + Play Controls */}
          {models.length > 0 && (
            <section className="mx-auto max-w-7xl space-y-4">
              {/* Control Bar */}
              <div className="relative z-10 flex items-center justify-center gap-2">
                {/* Play/Pause Button */}
                <Button
                  onClick={togglePlay}
                  isIconOnly
                  variant="bordered"
                  size="sm"
                  className="border-[color:var(--ss-border)] text-[color:var(--ss-text-primary)] hover:bg-[rgba(31,30,27,0.04)] rounded-sm"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>

                {/* Drawing Mode Toggle */}
                <Button
                  onClick={() => setIsDrawingMode(!isDrawingMode)}
                  isIconOnly
                  variant="bordered"
                  size="sm"
                  className="rounded-sm"
                  style={{
                    borderColor: '#1f1e1b',
                    color: '#1f1e1b',
                    backgroundColor: isDrawingMode ? 'rgba(31, 30, 27, 0.04)' : 'transparent'
                  }}
                  title={isDrawingMode ? "Exit drawing mode" : "Start drawing"}
                >
                  {isDrawingMode ? (
                    <Hand className="h-4 w-4" />
                  ) : (
                    <Pencil className="h-4 w-4" />
                  )}
                </Button>

                {/* Clear Button */}
                {isDrawingMode && (
                  <Button
                    onClick={() => {
                      clearCanvas(videoCanvasRef);
                      clearCanvas(modelCanvasRef);
                    }}
                    isIconOnly
                    variant="bordered"
                    size="sm"
                    className="rounded-sm"
                    style={{
                      borderColor: '#1f1e1b',
                      color: '#1f1e1b'
                    }}
                    title="Clear all drawings"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Video and 3D Model Side by Side */}
              <div className="flex gap-4">
                {/* Video Section */}
                <div className="flex-[2] space-y-4">
                  <div className={`relative overflow-hidden ss-surface ${sendVideoFrame ? 'border-2 border-[color:var(--ss-text-primary)]' : ''}`}>
                    {/* Video Checkbox */}
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-sm bg-white/90 px-3 py-2 backdrop-blur border border-[color:var(--ss-border)]">
                      <input
                        type="checkbox"
                        id="send-video"
                        checked={sendVideoFrame}
                        onChange={(e) => setSendVideoFrame(e.target.checked)}
                        className="h-3 w-3 cursor-pointer rounded-sm"
                      />
                      <label htmlFor="send-video" className="cursor-pointer text-xs text-[color:var(--ss-text-primary)] uppercase tracking-wide">
                        TO ASK
                      </label>
                    </div>
                    {videoUrl && (
                      <>
                        <video
                          ref={videoRef}
                          src={videoUrl}
                          className="w-full bg-black"
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onEnded={() => setIsPlaying(false)}
                          onTimeUpdate={handleTimeUpdate}
                          onLoadedMetadata={(e) => {
                            const video = e.currentTarget;
                            if (videoCanvasRef.current) {
                              videoCanvasRef.current.width = video.clientWidth;
                              videoCanvasRef.current.height = video.clientHeight;
                            }
                          }}
                        />
                        {/* Drawing canvas overlay for video */}
                        <canvas
                          ref={videoCanvasRef}
                          className={`absolute inset-0 h-full w-full ${isDrawingMode ? "cursor-crosshair" : "pointer-events-none"}`}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* 3D Model Section */}
                <div className="flex-1">
                  <div className="relative">
                    {/* Model Checkbox */}
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-sm bg-white/90 px-3 py-2 backdrop-blur border border-[color:var(--ss-border)]">
                      <input
                        type="checkbox"
                        id="send-model"
                        checked={sendModelFrame}
                        onChange={(e) => setSendModelFrame(e.target.checked)}
                        className="h-3 w-3 cursor-pointer rounded-sm"
                      />
                      <label htmlFor="send-model" className="cursor-pointer text-xs text-[color:var(--ss-text-primary)] uppercase tracking-wide">
                        TO ASK
                      </label>
                    </div>
                    <div ref={modelContainerRef} className="relative" style={{aspectRatio: "4/3"}}>
                      {models[selectedModelIndex].glbUrl ? (
                        <>
                          <div className={isDrawingMode ? "pointer-events-none" : ""}>
                            <ModelPreview src={models[selectedModelIndex].glbUrl} poster={null} />
                          </div>
                          {/* Drawing canvas overlay for 3D model */}
                          <canvas
                            ref={modelCanvasRef}
                            className={`absolute inset-0 h-full w-full ${isDrawingMode ? "cursor-crosshair" : "pointer-events-none"}`}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                          />
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/20 text-xs text-slate-400">
                          {models[selectedModelIndex].status === "generating" ? (
                            <div className="flex flex-col items-center gap-2">
                              <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"></div>
                              <span>Generating...</span>
                            </div>
                          ) : models[selectedModelIndex].status === "failed" ? (
                            `Failed: ${models[selectedModelIndex].error || "Unknown error"}`
                          ) : (
                            "Waiting..."
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat Section */}
              <div className="space-y-3">
                {/* Uploaded Images Preview */}
                {uploadedImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {uploadedImages.map((img, index) => (
                      <div key={index} className="relative ss-surface p-1">
                        <img
                          src={img}
                          alt={`Uploaded ${index + 1}`}
                          className="h-20 w-20 rounded-sm object-cover"
                        />
                        <Button
                          isIconOnly
                          size="sm"
                          onClick={() => setUploadedImages((prev) => prev.filter((_, i) => i !== index))}
                          className="absolute -right-2 -top-2 h-5 w-5 min-w-0 bg-rose-500 text-white hover:bg-rose-600 rounded-full p-0"
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Chat Input */}
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChat();
                      }
                    }}
                    placeholder="Ask questions about the video frame or 3D model..."
                    disabled={isSendingChat}
                    className="flex-1 px-4 py-3 text-base bg-white rounded-sm border transition-colors"
                    style={{
                      borderColor: 'rgba(31, 30, 27, 0.18)',
                      color: '#1f1e1b',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'rgba(31, 30, 27, 0.32)'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(31, 30, 27, 0.18)'}
                  />
                  {/* Image Upload Button */}
                  <input
                    ref={imageUploadRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => imageUploadRef.current?.click()}
                    className="h-10 w-10 flex items-center justify-center rounded-sm border transition-colors"
                    style={{
                      borderColor: 'rgba(31, 30, 27, 0.18)',
                      color: '#1f1e1b'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(31, 30, 27, 0.04)';
                      e.currentTarget.style.borderColor = 'rgba(31, 30, 27, 0.32)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = 'rgba(31, 30, 27, 0.18)';
                    }}
                    title="Upload images"
                  >
                    <ImageIcon className="h-5 w-5" />
                  </button>
                  {/* Image Generation Toggle */}
                  <button
                    onClick={() => setEnableImageGen(!enableImageGen)}
                    className="h-10 w-10 flex items-center justify-center rounded-sm border transition-colors"
                    style={{
                      borderColor: enableImageGen ? 'rgba(31, 30, 27, 0.32)' : 'rgba(31, 30, 27, 0.18)',
                      color: '#1f1e1b',
                      backgroundColor: enableImageGen ? 'rgba(31, 30, 27, 0.06)' : 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      if (!enableImageGen) {
                        e.currentTarget.style.backgroundColor = 'rgba(31, 30, 27, 0.04)';
                        e.currentTarget.style.borderColor = 'rgba(31, 30, 27, 0.32)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!enableImageGen) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderColor = 'rgba(31, 30, 27, 0.18)';
                      }
                    }}
                    title={enableImageGen ? "Image generation enabled" : "Enable image generation"}
                  >
                    <Sparkles className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleSendChat}
                    disabled={isSendingChat || !chatInput.trim()}
                    className="h-10 w-10 flex items-center justify-center rounded-sm border transition-colors"
                    style={{
                      borderColor: 'rgba(31, 30, 27, 0.18)',
                      color: '#1f1e1b',
                      opacity: (isSendingChat || !chatInput.trim()) ? 0.3 : 1,
                      cursor: (isSendingChat || !chatInput.trim()) ? 'not-allowed' : 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSendingChat && chatInput.trim()) {
                        e.currentTarget.style.backgroundColor = 'rgba(31, 30, 27, 0.04)';
                        e.currentTarget.style.borderColor = 'rgba(31, 30, 27, 0.32)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      if (!isSendingChat && chatInput.trim()) {
                        e.currentTarget.style.borderColor = 'rgba(31, 30, 27, 0.18)';
                      }
                    }}
                    title="Send message"
                  >
                    {isSendingChat ? (
                      <div
                        className="h-5 w-5 rounded-full border-2 animate-spin"
                        style={{
                          borderColor: 'rgba(31, 30, 27, 0.2)',
                          borderTopColor: '#1f1e1b'
                        }}
                      />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </button>
                </div>

                {/* AI Response Display */}
                {chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === "assistant" && (
                  <div className="ss-surface p-4 space-y-3">
                    <div className="text-sm text-secondary whitespace-pre-wrap leading-relaxed">
                      {chatMessages[chatMessages.length - 1].content}
                    </div>
                    {chatMessages[chatMessages.length - 1].generatedImage && (
                      <div className="mt-3 ss-surface p-2">
                        <img
                          src={chatMessages[chatMessages.length - 1].generatedImage}
                          alt="Generated by gpt-image-1"
                          className="rounded-sm max-w-full"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
