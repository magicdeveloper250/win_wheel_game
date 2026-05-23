// src/utils/generateBetSlip.ts
// Dependencies: pdfkit, qrcode
// npm install pdfkit qrcode
// npm install -D @types/pdfkit @types/qrcode

import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";

export interface BetLine {
  type: "Number" | "Letter";
  selection: string;   // "0", "A", "15"
  stake: number;       // per-pick stake in RWF
  odds: number;        // multiplier e.g. 36
}

export interface SlipData {
  ticketRef: string;
  sessionNumber: number;
  date: string;         // "13/05/26"
  time: string;         // "14:32:05"
  holderName: string;
  holderPhone?: string;
  bets: BetLine[];
  taxPct: number;       // 0.15 = 15%
  company?: string;
  location?: string;
  /** URL to encode in the QR code (e.g. ticket verification URL) */
  qrUrl?: string;
}

const W = 226.77;        // 80mm in points (1mm = 2.8346pt)
const MM = 2.8346;
const MARGIN = 14;       // ~5mm

function fmt(n: number) {
  return `RWF ${n.toLocaleString("en-RW", { minimumFractionDigits: 0 })}`;
}

/**
 * Generates a thermal-receipt-style PDF bet slip.
 *
 * @param data       Slip content
 * @param outputDir  Directory to write the file into (created if missing)
 * @returns          Absolute path to the generated PDF
 */
