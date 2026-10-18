# Content guide: adding an artwork

Each day of the calendar has one file: `public/data/artworks/MM-DD.json` (`02-29` is the leap-day artwork). The three files `10-15.json`, `10-16.json` and `10-17.json` are the reference examples. Match their structure, depth, and tone.

## 1. Choose an artwork

Use **The Metropolitan Museum of Art Open Access** collection only (for now). Every object must satisfy all of these in its API record:

- `isPublicDomain` is `true`.
- `primaryImageSmall` is a non-empty `https://images.metmuseum.org/...` URL.
- The object is a good teaching image: visually engaging, clear at about 1000 px wide, and rich enough to support 15 different questions.

Verify the record by fetching `https://collectionapi.metmuseum.org/public/collection/v1/objects/{objectID}` and copying values **exactly** as the record gives them. Never fill a field from memory. If the record does not say something (movement, region), either leave the field out or use a well-established, widely agreed label. The search endpoint of the Met API is not reachable from this environment, so find candidates by knowledge and web search, then confirm each by object ID.

Aim for variety across the whole collection: cultures, periods, media (painting, print, sculpture, ceramics, textiles, metalwork, photography, manuscripts, furniture, musical instruments, and more), and artists of different genders and backgrounds. Do not pick the same artwork or the same museum object twice. Check the `public/data/artworks/` folder for existing days and objects before you write.

### Images and placeholders

Prefer the Met record's own images. If the record has no usable `primaryImageSmall`, or you cannot confirm the image fields, do not guess a URL. Keep the artwork (its text must still be verified from the record) and write the image block as a placeholder:

```json
"image": { "status": "pending" }
```

The page shows "Image coming soon" and the archive shows a blank thumbnail. The owner will link images from a manual library later by adding `url`, `credit`, and `license` to that block. Never put a made-up URL there. If you cannot fetch the record at all, pick a different object: a placeholder image is allowed, unverified text is not.

## 2. Child-safety screening (strict)

Exclude anything with nudity (including bare torsos of figures in a way that centers the body), explicit or suggestive content, graphic violence, gore, torture, executions, dead bodies, weapons being used against people, disturbing or frightening imagery, or imagery that is likely to be hurtful to a group. When in doubt, choose a different object.

- Read the record's `title`, `classification`, `objectName`, `tags`, and `medium`. Reject objects whose tags include terms such as Nudes, Nude, Genitalia, Breasts, Death, Skulls, Skeletons, Corpses, Executions, War, Battles, Martyrdom, Crucifixion, Violence, Torture, Hunting kills, or similar.
- You cannot see the image. Do not claim you did. Set `safety.status` to `"metadata-screened"` and describe exactly what you checked in `safety.method`. A person confirms the image later.
- Religious, mythological, historical, and cultural works are fine when this specific object is suitable for a K-12 classroom.

## 3. Fields

Copy the field list from the examples. Notes:

- `id`: `met-{objectID}`.
- `day`: the assigned `MM-DD`. The file name must match.
- `title`: the record title, or a shortened form when the record title is very long. If shortened, keep the full text in `recordTitle`.
- `artist`: the record's artist name, or a culture/workshop label such as "Workshop of ..." only if the record gives one. For anonymous objects use the culture or "Artist unknown" plus a culture in `region`. Do not invent attributions.
- `date`: the record's `objectDate`, verbatim.
- `medium`: the record's `medium`, verbatim.
- `region`: from the record (`country`, `culture`, `region`) where present.
- `image.url` = `primaryImageSmall`; `image.fullUrl` = `primaryImage` if non-empty. `image.credit` = "The Metropolitan Museum of Art, " + the record's `creditLine`. `image.license` = exactly the CC0 wording used in the examples.
- `altText`: 1 to 2 sentences, written for someone who cannot see the image. Describe only what you are confident is visible from the title, medium, tags, and your reliable knowledge of the work. Do not guess at details. If you are unsure, describe at a higher level.
- `source`: museum, `objectURL`, `objectId`, `verifiedOn` = today's date, `verifiedBy` = what you actually read from the record.
- `context`: 2 to 3 factual sentences. Only state facts you can support from the record or that are firmly established. Hedge anything debated.

## 4. Writing for six grade bands

Write every artwork's `descriptions` and `questions` for these bands: `k`, `g12`, `g35`, `g68`, `g910`, `g1112`. Descriptions and questions must be written **separately for each band**, not shortened copies of one paragraph.

| Band | Description length | Voice and depth |
|---|---|---|
| k | 25 to 45 words | Very short sentences. Things to see, name, feel, imagine. No art terms unless explained. |
| g12 | 35 to 65 words | Short sentences. Simple ideas: color, line, shape, mood. Invite noticing and connecting. |
| g35 | 50 to 95 words | Specific vocabulary, basic history. Ask for evidence from the picture. |
| g68 | 60 to 105 words | Symbolism, composition, context, technique. Ask for reasoning and other viewpoints. |
| g910 | 65 to 110 words | Intention, hierarchy, style, cultural significance. Evidence-based interpretation. |
| g1112 | 70 to 115 words | Context, competing interpretations, movements. Nuance. Do not claim a single definitive meaning. |

Rules for all bands:

- Simplify the language, never the facts. Every band must be accurate.
- Do not talk down to younger students or lecture older ones.
- Do not claim to know an artist's intention or a symbol's meaning when scholars are unsure. Use "may", "some viewers", "scholars debate".
- Every description should invite looking closely. Avoid descriptions that only list what is visible.
- Do not state facts that you are not sure about. Leave them out.

### Questions

Every band needs a question for **all 15 categories**: `daily`, `emotion`, `observation`, `analysis`, `line`, `shape`, `color`, `texture`, `space`, `light`, `meaning`, `culture`, `technique`, `personal`, `critical`.

- One or two sentences. Open-ended. Invite visual evidence. Avoid yes/no and recall questions.
- Each question must fit **this** artwork. A question is wrong if it could be pasted onto any other artwork.
- If the artwork does not have the quality a category asks about (for example Texture for a flat graphic print), ask about how the artist suggests it, or how its absence matters. Never write a question about something that is not there.
- No two questions in the same band may be identical.
- `daily` is the strongest, most artwork-specific prompt.
- Do not ask students to identify or judge real people, religion, or politics in ways that single anyone out. Culture and history questions should be respectful and curious.

### Teacher note (optional but wanted)

`teacherNote`: `context` (1 to 2 sentences), `vocabulary` (4 to 6 terms), `directions` (2 to 3 discussion extensions). Keep it separate from student text.

## 5. Check your work

After writing files, run:

```
node scripts/validate.mjs
node scripts/build-index.mjs
```

Fix every error that mentions one of your days. Read the warnings for your days too and fix any that are real problems.

## 6. Images that cannot be confirmed: use a placeholder

The project owner will build a manual image library and link images later. So **never let a missing image block an entry**:

- If the Met record is not public domain, `primaryImageSmall` is empty, or you cannot read the record's image fields, still write the entry (title, artist, date, medium, source, texts all taken from a record you actually read) and set the image to a placeholder:

```json
"image": { "status": "pending" }
```

- Do not write `url`, `credit` or `license` for a pending image, and never guess an image URL.
- Alt text is still required (describe the work as reliably known from the record).
- A record is still required: do not write an entry for an object whose metadata you could not confirm from the museum record. Pick another object instead.
- Public-domain objects with a confirmed image keep the full image block as in the examples. Prefer those, but a placeholder is acceptable.
