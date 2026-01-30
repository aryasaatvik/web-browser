/**
 * Offscreen document for Browser MCP media capture.
 * Handles video recording and GIF generation.
 */

// Recording state
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordingStream: MediaStream | null = null;

// GIF state
let gifFrames: ImageData[] = [];
let gifCanvas: HTMLCanvasElement | null = null;
let gifCtx: CanvasRenderingContext2D | null = null;

/**
 * Start recording a tab.
 */
async function startRecording(streamId: string): Promise<void> {
  if (mediaRecorder) {
    throw new Error("Recording already in progress");
  }

  // Get the stream from the tab capture
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      // @ts-expect-error - Chrome-specific constraint
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
  });

  recordingStream = stream;
  recordedChunks = [];

  mediaRecorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp9",
    videoBitsPerSecond: 2500000, // 2.5 Mbps
  });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.start(100); // Collect data every 100ms
}

/**
 * Stop recording and return the video data.
 */
async function stopRecording(): Promise<string> {
  if (!mediaRecorder) {
    throw new Error("No recording in progress");
  }

  return new Promise((resolve, reject) => {
    mediaRecorder!.onstop = async () => {
      try {
        const blob = new Blob(recordedChunks, { type: "video/webm" });
        const base64 = await blobToBase64(blob);

        // Cleanup
        recordingStream?.getTracks().forEach((track) => track.stop());
        mediaRecorder = null;
        recordingStream = null;
        recordedChunks = [];

        resolve(base64);
      } catch (err) {
        reject(err);
      }
    };

    mediaRecorder!.stop();
  });
}

/**
 * Start capturing frames for GIF.
 */
function startGifCapture(width: number, height: number): void {
  gifFrames = [];

  gifCanvas = document.getElementById("canvas") as HTMLCanvasElement;
  gifCanvas.width = width;
  gifCanvas.height = height;
  gifCtx = gifCanvas.getContext("2d");
}

/**
 * Add a frame to the GIF capture.
 */
async function addGifFrame(imageDataUrl: string): Promise<void> {
  if (!gifCanvas || !gifCtx) {
    throw new Error("GIF capture not started");
  }

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = imageDataUrl;
  });

  gifCtx.drawImage(img, 0, 0, gifCanvas.width, gifCanvas.height);
  const imageData = gifCtx.getImageData(0, 0, gifCanvas.width, gifCanvas.height);
  gifFrames.push(imageData);
}

/**
 * Generate GIF from captured frames.
 * Uses a simple GIF encoder implementation.
 */
async function generateGif(delay: number = 100): Promise<string> {
  if (gifFrames.length === 0) {
    throw new Error("No frames captured");
  }

  const width = gifFrames[0].width;
  const height = gifFrames[0].height;

  // Simple GIF encoder
  const gif = new GifEncoder(width, height);
  gif.setDelay(delay);
  gif.setRepeat(0); // Loop forever

  for (const frame of gifFrames) {
    gif.addFrame(frame.data);
  }

  gif.finish();

  const blob = new Blob([gif.getOutput() as BlobPart], { type: "image/gif" });
  const base64 = await blobToBase64(blob);

  // Cleanup
  gifFrames = [];
  gifCanvas = null;
  gifCtx = null;

  return base64;
}

/**
 * Convert a blob to base64.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data URL prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Simple GIF encoder.
 * Based on NeuQuant algorithm for color quantization.
 */
class GifEncoder {
  private width: number;
  private height: number;
  private delay: number = 100;
  private repeat: number = -1;
  private output: number[] = [];
  private frameCount: number = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  setDelay(delay: number): void {
    this.delay = delay;
  }

  setRepeat(repeat: number): void {
    this.repeat = repeat;
  }

