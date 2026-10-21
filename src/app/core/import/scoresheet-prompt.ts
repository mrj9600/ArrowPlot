/*
 * Instructions for an AI model that reads a photo of a handwritten scoresheet and answers with
 * JSON that scoresheet.ts can import. Built from the face catalogue so they stay in step with it.
 */
import { formatDimension } from '../dimension';
import { getTarget, hasFaceSizes, isFirstHitStyle, TARGET_PICKER_ORDER } from '../targets';
import { SHEET_FORMAT, SHEET_VERSION, styleValues } from './scoresheet';

function faceList(): string {
  return TARGET_PICKER_ORDER.map((id) => {
    const t = getTarget(id);
    const sizes = hasFaceSizes(t)
      ? ` Sizes: ${t.diameters.map(formatDimension).filter(Boolean).join(', ')}.`
      : '';
    const styles = t.styles
      .map((s, i) => {
        const values = styleValues(t, i);
        const v = isFirstHitStyle(t, i)
          ? values.map((l, a) => `arrow ${a + 1}: ${l.join(' ')}`).join('; ')
          : values[0].join(' ');
        return `  - scoring ${i}: ${s.name} — values: ${v}`;
      })
      .join('\n');
    return `- face ${id}: ${t.name} (${t.kind}).${sizes}\n${styles}`;
  }).join('\n');
}

const EXAMPLE = {
  format: SHEET_FORMAT,
  version: SHEET_VERSION,
  sessions: [
    {
      date: '2026-10-18',
      title: 'Club 3D',
      location: 'Hareskoven',
      notes: null,
      rounds: [
        {
          face: 17,
          scoring: 0,
          faceSize: null,
          distance: null,
          arrowsPerEnd: 2,
          writtenTotal: 34,
          ends: [
            { target: 5, arrows: ['10', '8'], total: 18, running: 18, judged: 27, measured: null },
            { target: 6, arrows: ['11', 'M'], total: 11, running: 29 },
            { target: 7, arrows: null, total: 5, running: 34 },
          ],
        },
      ],
    },
  ],
  uncertain: ['Target 6: second arrow could be "5" or "M"; the total 11 suggests "M".'],
};

/** The instructions, as Markdown, to give the model together with the photo. */
export function scoresheetPrompt(): string {
  return `# Read an archery scoresheet for ArrowPlot

You get a photo of a handwritten archery scoresheet. Read it and answer with **only** a JSON
object in the format below, in a \`\`\`json code block. ArrowPlot imports that JSON, so follow the
format exactly and do not add fields of your own.

## How scoresheets are laid out

- **Target archery (WA, indoor/outdoor):** one row per end, one box per arrow (3 or 6), then the
  end total and usually a running total. Arrows are often written highest first. Some sheets also
  count hits, 10s and Xs at the end of the row or at the bottom.
- **Field:** one row per target (post), numbered. The round may start at any target, so the first
  row may be e.g. target 9, and numbering wraps back to 1. Usually 3 arrows per target.
- **3D:** one row per target. Often 1 or 2 arrows per target, and on first-hit rounds (IFAA
  animal, NFAA animal) up to 3 arrows where only the first hit counts. Rows may show only the
  points for the target, or which arrow hit and where. The judged distance is sometimes written
  next to the target number.
- A sheet can have columns for more than one archer. Read the archer whose name is at the top or
  is marked; if that's unclear, read the first and say so in \`uncertain\`.

## Reading the handwriting

- The arrow values are the record; the totals are not. Totals are added up by hand on the range
  and often contain arithmetic errors, so read every arrow on its own first.
- Then use the totals as a check, carefully: the arrows of an end should add up to the end total,
  and the running totals should grow by each end total. Only when a digit is genuinely hard to
  read (look out for 1/7, 4/9, 3/5/8, 6/0 and 10/11/16) may the totals decide between readings.
  Never change a clearly written arrow to make a total fit.
- One wrong running total carries its error into every total after it. Compare the step from one
  running total to the next with the end, rather than the running totals themselves.
- Addition errors on sheets are most often exactly 10 off (a slip when carrying). A total that is
  10 away from the arrows is almost always an error on the sheet, not a misread arrow.
- When arrows and totals disagree, keep the arrows as you read them and the totals exactly as
  written, and say in \`uncertain\` whether it looks like an addition error on the sheet or a value
  you may have misread.
- Crossed-out or overwritten values: use the corrected value.
- Misses may be written as M, 0, –, / or left empty. Write a miss as "M". On faces where a zone
  is worth 0 (e.g. NFAS body), write "0" only for that zone.
- The inner 10 is written X, ⊗ or 10 with a ring around it. Write "X".
- Never invent values. If something can't be read, give your best guess and explain it in
  \`uncertain\` (where on the sheet, and what the alternatives are).
- Dates are usually written day first (e.g. 18.10.26 or 18/10/2026). Give them as YYYY-MM-DD.

## Choosing the face and scoring

Pick the face (\`face\`) and scoring (\`scoring\`) that match the sheet: printed round names (WA 18 m,
Vegas, IFAA, IBO, …), the distance, the values used and the number of arrows. Arrow values must be
written exactly as one of the values listed for that scoring. On 3D faces you may write the zone
name instead (e.g. "Vital", "Kill", "Body") when the sheet records zones rather than points. When the sheet says nothing about the
face, use face 0 scoring 0 for target archery, face 13 for WA field, and face 17 for 3D with
11-10-8-5 scoring.

${faceList()}

## Output format

\`\`\`text
{
  "format": "${SHEET_FORMAT}",
  "version": ${SHEET_VERSION},
  "sessions": [ {                 // usually one per sheet
    "date": "YYYY-MM-DD" | null,
    "title": string | null,       // round name or event, as on the sheet
    "location": string | null,
    "notes": string | null,       // anything else worth keeping (weather, remarks)
    "rounds": [ {                 // one per distance or part of the sheet
      "face": number,             // face id from the list
      "scoring": number,          // scoring index for that face (default 0)
      "faceSize": { "value": number, "unit": "cm" | "in" } | null,
      "distance": { "value": number, "unit": "m" | "yd" } | null,   // null on 3D and field
      "arrowsPerEnd": number,
      "writtenTotal": number | null,   // the round total as written
      "ends": [ {
        "arrows": [string] | null,     // values as listed for the scoring, in the order shot if
                                       // known; null if only a total is written
        "total": number | null,        // the end total as written; null if the sheet has none
        "running": number | null,      // the running total after this end, as written
        "target": number | null,       // 3D/field: target number of this row
        "judged": number | null,       // 3D/field: judged distance in metres, if written
        "measured": number | null,     // measured distance in metres, if written
        "note": string | null
      } ]
    } ]
  } ],
  "uncertain": [string]           // everything the archer should double-check; [] if none
}
\`\`\`

On first-hit scorings, list the arrows as shot up to and including the first hit, e.g.
\`["M", "16"]\` when the second arrow hit for 16; leave out arrows that were not shot.

Example:

\`\`\`json
${JSON.stringify(EXAMPLE, null, 2)}
\`\`\`
`;
}
