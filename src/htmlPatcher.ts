import { parse } from 'node-html-parser';

export interface DrawioBlock {
  diagramId: string;
  xml: string;
}

const MARKER_TYPE = 'application/xml';

/**
 * Extract Drawio-editable blocks from an HTML document.
 *
 * Recognized pattern (v0.5+, the only supported form):
 *   `<script type="application/xml" id="X">XML</script>` where the body starts
 *   with `<mxfile>` or `<mxGraphModel>`. This is a standards-compliant HTML5
 *   inline data block — browsers ignore it, while user-side JS can read it via
 *   `document.getElementById('X').textContent` for portable rendering.
 *
 * Older extension-only markers (`data-drawio-id`, `application/drawio+xml` +
 * `data-diagram-id`) are no longer recognized starting in v0.5.
 */
export function extractDrawioBlocks(html: string): DrawioBlock[] {
  const root = parse(html);
  const blocks: DrawioBlock[] = [];

  for (const el of root.querySelectorAll(`script[type="${MARKER_TYPE}"]`)) {
    const idAttr = el.getAttribute('id');
    if (!idAttr) continue;
    // Use .rawText (not .text) so HTML entities inside the XML are preserved verbatim.
    const xml = el.rawText.trim();
    if (!isDrawioXml(xml)) continue;
    blocks.push({ diagramId: idAttr, xml });
  }

  return blocks;
}

function isDrawioXml(xml: string): boolean {
  const head = xml.trimStart().slice(0, 64);
  return /<mxfile\b/i.test(head) || /<mxGraphModel\b/i.test(head);
}

/**
 * Replace the body of the Drawio block whose id matches.
 * Only the new marker is supported (v0.5+).
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
    const matches =
      matchesType(attrs, MARKER_TYPE) &&
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