  addFrame(pixels: Uint8ClampedArray): void {
    if (this.frameCount === 0) {
      this.writeHeader();
      this.writeLSD();
      this.writeNetscapeExt();
    }

    // Quantize colors and write frame
    const { colorTable, indexedPixels } = this.quantizeColors(pixels);
    this.writeGraphicControlExt();
    this.writeImageDesc();
    this.writeColorTable(colorTable);
    this.writeLZW(indexedPixels);

    this.frameCount++;
  }

  finish(): void {
    this.output.push(0x3b); // GIF trailer
  }

  getOutput(): Uint8Array {
    return new Uint8Array(this.output);
  }

  private writeHeader(): void {
    // GIF89a
    this.writeString("GIF89a");
  }

  private writeLSD(): void {
    // Logical Screen Descriptor
    this.writeShort(this.width);
    this.writeShort(this.height);
    this.output.push(
      0xf7, // Global Color Table Flag, Color Resolution, Sort Flag, Size of GCT
      0, // Background Color Index
      0 // Pixel Aspect Ratio
    );
  }

  private writeNetscapeExt(): void {
    if (this.repeat >= 0) {
      this.output.push(
        0x21, // Extension Introducer
        0xff, // Application Extension Label
        0x0b // Block Size
      );
      this.writeString("NETSCAPE2.0");
      this.output.push(
        0x03, // Sub-block Size
        0x01, // Sub-block ID
        this.repeat & 0xff,
        (this.repeat >> 8) & 0xff,
        0x00 // Block Terminator
      );
    }
  }

  private writeGraphicControlExt(): void {
    this.output.push(
      0x21, // Extension Introducer
      0xf9, // Graphic Control Label
      0x04, // Block Size
      0x00, // Disposal Method, User Input Flag, Transparency Flag
      this.delay & 0xff,
      (this.delay >> 8) & 0xff,
      0x00, // Transparent Color Index
      0x00 // Block Terminator
    );
  }

  private writeImageDesc(): void {
    this.output.push(
      0x2c, // Image Separator
      0x00,
      0x00, // Image Left Position
      0x00,
      0x00, // Image Top Position
      this.width & 0xff,
      (this.width >> 8) & 0xff,
      this.height & 0xff,
      (this.height >> 8) & 0xff,
      0x87 // Local Color Table Flag, Interlace Flag, Sort Flag, Size of LCT
    );
  }

  private writeColorTable(colorTable: number[][]): void {
    for (let i = 0; i < 256; i++) {
      if (i < colorTable.length) {
        this.output.push(colorTable[i][0], colorTable[i][1], colorTable[i][2]);
      } else {
        this.output.push(0, 0, 0);
      }
    }
  }

