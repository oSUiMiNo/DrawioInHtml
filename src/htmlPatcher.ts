import { parse } from 'node-html-parser';

export interface DrawioBlock {
  diagramId: string;
  xml: string;
  /**
   * Target form used when writing this block back:
   *  - 'new' -> type="application/xml" + data-drawio-id="..."
   *  - 'old' -> type="application/drawio+xml" + data-diagram-id="..." (v0.2.x compatibility)
   */
  marker: 'new' | 'old';
}

const NEW_MARKER_TYPE = 'application/xml';
const NEW_MARKER_ID_ATTR = 'data-drawio-id';
const OLD_MARKER_TYPE = 'application/drawio+xml';
const OLD_MARKER_ID_ATTR = 'data-diagram-id';

/**
 * Extract Drawio-editable blocks from an HTML document.
 *
 * Recognized patterns (broadest first):
 *  1. `<script type="application/xml" data-drawio-id="X">XML</script>` — v0.3+ recommended
 *  2. `<script type="application/xml" id="X">XML</script>` — generic "self-mount" pattern
 *     (user JS reads the script by id). Only treated as Drawio when the body starts with
 *     `<mxfile>` or `<mxGraphModel>`, to avoid mis-detecting unrelated XML.
 *  3. `<script type="application/drawio+xml" data-diagram-id="X">XML</script>` — v0.2.x legacy
 */
export function extractDrawioBlocks(html: string): DrawioBlock[] {
  const root = parse(html);
  const blocks: DrawioBlock[] = [];

  // Walk every application/xml script.
  for (const el of root.querySelectorAll(`script[type="${NEW_MARKER_TYPE}"]`)) {
    // Use .rawText (not .text) so HTML entities inside the XML are preserved verbatim. (v0.2.1)
    const xml = el.rawText.trim();
    const dataAttr = el.getAttribute(NEW_MARKER_ID_ATTR);
    if (dataAttr) {
      // Pattern 1: data-drawio-id present.
      blocks.push({ diagramId: dataAttr, xml, marker: 'new' });
      continue;
    }
    const idAttr = el.getAttribute('id');
    if (idAttr && isDrawioXml(xml)) {
      // Pattern 2: id attribute only — accept only when the body is Drawio XML.
      blocks.push({ diagramId: idAttr, xml, marker: 'new' });
      continue;
    }
    // application/xml without data-drawio-id and without id is generic XML — ignore.
  }

  // Pattern 3: legacy marker.
  for (const el of root.querySelectorAll(`script[type="${OLD_MARKER_TYPE}"]`)) {
    const id = el.getAttribute(OLD_MARKER_ID_ATTR) ?? '';
    blocks.push({ diagramId: id, xml: el.rawText.trim(), marker: 'old' });
  }

  return blocks;
}

function isDrawioXml(xml: string): boolean {
  const head = xml.trimStart().slice(0, 64);
  return /<mxfile\b/i.test(head) || /<mxGraphModel\b/i.test(head);
}

/**
 * Replace the body of the Drawio block whose diagramId matches.
 * Searches both new and legacy markers in order; rewrites the first match.
 */
export function replaceDrawioXml(
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
    const isNewByData =
      matchesType(attrs, NEW_MARKER_TYPE) &&
      matchesAttr(attrs, NEW_MARKER_ID_ATTR, diagramId);
    const isNewById =
      matchesType(attrs, NEW_MARKER_TYPE) &&
      matchesAttr(attrs, 'id', diagramId) &&
      isDrawioXml(body);
    const isOld =
      matchesType(attrs, OLD_MARKER_TYPE) &&
      matchesAttr(attrs, OLD_MARKER_ID_ATTR, diagramId);
    if (!isNewByData && !isNewById && !isOld) {
      return match;
    }
    replaced = true;
    return `<script${attrs}>\n${newXml}\n</script>`;
  });
  return { html: next, replaced };
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
