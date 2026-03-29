/**
 * loreParser — extracts <EntityData> blocks from AI lore responses,
 * returning clean narrative text and parsed entity payloads.
 */

export type EntityDataType = 'item' | 'monster' | 'npc';

export interface ParsedEntity {
  type: EntityDataType;
  data: Record<string, unknown>;
}

export interface ParsedLoreMessage {
  /** Narrative text with all <EntityData> blocks stripped */
  text: string;
  /** Extracted entity payloads (0..N) */
  entities: ParsedEntity[];
}

const ENTITY_TAG_RE = /<EntityData\s+type="(item|monster|npc)">\s*([\s\S]*?)\s*<\/EntityData>/gi;

export function parseLoreMessage(raw: string): ParsedLoreMessage {
  const entities: ParsedEntity[] = [];

  // Extract all entity blocks
  let match: RegExpExecArray | null;
  while ((match = ENTITY_TAG_RE.exec(raw)) !== null) {
    const type = match[1].toLowerCase() as EntityDataType;
    const jsonStr = match[2].trim();
    try {
      const data = JSON.parse(jsonStr);
      entities.push({ type, data });
    } catch {
      // LLM produced malformed JSON — skip this block silently
    }
  }
  // Reset regex lastIndex for future calls
  ENTITY_TAG_RE.lastIndex = 0;

  // Strip tags from display text
  const text = raw
    .replace(ENTITY_TAG_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Reset again after replace
  ENTITY_TAG_RE.lastIndex = 0;

  return { text, entities };
}
