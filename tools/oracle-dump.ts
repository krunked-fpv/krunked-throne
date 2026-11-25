import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ObjectDef, OracleData, OracleObjectEntry } from '@/contracts';

export const DEFAULT_STEAM_DIR = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Nuclear Throne';

export interface OracleDumpOptions {
  steamDir?: string;
  outDir?: string;
  manifestObjects?: Record<string, ObjectDef>;
  allowMissing?: boolean;
  quiet?: boolean;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-zA-Z]+);/g, (full, name: string) => HTML_ENTITIES[name] ?? full);
}

function stripTagsAndClean(html: string): string {
  const withoutTags = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(withoutTags)
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Parses nested `<div class="item">` blocks inside `<div id="doc">` of NTT-Objects.html
 * using a balanced div-tag scanner so each object captures only its own direct content
 * and accurate parent category hierarchy.
 */
export function parseNttObjectsHtml(
  html: string,
  manifestObjects?: Record<string, ObjectDef>,
): Record<string, OracleObjectEntry> {
  const docIdx = html.indexOf('<div id="doc"');
  const slice = docIdx >= 0 ? html.slice(docIdx) : html;

  const tagRegex = /<div\b[^>]*>|<\/div>/gi;
  interface DivFrame {
    openStart: number;
    openEnd: number;
    isItem: boolean;
    isContent: boolean;
    categoryName?: string;
    objectId?: string;
    contentStart?: number;
    contentEnd?: number;
    childItemRanges: Array<[number, number]>;
  }

  const result: Record<string, OracleObjectEntry> = {};
  const stack: DivFrame[] = [];
  const categoryStack: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(slice)) !== null) {
    const token = match[0];
    const tokenStart = match.index;
    const tokenEnd = tokenStart + token.length;

    if (token.toLowerCase() === '</div>') {
      const closed = stack.pop();
      if (!closed) continue;

      if (closed.isContent) {
        const parent = stack[stack.length - 1];
        if (parent && parent.isItem && parent.contentStart === undefined) {
          parent.contentStart = closed.openEnd;
          parent.contentEnd = tokenStart;
        }
      } else if (closed.isItem) {
        if (closed.categoryName !== undefined) {
          categoryStack.pop();
        }
        for (let i = stack.length - 1; i >= 0; i--) {
          const ancestor = stack[i];
          if (ancestor && ancestor.isItem) {
            ancestor.childItemRanges.push([closed.openStart, tokenEnd]);
            break;
          }
        }

        if (closed.objectId !== undefined) {
          const hasContent = closed.contentStart !== undefined && closed.contentEnd !== undefined;
          const rawContent = hasContent ? slice.slice(closed.contentStart!, closed.contentEnd!) : '';
          let directContent = rawContent;
          if (hasContent && closed.childItemRanges.length > 0) {
            const relRanges = closed.childItemRanges
              .map(([s, e]): [number, number] => [s - closed.contentStart!, e - closed.contentStart!])
              .filter(([s, e]) => s >= 0 && e <= rawContent.length && s < e)
              .sort((a, b) => a[0] - b[0]);

            const parts: string[] = [];
            let cursor = 0;
            for (const [s, e] of relRanges) {
              if (s > cursor) parts.push(rawContent.slice(cursor, s));
              if (e > cursor) cursor = e;
            }
            if (cursor < rawContent.length) parts.push(rawContent.slice(cursor));
            directContent = parts.join('');
          }

          const objName = closed.objectId;
          const parentMatch = /Parent:\s*(?:<a[^>]*>)?([^<\r\n]+?)(?:<\/a>)?(?:\s*<\/p>|\s*<br|\s*$)/i.exec(directContent);
          const parent = parentMatch && parentMatch[1] ? decodeHtmlEntities(parentMatch[1]).trim() : null;

          const variables: string[] = [];
          const varSet = new Set<string>();
          const varSectionIdx = directContent.search(/Variables:\s*(?:<\/p>)?\s*<ul>/i);
          const varSource = varSectionIdx >= 0 ? directContent.slice(varSectionIdx) : directContent;
          const liVarRegex = /<li\b[^>]*>\s*<tt>([^<]+)<\/tt>/gi;
          let vm: RegExpExecArray | null;
          while ((vm = liVarRegex.exec(varSource)) !== null) {
            const varName = decodeHtmlEntities(vm[1] ?? '').trim();
            if (varName && !varSet.has(varName)) {
              varSet.add(varName);
              variables.push(varName);
            }
          }

          let notesHtml = directContent;
          const cutIdxCandidates = [
            notesHtml.search(/<p[^>]*>\s*Parent:/i),
            notesHtml.search(/<p[^>]*>\s*Variables:/i),
            notesHtml.search(/<ul\b/i),
          ].filter((i) => i >= 0);
          if (cutIdxCandidates.length > 0) {
            notesHtml = notesHtml.slice(0, Math.min(...cutIdxCandidates));
          }
          const notes = stripTagsAndClean(notesHtml);

          const manifestObj = manifestObjects?.[objName];
          result[objName] = {
            name: objName,
            parent: parent && parent.length > 0 ? parent : null,
            category: categoryStack.join(' / ') || 'General',
            spriteName: manifestObj ? manifestObj.spriteName : null,
            depth: manifestObj ? manifestObj.depth : null,
            variables,
            notes,
          };
        }
      }
      continue;
    }

    const isItem = /\bclass\s*=\s*"[^"]*\bitem\b[^"]*"/i.test(token);
    const isContent = /\bclass\s*=\s*"[^"]*\bcontent\b[^"]*"/i.test(token);
    const frame: DivFrame = {
      openStart: tokenStart,
      openEnd: tokenEnd,
      isItem,
      isContent,
      childItemRanges: [],
    };

    if (isItem) {
      const lookahead = slice.slice(tokenEnd, tokenEnd + 300);
      const objMatch = /^\s*<a\s+class="header"\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(lookahead);
      if (objMatch && objMatch[1]) {
        frame.objectId = decodeHtmlEntities(objMatch[1]).trim();
      } else {
        const catMatch = /^\s*<span\s+class="header"[^>]*>([\s\S]*?)<\/span>/i.exec(lookahead);
        if (catMatch && catMatch[1]) {
          const catName = stripTagsAndClean(catMatch[1]);
          frame.categoryName = catName;
          categoryStack.push(catName);
        }
      }
    }

    stack.push(frame);
  }

  return result;
}

