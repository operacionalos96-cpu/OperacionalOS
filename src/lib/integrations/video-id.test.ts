import { describe, expect, it } from "vitest"
import { videoIdFromUrl } from "./video-id"

describe("videoIdFromUrl", () => {
  it("YouTube: watch, youtu.be, shorts, live, mobile", () => {
    expect(videoIdFromUrl("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ")
    expect(videoIdFromUrl("youtube", "https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ")
    expect(videoIdFromUrl("youtube", "https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(videoIdFromUrl("youtube", "https://www.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(videoIdFromUrl("youtube", "https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })
  it("YouTube: rejeita links sem vídeo ou de outro site", () => {
    expect(videoIdFromUrl("youtube", "https://www.youtube.com/@canal")).toBeNull()
    expect(videoIdFromUrl("youtube", "https://evil.com/watch?v=dQw4w9WgXcQ")).toBeNull()
    expect(videoIdFromUrl("youtube", "não é link")).toBeNull()
  })
  it("TikTok: link completo do vídeo", () => {
    expect(videoIdFromUrl("tiktok", "https://www.tiktok.com/@perfil/video/7234567890123456789?lang=pt")).toBe("7234567890123456789")
    expect(videoIdFromUrl("tiktok", "https://vm.tiktok.com/ZMabc/")).toBeNull()
    expect(videoIdFromUrl("tiktok", "https://tiktok.com.evil.com/@a/video/7234567890123456789")).toBeNull()
  })
})
