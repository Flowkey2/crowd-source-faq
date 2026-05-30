/**
 * Zoom transcript → LLM → structured FAQ + Announcement extraction.
 *
 * Uses the MiniMax chat completion API (OpenAI-compatible endpoint).
 * The transcript is sent as a system + user message, and we parse the JSON array response.
 *
 * Prompt design principles:
 *   1. Strict JSON output — model MUST return a JSON array, nothing else.
 *   2. Confidence score — model self-reports 0.0-1.0 so we can filter low-quality extractions.
 *   3. Transcript accuracy caveat — prompt tells model to ignore garbled text.
 *   4. Categorisation — each item is typed as 'FAQ' or 'Announcement'.
 */

import { ZoomInsightType } from '../models/ZoomMeeting.js';

export interface ExtractedItem {
  type: ZoomInsightType;
  question?: string;       // only for FAQ
  answer_or_content: string;
  confidence_score: number;
  transcript_snippet?: string;
}

interface MiniMaxMessage {
  role: 'system' | 'user';
  content: string;
}

interface MiniMaxChoice {
  message: { content: string };
  finish_reason: string;
}

interface MiniMaxResponse {
  choices: MiniMaxChoice[];
  usage?: { input_tokens: number; output_tokens: number };
}

const MINIMAX_API_URL = 'https://api.minimax.io/v1/text/chatcompletion_v2';
const MODEL = 'MiniMax-Text-01';

/**
 * System prompt — instructs the model on strict output format.
 */
const SYSTEM_PROMPT = `You are a precise meeting-notes analyst. Your task is to carefully read the provided Zoom meeting transcript and extract:

1. **FAQs** — questions asked during the meeting along with their answers, if the answer was given in the meeting. Include "We don't know yet" or "This was not answered" if the question was raised but unanswered.

2. **Announcements** — definitive statements of decisions, policies, deadlines, or outcomes announced during the meeting.

Output rules (strictly follow these):
- Return ONLY a valid JSON array. No preamble, no explanation, no markdown.
- Each array item MUST have these exact fields: "type" ("FAQ" or "Announcement"), "question" (string, only for FAQ; omit or null for Announcement), "answer_or_content" (string), "confidence_score" (number 0.0 to 1.0, how certain you are this was correctly extracted), "transcript_snippet" (string, max 150 chars, the exact transcript excerpt this was derived from).
- For FAQs, "question" must be a natural question asked by a participant.
- For Announcements, "question" should be null.
- Set confidence_score to 0.0 if the text is garbled, ambiguous, or you're guessing.
- Ignore lines that are just background noise, laughter, or non-substantive filler.
- If nothing meaningful was found, return: []
- Maximum 20 items total.
- Maximum 500 characters in answer_or_content.
- Maximum 150 characters in transcript_snippet.`;

/**
 * Sends cleaned transcript to MiniMax and returns parsed structured items.
 */
export async function extractInsightsFromTranscript(
  transcript: string,
  meetingTopic: string
): Promise<ExtractedItem[]> {
  const apiKey = process.env.MINIMAX_API_KEY;

  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY env var not set');
  }

  // Truncate transcript to ~8 000 tokens to stay within context limits
  const truncated = transcript.length > 60_000 ? transcript.slice(0, 60_000) + '\n[...transcript truncated...]' : transcript;

  const messages: MiniMaxMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Meeting topic: ${meetingTopic}\n\nTranscript:\n${truncated}`,
    },
  ];

  const body = {
    model: MODEL,
    messages,
    max_tokens: 2048,
    temperature: 0.1, // low temp for deterministic structured output
  };

  const res = await fetch(MINIMAX_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MiniMax extraction API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as MiniMaxResponse;
  const rawContent = data.choices?.[0]?.message?.content ?? '';

  return parseExtractedItems(rawContent);
}

/**
 * Parse the raw model output, being defensive about malformed responses.
 */
function parseExtractedItems(raw: string): ExtractedItem[] {
  // Try to find a JSON array in the response
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as unknown[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is ExtractedItem => {
        if (typeof item !== 'object' || item === null) return false;
        const i = item as Record<string, unknown>;
        return (
          (i.type === 'FAQ' || i.type === 'Announcement') &&
          typeof i.answer_or_content === 'string' &&
          i.answer_or_content.length > 0
        );
      })
      .map((item) => ({
        type: item.type,
        question: item.question ?? undefined,
        answer_or_content: String(item.answer_or_content).slice(0, 500),
        confidence_score: Math.max(0, Math.min(1, Number(item.confidence_score) || 0)),
        transcript_snippet: String(item.transcript_snippet ?? '').slice(0, 150),
      }));
  } catch {
    return [];
  }
}
