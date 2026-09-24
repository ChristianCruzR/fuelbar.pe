import {
  calculateQuote,
  finiteNumber,
  formatCurrency,
  formatDate,
  formatTime,
} from "./quote-core.js?v=4";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 49;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = 58;

export async function createQuotePdfBlob(state) {
  const PDFLib = globalThis.PDFLib;
  if (!PDFLib?.PDFDocument) throw new Error("El generador PDF no está disponible.");

  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let brandLogo = null;
  try {
    const logoResponse = await fetch(new URL("./assets/fuelbar-logo.png", import.meta.url));
    if (logoResponse.ok) brandLogo = await document.embedPng(await logoResponse.arrayBuffer());
  } catch {
    brandLogo = null;
  }
  const result = calculateQuote(state);
  const pages = [];

  const colors = {
    ink: rgb(40 / 255, 40 / 255, 40 / 255),
    description: rgb(69 / 255, 84 / 255, 89 / 255),
    muted: rgb(102 / 255, 119 / 255, 125 / 255),
    soft: rgb(239 / 255, 248 / 255, 248 / 255),
    aquaSoft: rgb(223 / 255, 243 / 255, 245 / 255),
    line: rgb(215 / 255, 225 / 255, 227 / 255),
    teal: rgb(63 / 255, 186 / 255, 201 / 255),
    green: rgb(24 / 255, 121 / 255, 78 / 255),
    white: rgb(1, 1, 1),
  };

  document.setTitle(`Cotización ${state.quote.number || ""} - ${state.customer.name || "Cliente"}`);
  document.setAuthor(state.company.displayName || "FuelBar");
  document.setCreator("Cotizador FuelBar");
  document.setProducer("FuelBar");
  document.setSubject(state.event.title || "Cotización de servicio");

  let page;
  let cursorY;

  function safeText(value, font = regular) {
    const normalized = String(value ?? "")
      .replaceAll("\u00a0", " ")
      .replaceAll("\u202f", " ")
      .replaceAll("−", "-")
      .replaceAll("–", "-")
      .replaceAll("—", "-")
      .replaceAll("“", '"')
      .replaceAll("”", '"')
      .replaceAll("‘", "'")
      .replaceAll("’", "'")
      .replaceAll("…", "...");
    let output = "";
    for (const character of normalized) {
      if (character === "\n" || character === "\r" || character === "\t") {
        output += character === "\t" ? " " : character;
        continue;
      }
      try {
        font.encodeText(character);
        output += character;
      } catch {
        output += "?";
      }
    }
    return output;
  }

  function textWidth(value, font, size) {
    return font.widthOfTextAtSize(safeText(value, font), size);
  }

  function splitLongWord(word, maxWidth, font, size) {
    const chunks = [];
    let chunk = "";
    for (const character of word) {
      const candidate = `${chunk}${character}`;
      if (chunk && textWidth(candidate, font, size) > maxWidth) {
        chunks.push(chunk);
        chunk = character;
      } else {
        chunk = candidate;
      }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  }

  function wrapParagraph(paragraph, maxWidth, font, size) {
    const clean = safeText(paragraph, font).trim();
    if (!clean) return [""];
    const words = clean.split(/\s+/).flatMap((word) => (
      textWidth(word, font, size) > maxWidth ? splitLongWord(word, maxWidth, font, size) : [word]
    ));
    const lines = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && textWidth(candidate, font, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function wrapText(value, maxWidth, font = regular, size = 9.4) {
    return safeText(value, font)
      .split(/\r?\n/)
      .flatMap((paragraph) => wrapParagraph(paragraph, maxWidth, font, size));
  }

  function drawTopText(value, x, top, options = {}) {
    const font = options.font || regular;
    const size = options.size || 9.4;
    const color = options.color || colors.ink;
    const text = safeText(value, font);
    let drawX = x;
    const width = textWidth(text, font, size);
    if (options.align === "right") drawX = x - width;
    if (options.align === "center") drawX = x - width / 2;
    page.drawText(text, { x: drawX, y: top - size, size, font, color });
  }

  function drawWrappedLines(lines, x, top, options = {}) {
    const lineHeight = options.lineHeight || (options.size || 9.4) * 1.35;
    lines.forEach((line, index) => drawTopText(line, x, top - index * lineHeight, options));
    return top - lines.length * lineHeight;
  }

  function drawLine(x1, y, x2, color = colors.line, thickness = 0.7) {
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
  }

  function addPage(firstPage = false) {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    cursorY = PAGE_HEIGHT - MARGIN;
    if (!firstPage) {
      if (brandLogo) {
        page.drawImage(brandLogo, { x: MARGIN, y: cursorY - 30, width: 30, height: 30 });
      }
      drawTopText(state.company.displayName || "Fuelbar.pe", MARGIN + (brandLogo ? 38 : 0), cursorY - 7, {
        font: bold,
        size: 10.5,
      });
      drawTopText(`Cotización ${state.quote.number || ""}`, PAGE_WIDTH - MARGIN, cursorY - 7, {
        font: bold,
        size: 9,
        align: "right",
        color: colors.muted,
      });
      drawLine(MARGIN, cursorY - 38, PAGE_WIDTH - MARGIN, colors.teal, 1.4);
      cursorY -= 51;
    }
  }

  function ensureSpace(requiredHeight) {
    if (cursorY - requiredHeight < BOTTOM_LIMIT) addPage(false);
  }

  function money(value) {
    return formatCurrency(value, state.quote.currency);
  }

  function drawFirstPageHeader() {
    drawTopText("COTIZACIÓN", MARGIN, cursorY, { font: bold, size: 21 });
    if (brandLogo) {
      page.drawImage(brandLogo, {
        x: PAGE_WIDTH - MARGIN - 60,
        y: cursorY - 60,
        width: 60,
        height: 60,
      });
    } else {
      drawTopText(state.company.displayName || "Fuelbar.pe", PAGE_WIDTH - MARGIN, cursorY + 1, {
        font: bold,
        size: 11.8,
        align: "right",
      });
    }
    drawLine(MARGIN, cursorY - 67, PAGE_WIDTH - MARGIN, colors.teal, 1.6);
    cursorY -= 81;

    drawTopText(state.company.displayName || "Fuelbar.pe", MARGIN, cursorY, { font: bold, size: 14 });
    cursorY -= 19;
    const companyLines = [
      state.company.legalName && state.company.legalName !== state.company.displayName ? state.company.legalName : "",
      state.company.taxId ? `RUC ${state.company.taxId}` : "",
      state.company.address,
      [state.company.city, state.company.country].filter(Boolean).join(" · "),
      state.company.phone,
      state.company.email,
    ].filter(Boolean);
    companyLines.forEach((line) => {
      drawTopText(line, MARGIN, cursorY, { size: 8.3, color: colors.muted });
      cursorY -= 11;
    });
    cursorY -= 13;
  }

  function drawClientCard() {
    const secondary = [
      state.customer.taxId ? `RUC / Documento: ${state.customer.taxId}` : "",
      state.customer.address,
      state.customer.phone,
      state.customer.email,
    ].filter(Boolean).join(" · ");
    const nameLines = wrapText(state.customer.name || "Cliente", 270, bold, 11.8);
    const secondaryLines = secondary ? wrapText(secondary, 270, regular, 8.2) : [];
    const cardHeight = Math.max(78, 31 + nameLines.length * 14 + secondaryLines.length * 11);
    page.drawRectangle({
      x: MARGIN,
      y: cursorY - cardHeight,
      width: CONTENT_WIDTH,
      height: cardHeight,
      borderColor: colors.line,
      borderWidth: 0.7,
      color: colors.white,
    });
    drawTopText("PARA", MARGIN + 10, cursorY - 10, { font: bold, size: 7.1, color: colors.muted });
    let leftY = cursorY - 26;
    leftY = drawWrappedLines(nameLines, MARGIN + 10, leftY, { font: bold, size: 11.8, lineHeight: 14 });
    if (secondaryLines.length) {
      drawWrappedLines(secondaryLines, MARGIN + 10, leftY - 3, { size: 8.2, lineHeight: 10.5, color: colors.muted });
    }

    const metaX = MARGIN + 325;
    const valueX = PAGE_WIDTH - MARGIN - 10;
    const meta = [
      ["COTIZACIÓN NÚMERO", state.quote.number],
      ["EMITIDO", formatDate(state.quote.issueDate)],
      ["N.° ORDEN", state.quote.orderNumber],
    ];
    meta.forEach(([label, value], index) => {
      const top = cursorY - 13 - index * 22;
      drawTopText(label, metaX, top, { font: bold, size: 7.1, color: colors.muted });
      drawTopText(value, valueX, top - 1, { size: 9.4, align: "right" });
    });
    cursorY -= cardHeight + 14;
  }

  function drawEventStrip() {
    const columns = [
      ["EVENTO", state.event.title || "Evento"],
      ["FECHA Y HORARIO", [
        formatDate(state.event.date),
        [formatTime(state.event.startTime), formatTime(state.event.endTime)].filter(Boolean).join(" - "),
      ].filter(Boolean).join(" · ") || "Por definir"],
      ["PAX Y LUGAR", `${finiteNumber(state.event.pax)} pax${state.event.location ? ` · ${state.event.location}` : ""}`],
    ];
    const columnWidth = CONTENT_WIDTH / 3;
    const valueLines = columns.map(([, value]) => wrapText(value, columnWidth - 16, regular, 8.5));
    const stripHeight = Math.max(44, 24 + Math.max(...valueLines.map((lines) => lines.length)) * 10.5);
    page.drawRectangle({
      x: MARGIN,
      y: cursorY - stripHeight,
      width: CONTENT_WIDTH,
      height: stripHeight,
      color: colors.soft,
      borderColor: colors.aquaSoft,
      borderWidth: 0.6,
    });
    columns.forEach(([label], index) => {
      const x = MARGIN + index * columnWidth + 7;
      drawTopText(label, x, cursorY - 8, { font: bold, size: 7, color: colors.description });
      drawWrappedLines(valueLines[index], x, cursorY - 22, { size: 8.5, lineHeight: 10.5, color: colors.description });
    });
    cursorY -= stripHeight + 14;
  }

  const columnWidths = [205.8, 77.2, 77.2, 77.2, 77.1];

  function drawTableHeader() {
    const headerHeight = 20;
    page.drawRectangle({
      x: MARGIN,
      y: cursorY - headerHeight,
      width: CONTENT_WIDTH,
      height: headerHeight,
      color: colors.aquaSoft,
    });
    const labels = ["ARTÍCULO", "PRECIO", "CANTIDAD", "DESCUENTO", "IMPORTE"];
    let x = MARGIN;
    labels.forEach((label, index) => {
      const align = index === 0 ? "left" : index === 2 ? "center" : "right";
      const anchor = align === "left" ? x + 6 : align === "center" ? x + columnWidths[index] / 2 : x + columnWidths[index] - 6;
      drawTopText(label, anchor, cursorY - 6, { font: bold, size: 7.1, align, color: colors.description });
      x += columnWidths[index];
    });
    cursorY -= headerHeight;
  }

  function drawItem(line) {
    const nameLines = wrapText(line.item.name || "Artículo", columnWidths[0] - 12, bold, 9.4);
    const descriptionLines = line.item.description
      ? wrapText(line.item.description, columnWidths[0] - 12, regular, 8.2)
      : [];
    const content = [
      ...nameLines.map((text) => ({ text, font: bold, size: 9.4, lineHeight: 12, color: colors.ink, spacerBefore: 0 })),
      ...descriptionLines.map((text, index) => ({
        text,
        font: regular,
        size: 8.2,
        lineHeight: 10.6,
        color: colors.description,
        spacerBefore: index === 0 ? 4 : 0,
      })),
    ];
    const fullHeight = Math.max(30, 13 + content.reduce((sum, entry) => sum + entry.spacerBefore + entry.lineHeight, 0));
    const freshTableCursor = PAGE_HEIGHT - MARGIN - 30 - 20;
    const freshCapacity = freshTableCursor - BOTTOM_LIMIT;
    if (fullHeight <= freshCapacity && cursorY - fullHeight < BOTTOM_LIMIT) {
      addPage(false);
      drawTableHeader();
    }

    let firstSegment = true;
    while (content.length) {
      if (cursorY - 30 < BOTTOM_LIMIT) {
        addPage(false);
        drawTableHeader();
      }
      const continuationLines = firstSegment
        ? []
        : wrapText(`${line.item.name || "Artículo"} (continuación)`, columnWidths[0] - 12, bold, 8.2);
      const continuationEntries = continuationLines.map((text) => ({
        text,
        font: bold,
        size: 8.2,
        lineHeight: 10.6,
        color: colors.description,
        spacerBefore: 0,
      }));
      const continuationHeight = continuationEntries.reduce((sum, entry) => sum + entry.lineHeight, 0)
        + (continuationEntries.length ? 4 : 0);
      const availableHeight = Math.max(10.6, cursorY - BOTTOM_LIMIT - 13 - continuationHeight);
      const segmentEntries = [];
      let segmentHeight = 0;
      while (content.length) {
        const next = content[0];
        const nextHeight = next.spacerBefore + next.lineHeight;
        if (segmentEntries.length && segmentHeight + nextHeight > availableHeight) break;
        segmentEntries.push(content.shift());
        segmentHeight += nextHeight;
        if (segmentHeight >= availableHeight) break;
      }

      const rowTop = cursorY;
      let textY = rowTop - 8;
      for (const entry of continuationEntries) {
        drawTopText(entry.text, MARGIN + 6, textY, entry);
        textY -= entry.lineHeight;
      }
      if (continuationEntries.length) textY -= 4;
      for (const entry of segmentEntries) {
        textY -= entry.spacerBefore;
        drawTopText(entry.text, MARGIN + 6, textY, entry);
        textY -= entry.lineHeight;
      }

      if (firstSegment) {
        const values = [money(line.unitPrice), String(line.quantity), money(line.discount), money(line.net)];
        let x = MARGIN + columnWidths[0];
        values.forEach((value, valueIndex) => {
          const columnIndex = valueIndex + 1;
          const isQuantity = columnIndex === 2;
          const anchor = isQuantity ? x + columnWidths[columnIndex] / 2 : x + columnWidths[columnIndex] - 6;
          drawTopText(value, anchor, rowTop - 8, { size: 8.8, align: isQuantity ? "center" : "right" });
          x += columnWidths[columnIndex];
        });
      }

      const rowHeight = Math.max(30, 13 + continuationHeight + segmentHeight);
      drawLine(MARGIN, rowTop - rowHeight, PAGE_WIDTH - MARGIN, colors.line, 0.45);
      cursorY -= rowHeight;
      firstSegment = false;
      if (content.length) {
        addPage(false);
        drawTableHeader();
      }
    }
  }

  function drawTotals() {
    const rows = [];
    if (result.totalDiscount > 0) {
      rows.push(["Subtotal", money(result.grossSubtotal), colors.ink]);
      rows.push(["Descuentos", `- ${money(result.totalDiscount)}`, colors.green]);
    }
    rows.push(["Total parcial", money(result.taxableSubtotal), colors.ink]);
    rows.push([`IGV (${result.taxRate.toLocaleString("es-PE", { maximumFractionDigits: 2 })}%)`, money(result.taxAmount), colors.ink]);
    const requiredHeight = rows.length * 17 + 37;
    ensureSpace(requiredHeight + 16);
    const blockX = MARGIN + CONTENT_WIDTH / 2;
    const blockRight = PAGE_WIDTH - MARGIN;
    drawLine(blockX, cursorY - 4, blockRight);
    cursorY -= 14;
    rows.forEach(([label, value, color]) => {
      drawTopText(label, blockX, cursorY, { size: 9.3, color });
      drawTopText(value, blockRight, cursorY, { size: 9.3, align: "right", color });
      cursorY -= 17;
    });
    cursorY -= 5;
    drawTopText("Total General", blockX, cursorY, { font: bold, size: 11.8 });
    drawTopText(money(result.total), blockRight, cursorY, { font: bold, size: 11.8, align: "right" });
    cursorY -= 30;
  }

  function drawListItem(marker, value, ordered = false) {
    const markerWidth = ordered ? 18 : 14;
    const lines = wrapText(value, CONTENT_WIDTH - markerWidth, regular, 8.2);
    const lineHeight = 10.8;
    const fullHeight = Math.max(11, lines.length * lineHeight) + 4;
    const freshCapacity = PAGE_HEIGHT - MARGIN - 30 - BOTTOM_LIMIT;
    if (fullHeight <= freshCapacity && cursorY - fullHeight < BOTTOM_LIMIT) addPage(false);

    let lineIndex = 0;
    let firstSegment = true;
    while (lineIndex < lines.length) {
      if (cursorY - lineHeight - 4 < BOTTOM_LIMIT) addPage(false);
      const availableLines = Math.max(1, Math.floor((cursorY - BOTTOM_LIMIT - 4) / lineHeight));
      const chunk = lines.slice(lineIndex, lineIndex + availableLines);
      if (firstSegment) {
        drawTopText(marker, MARGIN, cursorY, { font: ordered ? bold : regular, size: 8.2 });
      }
      drawWrappedLines(chunk, MARGIN + markerWidth, cursorY, { size: 8.2, lineHeight });
      cursorY -= chunk.length * lineHeight + 4;
      lineIndex += chunk.length;
      firstSegment = false;
      if (lineIndex < lines.length) addPage(false);
    }
  }

  function drawNotes() {
    const terms = state.terms.filter((term) => String(term).trim());
    if (terms.length) {
      const firstTermHeight = Math.max(11, wrapText(terms[0], CONTENT_WIDTH - 18, regular, 8.2).length * 10.8) + 4;
      ensureSpace(17 + Math.min(firstTermHeight, 120));
      drawTopText("Condiciones", MARGIN, cursorY, { font: bold, size: 10 });
      cursorY -= 17;
      terms.forEach((term, index) => drawListItem(`${index + 1}.`, term, true));
      cursorY -= 6;
    }

    const services = state.includedServices.filter((service) => String(service).trim());
    if (services.length) {
      const firstServiceHeight = Math.max(11, wrapText(services[0], CONTENT_WIDTH - 14, regular, 8.2).length * 10.8) + 4;
      ensureSpace(17 + Math.min(firstServiceHeight, 120));
      drawTopText("Nuestro servicio incluye los siguientes otros servicios:", MARGIN, cursorY, { font: bold, size: 9.4 });
      cursorY -= 17;
      services.forEach((service) => drawListItem("•", service));
      cursorY -= 4;
    }

    if (String(state.additionalNotes || "").trim()) {
      ensureSpace(30);
      drawTopText("Notas adicionales", MARGIN, cursorY, { font: bold, size: 9.4 });
      cursorY -= 16;
      const lines = wrapText(state.additionalNotes, CONTENT_WIDTH, regular, 8.2);
      for (const line of lines) {
        ensureSpace(11);
        drawTopText(line, MARGIN, cursorY, { size: 8.2 });
        cursorY -= 10.8;
      }
    }
  }

  addPage(true);
  drawFirstPageHeader();
  drawClientCard();
  drawEventStrip();
  drawTableHeader();
  result.lines.forEach(drawItem);
  cursorY -= 14;
  drawTotals();
  drawNotes();

  pages.forEach((pdfPage, index) => {
    page = pdfPage;
    drawLine(MARGIN, 43, PAGE_WIDTH - MARGIN);
    drawTopText(state.company.website || state.company.displayName || "FuelBar", MARGIN, 34, { size: 7.6, color: colors.muted });
    drawTopText(
      `Cotización ${state.quote.number || ""} · Página ${index + 1} de ${pages.length}`,
      PAGE_WIDTH - MARGIN,
      34,
      { size: 7.6, align: "right", color: colors.muted },
    );
  });

  const bytes = await document.save({ useObjectStreams: false });
  return new Blob([bytes], { type: "application/pdf" });
}