  private quantizeColors(pixels: Uint8ClampedArray): {
    colorTable: number[][];
    indexedPixels: number[];
  } {
    // Simple median cut color quantization to 256 colors
    const colors: Map<string, number> = new Map();
    const indexedPixels: number[] = [];

    // First pass: collect unique colors
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] >> 3 << 3; // Reduce to 5-bit per channel
      const g = pixels[i + 1] >> 3 << 3;
      const b = pixels[i + 2] >> 3 << 3;
      const key = `${r},${g},${b}`;
      colors.set(key, (colors.get(key) || 0) + 1);
    }

    // Sort colors by frequency and take top 256
    const sortedColors = Array.from(colors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 256)
      .map(([key]) => key.split(",").map(Number));

    // Build color lookup
    const colorLookup = new Map<string, number>();
    sortedColors.forEach((color, index) => {
      colorLookup.set(color.join(","), index);
    });

    // Second pass: map pixels to palette indices
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] >> 3 << 3;
      const g = pixels[i + 1] >> 3 << 3;
      const b = pixels[i + 2] >> 3 << 3;
      const key = `${r},${g},${b}`;

      let index = colorLookup.get(key);
      if (index === undefined) {
        // Find nearest color
        index = this.findNearestColor(sortedColors, [r, g, b]);
      }
      indexedPixels.push(index);
    }

    return { colorTable: sortedColors, indexedPixels };
  }

  private findNearestColor(palette: number[][], color: number[]): number {
    let minDist = Infinity;
    let minIndex = 0;

    for (let i = 0; i < palette.length; i++) {
      const dist =
        Math.pow(palette[i][0] - color[0], 2) +
        Math.pow(palette[i][1] - color[1], 2) +
        Math.pow(palette[i][2] - color[2], 2);
      if (dist < minDist) {
        minDist = dist;
        minIndex = i;
      }
    }

    return minIndex;
  }

  private writeLZW(pixels: number[]): void {
    const minCodeSize = 8;
    this.output.push(minCodeSize);

    // Simple LZW encoding
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let nextCode = eoiCode + 1;
    let codeSize = minCodeSize + 1;

    const dictionary: Map<string, number> = new Map();
    for (let i = 0; i < clearCode; i++) {
      dictionary.set(String(i), i);
    }

    const codes: number[] = [clearCode];
    let current = String(pixels[0]);

    for (let i = 1; i < pixels.length; i++) {
      const next = current + "," + pixels[i];
      if (dictionary.has(next)) {
        current = next;
      } else {
        codes.push(dictionary.get(current)!);
        if (nextCode < 4096) {
          dictionary.set(next, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
        } else {
          codes.push(clearCode);
          dictionary.clear();
          for (let j = 0; j < clearCode; j++) {
            dictionary.set(String(j), j);
          }
          nextCode = eoiCode + 1;
          codeSize = minCodeSize + 1;
        }
        current = String(pixels[i]);
      }
    }
    codes.push(dictionary.get(current)!);
    codes.push(eoiCode);

    // Pack codes into bytes
    this.packCodes(codes, minCodeSize);
    this.output.push(0x00); // Block terminator
  }

  private packCodes(codes: number[], minCodeSize: number): void {
    let codeSize = minCodeSize + 1;
    let clearCode = 1 << minCodeSize;
    let buffer = 0;
    let bufferLength = 0;
    let block: number[] = [];

    for (const code of codes) {
      buffer |= code << bufferLength;
      bufferLength += codeSize;

      while (bufferLength >= 8) {
        block.push(buffer & 0xff);
        buffer >>= 8;
        bufferLength -= 8;

        if (block.length === 255) {
          this.output.push(block.length);
          this.output.push(...block);
          block = [];
        }
      }

      if (code === clearCode) {
        codeSize = minCodeSize + 1;
      } else if ((1 << codeSize) <= codes.indexOf(code) + 2 && codeSize < 12) {
        codeSize++;
      }
    }

    if (bufferLength > 0) {
      block.push(buffer & 0xff);
    }

    if (block.length > 0) {
      this.output.push(block.length);
      this.output.push(...block);
    }
  }

  private writeString(str: string): void {
    for (let i = 0; i < str.length; i++) {
      this.output.push(str.charCodeAt(i));
    }
  }

  private writeShort(val: number): void {
    this.output.push(val & 0xff, (val >> 8) & 0xff);
  }
}

// Message handler
browser.runtime.onMessage.addListener((message: Record<string, unknown>, _sender: unknown, sendResponse: (response: unknown) => void) => {
  const { action, ...params } = message;

  (async () => {
    try {
      switch (action) {
        case "recording:start": {
          await startRecording(params.streamId as string);
          sendResponse({ success: true });
          break;
        }
        case "recording:stop": {
          const data = await stopRecording();
          sendResponse({ success: true, data });
          break;
        }
        case "gif:start": {
          startGifCapture(params.width as number, params.height as number);
          sendResponse({ success: true });
          break;
        }
        case "gif:addFrame": {
          await addGifFrame(params.imageData as string);
          sendResponse({ success: true });
          break;
        }
        case "gif:generate": {
          const data = await generateGif(params.delay as number | undefined);
          sendResponse({ success: true, data });
          break;
        }
        default:
          sendResponse({ success: false, error: `Unknown action: ${action}` });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      sendResponse({ success: false, error });
    }
  })();

  return true; // Keep channel open for async response
});
