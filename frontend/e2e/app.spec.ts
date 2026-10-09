import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

let server: Server;
let mediaUrl: string;
const password = process.env.TEST_APP_PASSWORD || "yoink-browser-test-password";
test.beforeAll(async () => {
  // A real one-second audio file served locally; no external extractor availability required.
  const pcm = Buffer.alloc(16000);
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF");
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  server = createServer((_req, res) => {
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Length", wav.length);
    res.end(wav);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  mediaUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/a-moment-of-quiet.wav`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("password protection, previews, advanced controls, real audio download, and library playback", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your private media space." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/login-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Unlock Yoink" }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect password");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Unlock Yoink" }).click();
  await expect(
    page.getByRole("heading", { name: "Save something good." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/downloads-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Media URLs, one per line").fill(mediaUrl);
  await page.getByRole("button", { name: "Preview link" }).click();
  await expect(page.getByText("READY WHEN YOU ARE")).toBeVisible();
  await expect(page.getByLabel("Choose an available format")).toBeVisible();
  await page
    .getByLabel("Choose an available format")
    .selectOption({ index: 1 });
  await expect(page.locator(".custom-format-note")).toBeVisible();
  await page.getByLabel("Choose an available format").selectOption("");
  await expect(page.locator(".custom-format-note")).not.toBeVisible();
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await page.getByLabel("Audio format", { exact: true }).selectOption("mp3");
  await page.getByRole("button", { name: "Advanced options" }).click();
  await page.getByText("Network & authentication", { exact: true }).click();
  await page
    .getByLabel("Referer", { exact: true })
    .fill("https://example.com/watch");
  await page.getByText("Storage & performance", { exact: true }).click();
  await page
    .getByLabel("Subfolder", { exact: true })
    .fill(`Browser test/${Date.now()}`);
  await page.getByText("Custom yt-dlp arguments", { exact: true }).click();
  await page
    .getByLabel("Additional options", { exact: true })
    .fill("--write-description");
  await page.screenshot({
    path: "test-results/advanced-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Apply options" }).click();
  await page.getByRole("button", { name: "Save preset", exact: true }).click();
  await page.getByLabel("Preset name").fill("Quiet listening");
  await page
    .getByRole("button", { name: "Save preset", exact: true })
    .last()
    .click();
  const stored = await page.evaluate(() =>
    localStorage.getItem("yoink-presets"),
  );
  expect(stored).not.toContain("https://example.com/watch");
  expect(stored).not.toContain("--write-description");
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/jobs") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add to queue" }).click();
  const created: { ids: string[] } = await (await createdResponse).json();
  await expect(page.getByText("Download added to your queue.")).toBeVisible();
  await expect
    .poll(
      async () => {
        const response = await page.request.get("/api/jobs");
        const jobs: { id: string; status: string }[] = await response.json();
        return jobs.find((job) => job.id === created.ids[0])?.status;
      },
      { timeout: 30_000 },
    )
    .toBe("completed");
  await expect(page.locator(".status-pill.completed").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.screenshot({
    path: "test-results/completed-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(
    page.locator(".library-card").filter({ hasText: ".mp3" }).first(),
  ).toBeVisible();
  await page
    .locator(".library-card")
    .filter({ hasText: ".mp3" })
    .first()
    .locator(".library-art")
    .click();
  await expect(page.locator("audio")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download file", exact: true }),
  ).toHaveAttribute("href", /download=true/);
  await page.getByRole("button", { name: "Close dialog" }).click();
  const savedJob = (await (await page.request.get("/api/jobs")).json()).find(
    (job: { id: string }) => job.id === created.ids[0],
  );
  const originalPath: string = savedJob.files.find((path: string) =>
    path.endsWith(".mp3"),
  );
  const originalName = originalPath.split("/").pop()!;
  const testFolder = originalPath.slice(0, originalPath.lastIndexOf("/"));
  await page.getByLabel("Search files").fill(testFolder);
  await page
    .getByLabel("Filter media type", { exact: true })
    .selectOption("audio");
  await expect(page.locator(".library-card")).toHaveCount(1);
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator(".library-list")).toBeVisible();
  await page
    .getByRole("button", { name: `Rename ${originalName}`, exact: true })
    .click();
  await page
    .getByLabel("Filename", { exact: true })
    .fill("Quiet afternoon.mp3");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Quiet afternoon.mp3", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await page.screenshot({
    path: "test-results/library-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("checkbox", { name: "Select Quiet afternoon.mp3", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await expect(page.locator(".library-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.locator(".trash-row")).toContainText("Quiet afternoon.mp3");
  await page
    .getByRole("button", {
      name: `Restore ${testFolder}/Quiet afternoon.mp3`,
      exact: true,
    })
    .click();
  await expect(page.locator(".trash-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await expect(page.locator(".library-card")).toHaveCount(1);
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.getByLabel("Search history").fill(mediaUrl);
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.locator(".queue-item")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/history-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("checkbox", { name: "Select visible history", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Remove history", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove history", exact: true })
    .click();
  await expect(page.locator(".queue-item")).toHaveCount(0);
  expect(
    (
      await page.request.get(
        `/api/files/${encodeURIComponent(testFolder).replaceAll("%2F", "/")}/Quiet%20afternoon.mp3`,
      )
    ).status(),
  ).toBe(200);
  await page.getByRole("link", { name: "Option reference" }).click();
  await page.getByLabel("Search yt-dlp options").fill("referer");
  await expect(page.getByText("--referer", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add --referer" }).click();
  await expect(page.getByLabel("Additional options")).toHaveValue(
    /--referer ""/,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("link", { name: "Server settings" }).click();
  await expect(page.getByText("FFmpeg ready", { exact: false })).toBeVisible();
  await page.screenshot({
    path: "test-results/settings-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Your private media space." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("permanent deletion requires explicit confirmation and only removes the selected trash item", async ({
  page,
}) => {
  await page.request.post("/api/login", { data: { password } });
  const folder = `Trash test/${Date.now()}`;
  const response = await page.request.post("/api/jobs", {
    data: {
      urls: [mediaUrl],
      options: {
        folder,
        filename: "disposable.%(ext)s",
        embed_metadata: false,
      },
    },
  });
  expect(response.status()).toBe(201);
  const { ids } = await response.json();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/jobs")).json()).find(
          (job: { id: string }) => job.id === ids[0],
        )?.status,
      { timeout: 30_000 },
    )
    .toBe("completed");
  await page.goto("/#library");
  await page.getByLabel("Search files").fill(folder);
  await expect(page.locator(".library-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Move disposable.wav to trash", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await expect(page.locator(".library-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page
    .getByRole("button", {
      name: `Permanently delete ${folder}/disposable.wav`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Delete forever", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Keep files", exact: true }).click();
  await expect(page.locator(".trash-row")).toHaveCount(1);
  await page
    .getByRole("button", {
      name: `Permanently delete ${folder}/disposable.wav`,
      exact: true,
    })
    .click();
  await page
    .getByLabel("Type DELETE to confirm", { exact: true })
    .fill("DELETE");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete forever", exact: true })
    .click();
  await expect(page.locator(".trash-row")).toHaveCount(0);
  const files = await (await page.request.get("/api/library")).json();
  expect(
    files.some(
      (file: { path: string }) => file.path === `${folder}/disposable.wav`,
    ),
  ).toBe(false);
  await page.request.delete(`/api/jobs/${ids[0]}`, { data: {} });
});

test("phone layout stays within viewport and supports options", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({
    path: "test-results/login-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Unlock Yoink" }).click();
  await expect(
    page.getByRole("heading", { name: "Save something good." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/downloads-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Advanced options" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByText("Network & authentication", { exact: true }).click();
  await page
    .getByLabel("Referer", { exact: true })
    .fill("https://example.com/mobile");
  await page.screenshot({
    path: "test-results/advanced-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Apply options" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(nav).toBeVisible();
  expect(await nav.evaluate((el) => getComputedStyle(el).position)).toBe(
    "fixed",
  );
  for (const view of ["Library", "History", "Settings"]) {
    await nav.getByRole("link", { name: view, exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: `${view === "Settings" ? "Server settings" : view}.`,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/${view.toLowerCase()}-mobile.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: /Explore every yt-dlp option/ })
    .click();
  await expect(page.getByLabel("Search yt-dlp options")).toBeVisible();
  await nav.getByRole("link", { name: "Downloads", exact: true }).click();
  await expect(page.getByLabel("Referer", { exact: true })).not.toBeVisible();
  for (const width of [320, 520, 720, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `Downloads overflow at ${width}px`,
    ).toBe(true);
    await page.goto("/#library");
    await expect(
      page.getByRole("heading", { name: "Library.", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `Library overflow at ${width}px`,
    ).toBe(true);
    await page.goto("/#downloads");
  }
});