export async function generateBetSlip(
  data: SlipData,
  outputDir: string
): Promise<string> {
  fs.mkdirSync(outputDir, { recursive: true });

  const filename = `slip_${data.ticketRef}.pdf`;
  const outputPath = path.join(outputDir, filename);

  // ── totals ─────────────────────────────────────────────────────────────────
  const totalStake  = data.bets.reduce((s, b) => s + b.stake, 0);
  const totalPayout = data.bets.reduce((s, b) => s + b.stake * b.odds, 0);
  const taxAmount   = totalStake * data.taxPct;
  const netPaid     = totalStake + taxAmount;
  const potProfit   = totalPayout - netPaid;

  // ── QR code as PNG buffer ──────────────────────────────────────────────────
  const qrContent = data.qrUrl || `TICKET:${data.ticketRef}`;
  const qrBuffer  = await QRCode.toBuffer(qrContent, {
    type: "png",
    width: 120,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });

  // ── estimate page height (fixed sections + per-bet rows + QR) ──────────────
  const estimatedHeight = 340 + data.bets.length * 11 + 80;

  // ── PDF document (80mm wide, calculated height) ────────────────────────────
  const doc = new PDFDocument({
    size: [W, estimatedHeight],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: true,
    bufferPages: true,
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  let y = 10;

  const company  = data.company  ?? "WinWheel";
  const location = data.location ?? "Kigali";

  // ── helpers ────────────────────────────────────────────────────────────────
  const cx = (text: string, size: number, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica")
       .fontSize(size)
       .text(text, 0, y, { width: W, align: "center" });
    y += size + 2;
  };

  const lrRow = (left: string, right: string, size = 8, boldRight = false) => {
    doc.font("Helvetica").fontSize(size).text(left, MARGIN, y, { continued: false });
    doc.font(boldRight ? "Helvetica-Bold" : "Helvetica")
       .fontSize(size)
       .text(right, 0, y, { width: W - MARGIN, align: "right" });
    y += size + 3;
  };

  const dashes = () => {
    doc.save()
       .dash(2, { space: 3 })
       .moveTo(MARGIN, y).lineTo(W - MARGIN, y)
       .strokeColor("#aaaaaa").lineWidth(0.5).stroke()
       .restore();
    y += 5;
  };

  const rule = () => {
    doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y)
       .strokeColor("#333333").lineWidth(0.4).stroke();
    y += 4;
  };

  // ── HEADER ─────────────────────────────────────────────────────────────────
  y += 4;
  cx(company, 16, true);
  cx(location, 8);
  y += 2;

  // session + date + time on one line
  doc.font("Helvetica").fontSize(7.5);
  doc.text(`SESSION ${data.sessionNumber}`, MARGIN, y);
  doc.text(`${data.date}  ${data.time}`, 0, y, { width: W - MARGIN, align: "right" });
  y += 11;

  dashes();

  // ── TICKET HOLDER ──────────────────────────────────────────────────────────
  cx("TICKET HOLDER", 7, true);
  y += 1;
  doc.font("Helvetica-Bold").fontSize(8.5)
     .text(data.holderName, MARGIN, y);
  if (data.holderPhone) {
    doc.font("Helvetica").fontSize(7.5)
       .text(data.holderPhone, 0, y, { width: W - MARGIN, align: "right" });
  }
  y += 12;

  dashes();

  // ── SELECTIONS ─────────────────────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(7.5)
     .text("Selections", MARGIN, y);
  y += 10;

  // column positions
  const C = {
    idx:   MARGIN,
    type:  MARGIN + 12,
    pick:  MARGIN + 42,
    stake: MARGIN + 62,
    odds:  MARGIN + 92,
    pay:   W - MARGIN,
  };

  // header row
  doc.font("Helvetica-Bold").fontSize(7);
  doc.text("#",       C.idx,   y);
  doc.text("Type",    C.type,  y);
  doc.text("Pick",    C.pick,  y);
  doc.text("Stake",   C.stake, y);
  doc.text("Odds",    C.odds,  y);
  doc.text("Payout",  0,       y, { width: W - MARGIN, align: "right" });
  y += 9;

  rule();

  // bet rows
  data.bets.forEach((bet, i) => {
    const payout = bet.stake * bet.odds;
    doc.font("Helvetica").fontSize(7.5);
    doc.text(String(i + 1),               C.idx,   y);
    doc.text(bet.type,                    C.type,  y);
    doc.font("Helvetica-Bold").fontSize(7.5);
    doc.text(bet.selection,               C.pick,  y);
    doc.font("Helvetica").fontSize(7.5);
    doc.text(bet.stake.toLocaleString(),  C.stake, y);
    doc.text(`${bet.odds}x`,             C.odds,  y);
    doc.font("Helvetica-Bold").fontSize(7.5);
    doc.text(payout.toLocaleString(), 0, y, { width: W - MARGIN, align: "right" });
    y += 11;
  });

  y += 2;
  dashes();

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  cx("SUMMARY", 7, true);
  y += 2;

  lrRow("Stake",                          fmt(totalStake),  7.5);
  lrRow(`Tax (${data.taxPct * 100}%)`,    fmt(taxAmount),   7.5);
  y += 1;

  // total paid — larger
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("TOTAL PAID", MARGIN, y);
  doc.text(fmt(netPaid), 0, y, { width: W - MARGIN, align: "right" });
  y += 13;

  dashes();

  lrRow("Expected Return",  fmt(totalPayout), 8, true);
  y += 1;

  // potential profit — coloured
  const profitColor = potProfit >= 0 ? "#16a34a" : "#dc2626";
  const profitSign  = potProfit >= 0 ? "+" : "";
  doc.font("Helvetica-Bold").fontSize(9);
  doc.fillColor(profitColor)
     .text("Potential Profit", MARGIN, y);
  doc.text(`${profitSign}${fmt(potProfit)}`, 0, y, { width: W - MARGIN, align: "right" });
  doc.fillColor("black");
  y += 14;

  dashes();

  // ── QR CODE ────────────────────────────────────────────────────────────────
  const qrSize = 28 * MM;   // ~28mm
  const qrX    = (W - qrSize) / 2;
  doc.image(qrBuffer, qrX, y, { width: qrSize, height: qrSize });
  y += qrSize + 4;

  // ticket ref under QR
  doc.font("Helvetica").fontSize(6.5)
     .text(data.ticketRef, 0, y, { width: W, align: "center" });
  y += 10;

  dashes();

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const footer = "Thanks for playing!\nPlease check your ticket.";
  footer.split("\n").forEach((line) => {
    doc.font("Helvetica").fontSize(7.5)
       .text(line, 0, y, { width: W, align: "center" });
    y += 10;
  });

  y += 6;

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return outputPath;
}