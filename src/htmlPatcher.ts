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
 *
 * 認識するパターン（広い順）：
 *  1. `<script type="application/xml" data-drawio-id="X">XML</script>` — v0.3 推奨
 *  2. `<script type="application/xml" id="X">XML</script>` — 一般的（自前 mount JS で
 *     id 経由で読み出す書き方）。中身が `<mxfile>` または `<mxGraphModel>` で始まる場合のみ
 *     Drawio として扱う（汎用 XML データを誤認しないため）
 *  3. `<script type="application/drawio+xml" data-diagram-id="X">XML</script>` — v0.2.x 旧マーカー
 */
export function extractDrawioBlocks(html: string): DrawioBlock[] {
  const root = parse(html);
  const blocks: DrawioBlock[] = [];

  // application/xml の script を全部走査
  for (const el of root.querySelectorAll(`script[type="${NEW_MARKER_TYPE}"]`)) {
    // .text は HTML エンティティをデコードしてしまうので .rawText を使う（v0.2.1 で確立）
    const xml = el.rawText.trim();
    const dataAttr = el.getAttribute(NEW_MARKER_ID_ATTR);
    if (dataAttr) {
      // パターン1: data-drawio-id 明示
      blocks.push({ diagramId: dataAttr, xml, marker: 'new' });
      continue;
    }
    const idAttr = el.getAttribute('id');
    if (idAttr && isDrawioXml(xml)) {
      // パターン2: id 属性のみ。中身が Drawio XML の時だけ採用
      blocks.push({ diagramId: idAttr, xml, marker: 'new' });
      continue;
    }
    // data-drawio-id も id も無い application/xml は汎用XML扱いで無視
  }

  // パターン3: 旧マーカー
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
