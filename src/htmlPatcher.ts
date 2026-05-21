import { parse } from 'node-html-parser';

export interface DrawioBlock {
  diagramId: string;
  xml: string;
  // Which source form the block was extracted from. Used by replaceDrawioXml
  // to decide where to write the new XML back.
  source: 'script-id' | 'mxgraph-div';
}

const SCRIPT_MARKER_TYPE = 'application/xml';
const AUTO_ID_PREFIX = 'drawio-mxgraph-';

/**
 * Extract Drawio-editable blocks from an HTML document.
 *
 * Two source forms are recognized (v0.6+):
 *  1. **script-id**: `<script type="application/xml" id="X">XML</script>` whose
 *     body starts with `<mxfile>` or `<mxGraphModel>`. Standards-compliant HTML5
 *     inline data block — browsers ignore it, while user-side JS can read it via
 *     `document.getElementById('X').textContent` for portable rendering.
 *  2. **mxgraph-div**: `<div class="mxgraph" data-mxgraph='{"...","xml":"<mxfile>..."}'>`.
 *     This is what Drawio's official "Extras → Edit Diagram → Publish → HTML"
 *     exports. The XML lives inside the JSON value of the `data-mxgraph`
 *     attribute. When the div has no `id`, an identifier is auto-assigned as
 *     `drawio-mxgraph-<n>` (1-based, in document order).
 */
export function extractDrawioBlocks(html: string): DrawioBlock[] {
  const root = parse(html);
  const blocks: DrawioBlock[] = [];

  // Form 1: <script type="application/xml" id="X">
  for (const el of root.querySelectorAll(`script[type="${SCRIPT_MARKER_TYPE}"]`)) {
    const idAttr = el.getAttribute('id');
    if (!idAttr) continue;
    // Use .rawText (not .text) so HTML entities inside the XML are preserved verbatim.
    const xml = el.rawText.trim();
    if (!isDrawioXml(xml)) continue;
    blocks.push({ diagramId: idAttr, xml, source: 'script-id' });
  }

  // Form 2: <div class="mxgraph" data-mxgraph='{"xml":"..."}'>
  let mxgraphDivIndex = 0;
  for (const el of root.querySelectorAll('div.mxgraph[data-mxgraph]')) {
    mxgraphDivIndex += 1;
    const raw = el.getAttribute('data-mxgraph');
    if (!raw) continue;
    const xml = extractXmlFromMxgraphAttr(raw);
    if (xml === null) continue;
    if (!isDrawioXml(xml)) continue;
    const diagramId = el.getAttribute('id') ?? `${AUTO_ID_PREFIX}${mxgraphDivIndex}`;
    blocks.push({ diagramId, xml, source: 'mxgraph-div' });
  }

  return blocks;
}

function extractXmlFromMxgraphAttr(raw: string): string | null {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && typeof obj.xml === 'string') {
      return obj.xml;
    }
    return null;
  } catch {
    return null;
  }
}

function isDrawioXml(xml: string): boolean {
  const head = xml.trimStart().slice(0, 64);
  return /<mxfile\b/i.test(head) || /<mxGraphModel\b/i.test(head);
}

/**
 * Replace the body of the Drawio block whose diagramId matches.
 * Handles both source forms (see extractDrawioBlocks above).
 */
export function replaceDrawioXml(
  html: string,
  diagramId: string,
  newXml: string
): { html: string; replaced: boolean } {
  // Try Form 1 (script-id) first.
  let result = replaceScriptIdXml(html, diagramId, newXml);
  if (result.replaced) return result;

  // Try Form 2 (mxgraph-div). The diagramId is either an explicit id attribute
  // or an auto-assigned `drawio-mxgraph-<n>`.
  result = replaceMxgraphDivXml(html, diagramId, newXml);
  return result;
}

