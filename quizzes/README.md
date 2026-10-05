# Quiz files

Five question types are supported: **multiple choice** (the default), **true /
false**, **fill-in-the-blank**, **open-ended** and **puzzle** (matching). Each is
described below, in both file formats.

Two formats are supported. Validate any file before class with:

```bash
npm run validate-quiz -- quizzes/example.json
```

## JSON

`correctIndex` is **0-based** (the first option is `0`). `timeLimitSec` is optional
(defaults to 20). A question needs 2–8 options; with more than four, the extra
tiles get their own colors and shapes (★ ✚ ♥ ▼) and the tiles shrink to fit.

```json
{
  "title": "My Quiz",
  "questions": [
    {
      "text": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "timeLimitSec": 20
    }
  ]
}
```

## CSV

Author in any spreadsheet, then export as CSV. The header row is required. The
`correct` column is **1-based** (the option *number*, 1–8) — friendlier for
spreadsheets. `option3` through `option8` and `timeLimitSec` are optional (add
only as many option columns as your widest question needs). The quiz title comes
from the file name.

```csv
question,option1,option2,option3,option4,correct,timeLimitSec
"What does CPU stand for?","Central Processing Unit","Computer Personal Unit","Core Power Unit","Central Peripheral Unit",1,20
```

## True / False questions

Set `type` to `boolean`. Options are automatically **True** / **False**.

**JSON** — use the `correct: true|false` shorthand:

```json
{
  "type": "boolean",
  "text": "HTTPS uses port 443 by default.",
  "correct": true,
  "timeLimitSec": 15
}
```

**CSV** — add a `type` column; put `boolean` on true/false rows (leave it blank
for normal multiple-choice rows). The `correct` column takes `true` or `false`:

```csv
question,type,option1,option2,option3,option4,correct,timeLimitSec
"What does CPU stand for?",,"Central Processing Unit","Computer Personal Unit","Core Power Unit","Central Peripheral Unit",1,20
"The OSI model has 7 layers.",boolean,,,,,true,15
```

In the manual (in-browser) builder, just flip a question to **True / False**.

## Fill-in-the-blank questions

Players type the missing word. List every answer you'll accept; matching ignores
capitals, extra spaces, wrapping quotes and trailing punctuation (so `Paris`,
`paris.` and `PARIS!` all count), but otherwise has to be exact — add common
alternatives yourself. Put `___` in the question text where the blank goes.

**JSON** — set `type` to `fill` and list `answers` (1–10):

```json
{
  "type": "fill",
  "text": "A ___ forwards packets between different networks.",
  "answers": ["router", "a router"]
}
```

**CSV** — `type` is `fill`; every filled option column is an accepted answer.

## Open-ended questions

Players type anything, in a multi-line box with room for up to 500 characters (a
few sentences). **Open-ended questions aren't scored** (and don't break a streak);
at the reveal, everyone's answers appear on the shared screen without names —
short answers grouped and sized by how many people gave each one, longer ones as
cards. Give longer prompts a longer `timeLimitSec` so students have time to
write.

**JSON** — `{ "type": "open", "text": "What should we review next?" }`

**CSV** — `type` is `open`; leave the option and `correct` columns blank.

## Puzzle (matching) questions

Players see the left-hand items in order and the right-hand matches shuffled,
then drag each match next to its item (or tap two matches to swap them). A
perfect match counts as correct; otherwise players earn points for the share of
pairs they got right. Puzzles take 2–6 pairs, and every match must be different.
Give them a little longer than usual — 30–40 seconds is comfortable for 4 pairs.

**JSON** — set `type` to `puzzle` and list the `pairs`:

```json
{
  "type": "puzzle",
  "text": "Match each protocol to its default port.",
  "pairs": [
    { "left": "HTTP", "right": "80" },
    { "left": "HTTPS", "right": "443" },
    { "left": "SSH", "right": "22" }
  ],
  "timeLimitSec": 40
}
```

**CSV** — `type` is `puzzle`; each option column holds one pair written
`item | match` (split at the first `|`), one pair per column:

```csv
question,type,option1,option2,option3,correct,timeLimitSec
"Match each unit to its size.",puzzle,"Bit | 1 binary digit","Nibble | 4 bits","Byte | 8 bits",,30
```

All of these types can also be made in the manual builder — pick the type at
the top of each question.
