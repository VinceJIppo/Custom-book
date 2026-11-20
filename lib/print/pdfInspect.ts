/**
 * Reads a finished PDF back and reports what printers care about: page count
 * and sizes, fonts that are not embedded, transparency, encryption and images.
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from "pdf-lib";

export interface PdfInspection {
  pageCount: number;
  /** Page sizes in inches, rounded to 0.001. */
  pageSizesIn: Array<{ width: number; height: number }>;
  encrypted: boolean;
  fonts: Array<{ name: string; embedded: boolean; subtype: string }>;
  /** Places where transparency is used (soft masks or alpha below 1). */
  transparency: string[];
  imageCount: number;
}

const name = (d: PDFDict, key: string) => {
  const v = d.get(PDFName.of(key));
  return v instanceof PDFName ? v.decodeText() : undefined;
};

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  let doc: PDFDocument;
  let encrypted = false;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (/encrypt/i.test(String(err))) {
      encrypted = true;
      doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
    } else throw err;
  }
  encrypted = encrypted || doc.isEncrypted;

  const pageSizesIn = doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return { width: Math.round((width / 72) * 1000) / 1000, height: Math.round((height / 72) * 1000) / 1000 };
  });

  const fonts: PdfInspection["fonts"] = [];
  const transparency = new Set<string>();
  let imageCount = 0;
  const ctx = doc.context;
  const lookup = (v: unknown) => (v instanceof PDFRef ? ctx.lookup(v) : v);

  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFDict ? obj : obj instanceof PDFRawStream ? obj.dict : null;
    if (!dict) continue;
    const type = name(dict, "Type");
    const subtype = name(dict, "Subtype");

    if (type === "Font" && subtype && subtype !== "Type0") {
      const fontName = name(dict, "BaseFont") ?? "(unnamed)";
      if (subtype === "Type3") {
        fonts.push({ name: fontName, embedded: true, subtype });
      } else {
        const desc = lookup(dict.get(PDFName.of("FontDescriptor")));
        const embedded = desc instanceof PDFDict && ["FontFile", "FontFile2", "FontFile3"].some((k) => desc.has(PDFName.of(k)));
        fonts.push({ name: fontName, embedded, subtype });
      }
    }

    if (subtype === "Image") {
      imageCount++;
      const smask = dict.get(PDFName.of("SMask"));
      if (smask && !(smask instanceof PDFName && smask.decodeText() === "None")) transparency.add("an image with a transparent (alpha) mask");
    }

    if (type === "ExtGState") {
      for (const k of ["CA", "ca"]) {
        const v = lookup(dict.get(PDFName.of(k)));
        if (v instanceof PDFNumber && v.asNumber() < 1) transparency.add("semi-transparent drawing (opacity below 100%)");
      }
      const sm = lookup(dict.get(PDFName.of("SMask")));
      if (sm && !(sm instanceof PDFName && sm.decodeText() === "None")) transparency.add("a soft mask");
    }

    if (type === "Group" || name(dict, "S") === "Transparency") {
      // Transparency groups alone are harmless containers; only report when blending is real.
      const bm = dict.get(PDFName.of("BM"));
      if (bm instanceof PDFName && bm.decodeText() !== "Normal") transparency.add(`a ${bm.decodeText()} blend mode`);
      if (bm instanceof PDFArray) transparency.add("a non-normal blend mode");
    }
  }

  return { pageCount: doc.getPageCount(), pageSizesIn, encrypted, fonts, transparency: [...transparency], imageCount };
}
