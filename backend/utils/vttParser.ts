/**
 * Parses Zoom VTT (WebVTT) transcript files into clean plain text.
 *
 * Zoom VTT format example:
 *   WEBVTT
 *
 *   00:00:00.000 --> 00:00:03.500
 *   Speaker Name
 *   This is the transcript text.
 *
 *   00:00:04.000 --> 00:00:07.500
 *   Another Speaker
 *   Another line.
 *
 * We strip:
 *   - WEBVTT header
 *   - Timestamp lines
 *   - Speaker labels (single words on a line before transcript text)
 *   - Empty lines
 *
 * Returns an array of { speaker, text } segments for downstream LLM use.
 */

export interface TranscriptSegment {
  speaker: string;
  text: string;
}

/**
 * Convert VTT timestamp (HH:MM:SS.mmm) to seconds for filtering.
 */
function timestampToSeconds(ts: string): number {
  const parts = ts.trim().split(':');
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
  }
  return 0;
}

/**
 * Main parse function. Returns clean plain-text string.
 */
export function parseVTT(vttContent: string): string {
  const segments = parseVTTWithSpeakers(vttContent);
  return segments
    .map((s) => `${s.speaker ? s.speaker + ': ' : ''}${s.text}`)
    .join('\n');
}

/**
 * Parse VTT returning speaker + text segments.
 */
export function parseVTTWithSpeakers(vttContent: string): TranscriptSegment[] {
  const lines = vttContent.split(/\r?\n/);
  const segments: TranscriptSegment[] = [];

  let i = 0;

  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes('-->')) i++;
  if (i > 0) i = 0; // restart from line 0, already past WEBVTT

  let currentSpeaker = '';
  let currentText = '';
  let inTimestampBlock = false;

  for (; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip blank lines
    if (!line) {
      if (currentText) {
        segments.push({ speaker: currentSpeaker.trim(), text: currentText.trim() });
        currentSpeaker = '';
        currentText = '';
      }
      inTimestampBlock = false;
      continue;
    }

    // Skip WEBVTT header/meta blocks
    if (line === 'WEBVTT' || line.startsWith('NOTE ') || /^\s*<\/?[a-z]/.test(line)) {
      continue;
    }

    // Timestamp line: "00:00:00.000 --> 00:00:03.500"
    if (line.includes('-->')) {
      // Save any pending segment before starting a new timestamp block
      if (currentText) {
        segments.push({ speaker: currentSpeaker.trim(), text: currentText.trim() });
        currentSpeaker = '';
        currentText = '';
      }
      inTimestampBlock = true;
      continue;
    }

    if (inTimestampBlock) {
      // First non-blank line after timestamp = speaker name (Zoom convention)
      // Speakers are usually single words or "FirstName LastName"
      if (currentSpeaker === '' && /^[A-Za-z]/.test(line) && !line.endsWith('.')) {
        currentSpeaker = line;
      } else {
        currentText += (currentText ? ' ' : '') + line;
      }
    }
  }

  // Flush last segment
  if (currentText) {
    segments.push({ speaker: currentSpeaker.trim(), text: currentText.trim() });
  }

  return segments;
}

/**
 * Returns a concise excerpt for a given time range (e.g. for a snippet field).
 */
export function extractSnippet(segments: TranscriptSegment[], startSeconds = 0, maxSeconds = 60): string {
  return segments
    .filter((s) => {
      // We don't have per-segment timestamps here, so we just take the first N chars
      return true;
    })
    .slice(0, 5) // ~5 lines max for a snippet
    .map((s) => `${s.speaker ? s.speaker + ': ' : ''}${s.text}`)
    .join(' ')
    .slice(0, 400);
}

/**
 * Checks if the transcript is effectively empty or too short to process.
 */
export function isEmptyTranscript(vttContent: string, minChars = 50): boolean {
  const text = parseVTT(vttContent);
  return text.replace(/\s/g, '').length < minChars;
}
