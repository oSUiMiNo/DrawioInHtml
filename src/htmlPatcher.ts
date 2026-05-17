import { parse } from 'node-html-parser';

export interface DrawioBlock {
  diagramId: string;
  xml: string;
}

const SCRIPT_TYPE = 'application/drawio+xml';

export function extractDrawioBlocks(html: string): DrawioBlock[] {
  const root = parse(html);
  const scripts = root.querySelectorAll(`script[type="${SCRIPT_TYPE}"]`);
  const blocks: DrawioBlock[] = [];
  for (const el of scripts) {
    const diagramId = el.getAttribute('data-diagram-id') ?? '';
    blocks.push({ diagramId, xml: el.text.trim() });
  }
  return blocks;
}

export function replaceDrawioXml(
  html: string,
  diagramId: string,
  newXml: string
): { html: string; replaced: boolean } {
  let replaced = false;
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const next = html.replace(scriptPattern, (match, attrs: string, _body: string) => {
    if (replaced) {
      return match;
    }
    if (!matchesType(attrs, SCRIPT_TYPE)) {
      return match;
    }
    if (!matchesDiagramId(attrs, diagramId)) {
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

function matchesDiagramId(attrs: string, diagramId: string): boolean {
  const re = new RegExp(
    `\\bdata-diagram-id\\s*=\\s*["']${escapeRegExp(diagramId)}["']`,
    'i'
  );
  return re.test(attrs);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
