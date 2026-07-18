# Quiz files

Two formats are supported. Validate any file before class with:

```bash
npm run validate-quiz -- quizzes/example.json
```

## JSON

`correctIndex` is **0-based** (the first option is `0`). `timeLimitSec` is optional
(defaults to 20). A question needs 2–4 options.

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
`correct` column is **1-based** (the option *number*, 1–4) — friendlier for
spreadsheets. `option3`, `option4`, and `timeLimitSec` are optional. The quiz
title comes from the file name.

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