/**
 * Parses `NTT-Scripting.html` `<a class="header" id="...">...</a>` entries into a deduplicated list.
 */
export function parseNttScriptingHtml(html: string): string[] {
  const docIdx = html.indexOf('<div id="doc"');
  const slice = docIdx >= 0 ? html.slice(docIdx) : html;
  const headerRegex = /<a\s+class="header"\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const scripts: string[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(slice)) !== null) {
    const id = decodeHtmlEntities(m[1] ?? '').trim();
    const label = stripTagsAndClean(m[2] ?? '');
    const entry = label.length > 0 ? label : id;
    if (entry && !seen.has(entry)) {
      seen.add(entry);
      scripts.push(entry);
    }
  }
  return scripts;
}

export function dumpOracle(options: OracleDumpOptions = {}): OracleData | null {
  const steamDir = options.steamDir ?? process.env.NT_STEAM_DIR ?? DEFAULT_STEAM_DIR;
  const outDir = options.outDir ?? path.resolve(process.cwd(), '.nt-assets');
  const objectsHtmlPath = path.join(steamDir, 'NTT-Objects.html');
  const scriptingHtmlPath = path.join(steamDir, 'NTT-Scripting.html');

  const hasObjects = fs.existsSync(objectsHtmlPath);
  const hasScripting = fs.existsSync(scriptingHtmlPath);

  if (!hasObjects && !hasScripting) {
    if (options.allowMissing) {
      if (!options.quiet) {
        console.log(`[oracle-dump] NTT HTML docs not found in "${steamDir}" (--allow-missing set, skipping).`);
      }
      return null;
    }
    throw new Error(
      `[oracle-dump] Neither NTT-Objects.html nor NTT-Scripting.html found in "${steamDir}". Set NT_STEAM_DIR or pass --allow-missing.`,
    );
  }

  // Enrich with manifest.json objects if not explicitly supplied and already extracted
  let manifestObjects = options.manifestObjects;
  if (!manifestObjects) {
    const manifestPath = path.join(outDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
          objects?: Record<string, ObjectDef>;
        };
        if (parsed.objects) {
          manifestObjects = parsed.objects;
        }
      } catch {
        // Ignore corrupt/partial manifest when running oracle standalone
      }
    }
  }

  const objects: Record<string, OracleObjectEntry> = hasObjects
    ? parseNttObjectsHtml(fs.readFileSync(objectsHtmlPath, 'utf8'), manifestObjects)
    : {};

  const scripts: string[] = hasScripting
    ? parseNttScriptingHtml(fs.readFileSync(scriptingHtmlPath, 'utf8'))
    : [];

  const oracleData: OracleData = {
    generatedAt: new Date().toISOString(),
    objectCount: Object.keys(objects).length,
    objects,
    scripts,
  };

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'oracle.json');
  fs.writeFileSync(outPath, JSON.stringify(oracleData, null, 2), 'utf8');

  if (!options.quiet) {
    const enriched = Object.values(objects).filter((o) => o.spriteName !== null || o.depth !== null).length;
    console.log(
      `[oracle-dump] Wrote ${outPath}: ${oracleData.objectCount} objects (${enriched} OBJT-enriched), ${oracleData.scripts.length} scripting entries.`,
    );
  }

  return oracleData;
}

function parseCliArgs(argv: string[]): OracleDumpOptions {
  const opts: OracleDumpOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--allow-missing') {
      opts.allowMissing = true;
    } else if (arg === '--quiet') {
      opts.quiet = true;
    } else if (arg === '--steam-dir' && argv[i + 1]) {
      opts.steamDir = argv[++i];
    } else if (arg === '--out-dir' && argv[i + 1]) {
      opts.outDir = argv[++i];
    }
  }
  return opts;
}

const isMain =
  typeof process !== 'undefined' &&
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    dumpOracle(parseCliArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
