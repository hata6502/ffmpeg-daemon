import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import chokidar from "chokidar";
import { rename, writeFile } from "fs/promises";
import { basename, dirname, extname, resolve } from "path";
import PQueue from "p-queue";

const watchPaths = process.argv.slice(2);

const ffmpeg = createFFmpeg({ log: true });
await ffmpeg.load();
const handleFile = async (path: string) => {
  try {
    switch (extname(path)) {
      case ".webm": {
        const sourceFilename = `convert${extname(path)}`;
        const mp4Filename = "convert.mp4";
        const destinationPath = resolve(
          dirname(path),
          `${basename(path, extname(path))}.mp4`
        );

        ffmpeg.FS("writeFile", sourceFilename, await fetchFile(path));
        // TODO: Error handling!
        await ffmpeg.run(
          "-i",
          sourceFilename,
          "-r",
          "30",
          "-vf",
          "scale=trunc(iw/2)*2:trunc(ih/2)*2",
          mp4Filename
        );
        await writeFile(destinationPath, ffmpeg.FS("readFile", mp4Filename));
        await rename(path, `${path}.converted`);
        return;
      }
    }
  } catch (exception) {
    console.error(exception);
  }
};

const debounceCounts = new Map<string, number>();
const queue = new PQueue({ concurrency: 1 });
const handleEvent = async (path: string) => {
  const debounceCount = debounceCounts.get(path) ?? 0;
  debounceCounts.set(path, debounceCount + 1);
  if (debounceCount) {
    return;
  }

  await queue.add(async () => {
    let prevDebounceCount;
    do {
      prevDebounceCount = debounceCounts.get(path);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } while (debounceCounts.get(path) !== prevDebounceCount);
    debounceCounts.delete(path);

    await Promise.allSettled([
      handleFile(path),
      new Promise((resolve) => setTimeout(resolve, 10000)),
    ]);
  });
};

for (const watchPath of watchPaths) {
  chokidar
    .watch(watchPath, { ignoreInitial: true })
    .on("add", (path) => handleEvent(path))
    .on("change", (path) => handleEvent(path))
    .on("ready", () => {
      console.log(`Watching ${resolve(watchPath)}...`);
    });
}
