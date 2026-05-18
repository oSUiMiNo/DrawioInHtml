import { parse } from 'node-html-parser';

export interface DrawioBlock {
  diagramId: string;
  xml: string;
  /**
   * このブロックを書き戻すときの target 仕様：
   *  - 'new'  → type="application/xml" + data-drawio-id="..."
   *  - 'old'  → type="application/drawio+xml" + data-diagram-id="..." （v0.2.x 互換）
   */
  marker: 'new' | 'old';
}

const NEW_MARKER_TYPE = 'application/xml';
const NEW_MARKER_ID_ATTR = 'data-drawio-id';
const OLD_MARKER_TYPE = 'application/drawio+xml';
const OLD_MARKER_ID_ATTR = 'data-diagram-id';

/**
 * HTML 文書から Drawio 編集対象ブロックを取り出す。
 * 新マーカー（v0.3+）と旧マーカー（v0.2.x 互換）の両方を抽出する。
 */
export function extractDrawioBlocks(html: string): DrawioBlock[] {
  const root = parse(html);
  const blocks: DrawioBlock[] = [];

  // 新マーカー：<script type="application/xml" data-drawio-id="X">XML</script>
  for (const el of root.querySelectorAll(`script[type="${NEW_MARKER_TYPE}"]`)) {
    const id = el.getAttribute(NEW_MARKER_ID_ATTR);
    if (!id) continue; // data-drawio-id がない application/xml は対象外（汎用 XML 用途を尊重）
    // .text は HTML エンティティをデコードしてしまうので .rawText を使う（v0.2.1 で確立）
    blocks.push({ diagramId: id, xml: el.rawText.trim(), marker: 'new' });
  }

  // 旧マーカー：<script type="application/drawio+xml" data-diagram-id="X">XML</script>
  for (const el of root.querySelectorAll(`script[type="${OLD_MARKER_TYPE}"]`)) {
    const id = el.getAttribute(OLD_MARKER_ID_ATTR) ?? '';
    blocks.push({ diagramId: id, xml: el.rawText.trim(), marker: 'old' });
  }

  return blocks;
}

/**
 * 指定された diagramId を持つ Drawio ブロックの中身を新しい XML で置換する。
 * 新旧両マーカーを順に検索し、最初に一致したものを書き換える。
 */
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
    const isNew =
      matchesType(attrs, NEW_MARKER_TYPE) &&
      matchesAttr(attrs, NEW_MARKER_ID_ATTR, diagramId);
    const isOld =
      matchesType(attrs, OLD_MARKER_TYPE) &&
      matchesAttr(attrs, OLD_MARKER_ID_ATTR, diagramId);
    if (!isNew && !isOld) {
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
