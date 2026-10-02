import { afterEach, describe, expect, it } from "vitest";
import { mediaUrl } from "./question-media.ts";

// docs/specs/04-media-storage.md: images are served by the app locally, and from the public R2
// bucket once MEDIA_PUBLIC_BASE_URL is set.
describe("mediaUrl", () => {
  const key = `ab/${"a".repeat(64)}.png`;
  const saved = process.env.MEDIA_PUBLIC_BASE_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.MEDIA_PUBLIC_BASE_URL;
    else process.env.MEDIA_PUBLIC_BASE_URL = saved;
  });

  it("serves from the app when no public base URL is set", () => {
    delete process.env.MEDIA_PUBLIC_BASE_URL;
    expect(mediaUrl(key)).toBe(`/api/media/${key}`);
    process.env.MEDIA_PUBLIC_BASE_URL = "  ";
    expect(mediaUrl(key)).toBe(`/api/media/${key}`);
  });

  it("serves from the media domain when it is, with or without a trailing slash", () => {
    process.env.MEDIA_PUBLIC_BASE_URL = "https://media.example.test/";
    expect(mediaUrl(key)).toBe(`https://media.example.test/${key}`);
  });
});
