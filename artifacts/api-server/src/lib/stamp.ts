/**
 * Timbro digitale — imprime numero protocollo e data su PDF e immagini.
 *
 * PDF  → pdf-lib: aggiunge un box timbro in basso a sinistra di ogni pagina
 * Img  → sharp:   composite SVG in basso a sinistra
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import sharp from "sharp";

const STAMP_BG   = { r: 0.10, g: 0.20, b: 0.40 }; // dark-navy fill
const STAMP_TEXT = { r: 1,    g: 1,    b: 1    }; // white text

export type StampableType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/tiff"
  | "image/gif";

export function isStampable(mimeType: string): mimeType is StampableType {
  return (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/jpeg") ||
    mimeType.startsWith("image/png") ||
    mimeType.startsWith("image/webp") ||
    mimeType.startsWith("image/tiff") ||
    mimeType.startsWith("image/gif")
  );
}

// ─── Stamp text ───────────────────────────────────────────────────────────────
function buildStampText(protocolNumber: string, registeredAt: Date): string {
  const d = registeredAt.toLocaleDateString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  return `PROTOCOLLO  ${protocolNumber}   |   Data reg. ${d}`;
}

// ─── PDF stamp ────────────────────────────────────────────────────────────────
export async function stampPdf(
  input: Buffer,
  protocolNumber: string,
  registeredAt: Date,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(input, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const text = buildStampText(protocolNumber, registeredAt);

  const fontSize   = 9;
  const padH       = 10;    // horizontal padding inside box
  const padV       = 6;     // vertical padding
  const boxH       = fontSize + padV * 2;
  const marginLeft = 14;
  const marginBot  = 14;

  for (const page of pdfDoc.getPages()) {
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const boxW = textWidth + padH * 2;

    // Background rectangle
    page.drawRectangle({
      x: marginLeft,
      y: marginBot,
      width: boxW,
      height: boxH,
      color: rgb(STAMP_BG.r, STAMP_BG.g, STAMP_BG.b),
      borderWidth: 0,
    });

    // Small accent bar on the left
    page.drawRectangle({
      x: marginLeft,
      y: marginBot,
      width: 4,
      height: boxH,
      color: rgb(0.95, 0.65, 0.10), // amber accent
    });

    // Text
    page.drawText(text, {
      x: marginLeft + padH,
      y: marginBot + padV,
      size: fontSize,
      font,
      color: rgb(STAMP_TEXT.r, STAMP_TEXT.g, STAMP_TEXT.b),
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

// ─── Image stamp ─────────────────────────────────────────────────────────────
export async function stampImage(
  input: Buffer,
  mimeType: string,
  protocolNumber: string,
  registeredAt: Date,
): Promise<Buffer> {
  const text = buildStampText(protocolNumber, registeredAt);
  const charWidth = 7.2;          // ~7.2px per char at 12px bold
  const fontSize  = 12;
  const padH      = 12;
  const padV      = 8;
  const boxW      = Math.round(text.length * charWidth + padH * 2 + 6); // +6 accent bar
  const boxH      = fontSize + padV * 2;
  const marginX   = 12;
  const marginY   = 12;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}">
  <!-- Background -->
  <rect x="0" y="0" width="${boxW}" height="${boxH}"
        fill="rgb(${Math.round(STAMP_BG.r*255)},${Math.round(STAMP_BG.g*255)},${Math.round(STAMP_BG.b*255)})"
        rx="2"/>
  <!-- Amber accent bar -->
  <rect x="0" y="0" width="4" height="${boxH}"
        fill="rgb(242,166,26)" rx="1"/>
  <!-- Text -->
  <text x="${padH + 2}" y="${padV + fontSize - 2}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="white"
        letter-spacing="0.3">${text}</text>
</svg>`.trim();

  const stampBuf = Buffer.from(svg);

  // Get image metadata so we know height for gravity placement
  const meta = await sharp(input).metadata();
  const imgH = meta.height ?? 0;

  // Determine output format
  const fmt = mimeType.includes("png") ? "png"
    : mimeType.includes("webp") ? "webp"
    : mimeType.includes("tiff") ? "tiff"
    : "jpeg";

  const pipeline = sharp(input).composite([
    {
      input: stampBuf,
      top: Math.max(0, imgH - boxH - marginY),
      left: marginX,
    },
  ]);

  if (fmt === "jpeg") return pipeline.jpeg({ quality: 92 }).toBuffer();
  if (fmt === "png")  return pipeline.png().toBuffer();
  if (fmt === "webp") return pipeline.webp({ quality: 92 }).toBuffer();
  if (fmt === "tiff") return pipeline.tiff().toBuffer();
  return pipeline.jpeg({ quality: 92 }).toBuffer();
}
