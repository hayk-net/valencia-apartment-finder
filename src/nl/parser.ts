import type { Filters } from '../types.js';
import { parseWithRules } from './rules.js';

/**
 * Turning an English sentence into structured Filters.
 *
 * Pluggable design: the rule-based parser is the default (free, offline).
 * A Claude-API-backed parser can be added later behind the same interface —
 * see ./claude.ts — and selected via REALTOR_PARSER=claude.
 */
export interface QueryParser {
  parse(text: string): Filters;
}

export function getParser(): QueryParser {
  // future: if (process.env.REALTOR_PARSER === 'claude') return new ClaudeParser();
  return { parse: parseWithRules };
}