function replaceScriptIdXml(
  html: string,
  diagramId: string,
  newXml: string
): { html: string; replaced: boolean } {
  let replaced = false;
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const next = html.replace(scriptPattern, (match, attrs: string, body: string) => {
    if (replaced) {
      return match;
    }
    const matches =
      matchesType(attrs, SCRIPT_MARKER_TYPE) &&
      matchesAttr(attrs, 'id', diagramId) &&
      isDrawioXml(body);
    if (!matches) {
      return match;
    }
    replaced = true;
    return `<script${attrs}>\n${newXml}\n</script>`;
  });
  return { html: next, replaced };
}

function replaceMxgraphDivXml(
  html: string,
  diagramId: string,
  newXml: string
): { html: string; replaced: boolean } {
  // String-level rewrite (rather than via node-html-parser) to preserve the
  // JSON's internal backslash-escapes intact. node-html-parser's
  // setAttribute + toString() round-trip drops `\` in attribute values, which
  // turns `\"` inside the embedded JSON into a bare `"` and corrupts the JSON.
  //
  // Strategy: walk every `data-mxgraph=(['"])(...)\1` occurrence in document
  // order. For each, look back to the nearest enclosing `<div` opening tag to
  // pick up the div's attribute string, so we can match by explicit `id` or
  // by auto-numbered index. Then JSON-parse the captured value (HTML-decoded),
  // swap the `xml` field, and re-emit with the same outer quote style.
  const autoIndex = diagramId.startsWith(AUTO_ID_PREFIX)
    ? parseInt(diagramId.slice(AUTO_ID_PREFIX.length), 10)
    : null;
  const explicitId = autoIndex === null ? diagramId : null;

  const pattern = /\bdata-mxgraph\s*=\s*(['"])([\s\S]*?)\1/g;
  let mxgraphIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    mxgraphIndex += 1;
    const outerQuote = m[1];
    const rawAttrValue = m[2];

    // Locate the enclosing <div ...> opening tag.
    const beforeAttr = html.slice(0, m.index);
    const divOpenStart = beforeAttr.lastIndexOf('<div');
    if (divOpenStart === -1) continue;
    const divAttrsStr = html.slice(divOpenStart + 4, m.index + m[0].length);
    // Must have class="...mxgraph..." to be one of our targets.
    if (!/\bclass\s*=\s*["'][^"']*\bmxgraph\b[^"']*["']/i.test(divAttrsStr)) continue;

    if (explicitId !== null) {
      if (!matchesAttr(divAttrsStr, 'id', explicitId)) continue;
    } else if (autoIndex !== null) {
      if (mxgraphIndex !== autoIndex) continue;
    } else {
      continue;
    }

    const decoded = decodeAttrValue(rawAttrValue);
    let obj: unknown;
    try {
      obj = JSON.parse(decoded);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== 'object') continue;
    (obj as Record<string, unknown>).xml = newXml;
    const newJson = JSON.stringify(obj);

    // Re-encode for the chosen outer quote so the attribute parses back.
    // Drawio's own export uses single-quoted outer; we keep whichever the
    // original used to minimize the diff.
    const reencoded = escapeForAttr(newJson, outerQuote);
    const before = html.slice(0, m.index);
    const after = html.slice(m.index + m[0].length);
    return {
      html: `${before}data-mxgraph=${outerQuote}${reencoded}${outerQuote}${after}`,
      replaced: true,
    };
  }
  return { html, replaced: false };
}

function decodeAttrValue(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function escapeForAttr(value: string, outerQuote: string): string {
  // Escape only the outer-quote character — that is enough to keep the
  // attribute boundary intact. Other characters are HTML-safe in attribute
  // values (raw `<`/`>` are tolerated by browsers inside attribute values).
  if (outerQuote === '"') {
    return value.replace(/"/g, '&quot;');
  }
  return value.replace(/'/g, '&#39;');
}

function matchesType(attrs: string, type: string): boolean {
  const re = new RegExp(`\\btype\\s*=\\s*["']${escapeRegExp(type)}["']`, 'i');
  return re.test(attrs);
}

function matchesAttr(attrs: string, attrName: string, value: string): boolean {
  const re = new RegExp(
    `\\b${escapeRegExp(attrName)}\\s*=\\s*["']${escapeRegExp(value)}["']`,
    'i'
  );
  return re.test(attrs);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
