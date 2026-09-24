# Mandarin Cards · HSK 1

Static web app for studying the classic HSK 1 set of 150 words.

## Current version · Cards + Thematic Practice + Situations

The app now separates **seeing/understanding a word** from **actively retrieving it**.

### Cards

Each learning card prioritizes:

- Hanzi
- pinyin
- Mandarin pronunciation
- English meaning
- a short English explanation
- one example sentence with Hanzi, pinyin and English

Extra information stays optional behind **Break down**, **Characters**, **Memory tip**, and **Practice this word**.

Cards now include a dedicated **Card Explorer** with:

- global search by Hanzi, pinyin (tone marks optional), or English
- **All words** browsing
- the same **10 thematic blocks** used in Practice
- persistent **focused browsing**
- compact mini-cards for quickly scanning the vocabulary
- context-aware Previous / Next / Shuffle navigation: when a card is opened from a block or search results, navigation stays inside that group

### Practice

The 150 words are reorganized for practice into **10 thematic blocks of 15 related words**. The original vocabulary data is not removed or replaced; the grouping is only a study layer.

Each block can be trained independently with:

- **Meaning** — Hanzi → English and English → Hanzi
- **Hanzi & Pinyin** — written form ↔ pronunciation
- **Listening** — audio → Hanzi, meaning, or pinyin when needed to avoid ambiguous homophones
- **Association** — complete the word inside an example sentence
- **Type Hanzi** — use the device’s Chinese Pinyin keyboard/IME to produce the target Hanzi
- **Mixed practice** — interleaves all five exercise types
- **Review mistakes** — revisits words/skills previously answered incorrectly

Feedback never advances automatically. After every answer the learner can inspect the correct Hanzi, pinyin, English meaning, explanation, example sentence, and replay the audio, then press **Next** manually.

Practice accuracy is stored locally in the browser and tracked separately by word and skill.

### Write Hanzi

The existing Hanzi Writer trainer remains available with stroke-order validation, immediate feedback, hints, and local writing progress.

## Language

All learner-facing explanations and interface text are in **English**. Mandarin content is shown in simplified Hanzi with pinyin.

## Files

- `index.html` — app structure
- `css/styles.css` — warm white + light Chinese-red visual system
- `js/data.js` — original 150-word HSK 1 vocabulary source data
- `js/learning-data.js` — English meanings, explanations, examples and character glosses
- `js/practice-data.js` — 10 thematic practice blocks
- `js/app.js` — cards, audio, practice engine, progress, feedback, and writing logic
- `js/situations.js` — branching real-life scenario engine for the Situations tab
- `assets/favicon.svg` — favicon

## Run locally

From the project folder:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000
```

If port 8000 is busy, use another port such as `8080`.

## GitHub Pages

This project is fully static and can be published directly from the repository root with GitHub Pages.

## Hanzi writing

Stroke validation uses Hanzi Writer from a CDN. The Cards and Practice areas work locally as normal static interfaces, while stroke-practice loading requires Internet access for that library.

## Vocabulary source

The 150-word vocabulary base follows the MandarinBean HSK 1 list used in the original project. The English teaching notes, example sentences, thematic practice blocks, and exercise logic are learning layers built on top of that vocabulary list.


## v5 — Type Hanzi with your Chinese Pinyin keyboard

Practice blocks now include **Type Hanzi**. The exercise uses a normal web text field so iOS, iPadOS, Android, macOS, and Windows can use their own Chinese Simplified Pinyin IME. The learner types pinyin on the system keyboard, selects the Hanzi candidate, and the app checks the committed Chinese characters.

The mode rotates three cues: visible Hanzi (guided input), English meaning → Hanzi, and listening → Hanzi. It is IME-safe (composition events are respected), never auto-advances, allows retries until the target is produced, and offers optional pinyin/audio hints. First-try unaided performance is what counts toward accuracy.


## v6 — Card Explorer

The Cards section now separates **browsing** from **studying a single word**. Tap **Explore cards** to search the complete HSK 1 set, browse by thematic block, or open focused browsing. Opening a word from any of those views creates a browsing scope, so Previous, Next, and Shuffle remain inside the same set instead of unexpectedly jumping through all 150 words. focused browsing and the active card scope are stored locally in the browser.


### v6.1 navigation cleanup
Card navigation now lives at the top of each learning card with previous/next arrows. The duplicate bottom navigation and Favorites/heart controls were removed to keep the card focused.


## v7 — Situations · At a Restaurant

A new **Situations** section turns vocabulary into a branching 2D-style restaurant interaction. The first scenario is **At a Restaurant** and keeps all learner-facing support in **Hanzi + pinyin + English**.

The restaurant story includes:

- arrival and party-size interaction
- a real choice of seating
- water or tea branches
- a three-item menu with different meal paths
- ordering language that depends on the learner’s own food choice
- table conversation with multiple valid reactions
- a repeatable table hub, so the story does not force an immediate ending
- optional extra water or tea
- optional takeout
- Chinese Pinyin-keyboard input for asking for the bill
- multiple payment routes
- a farewell interaction and a route summary
- a phrase book that unlocks useful language during the scenario

Wrong answers do not kill the story or auto-advance. They give feedback and allow another attempt. Valid choices are remembered and reused later in the scenario. The official 150-word HSK 1 dataset remains unchanged; restaurant-specific language is treated as situation vocabulary rather than added to the HSK count.


## v8.1 — Game-style Situations

The Restaurant situation has been redesigned to feel much closer to a lightweight 2D story game while remaining a static web app:

- a game-style Situation catalog with a featured restaurant scenario
- an illustrated top-down restaurant world built with responsive inline SVG/CSS
- visible player, host/waiter, friend, tables, counter, menu and food scenes
- floating **Talk** interaction in the world
- dialogue overlays inside the scene, using Hanzi + pinyin + English
- richer response cards with icons, feedback and manual continuation
- food-selection cards that resemble an in-world restaurant menu
- a free-choice table hub with tappable world hotspots and repeatable interactions
- compact game controls for Listen, Hint, Phrase Book and Your Route
- Phrase Book and route history moved into optional drawers instead of a permanent sidebar
- the existing branching restaurant logic, Chinese keyboard task, and non-dead-ending story are preserved

This version intentionally does not add a full movement/physics engine yet. It tests the RPG/point-and-click presentation first while keeping the code lightweight and GitHub Pages compatible.


## v8.1 quiz visibility
- Enlarged Hanzi targets in Practice.
- Enlarged Hanzi answer choices with dedicated typography and touch targets.
- Improved pinyin/English option sizing and feedback Hanzi visibility.


## v9 notes
- Cards now use a front/back flashcard layout.
- Tap the Hanzi on the front or back to open Character Explorer.
- Character Explorer splits words into their Hanzi, and shows radicals/components when available.


## v9.1 fix
- Fixed Character Explorer incorrectly appearing on page load.
- Close button, backdrop click, and Escape now reliably close Character Explorer.
- Added a global `[hidden]` rule so hidden panels cannot be forced visible by component CSS.


## v9.2 Character Explorer
- Redesigned Character Explorer to match the approved single-view layout.
- Each Hanzi now gets a richer detail card with composition type, component breakdown, and a “How it combines” explanation.
- Semantic, phonetic, and structural pieces are color-coded.


## v9.3 Card Explorer improvements
- Filter tags now sit inside a visible boxed container and wrap, so all thematic tags can be seen without horizontal scrolling.
- Added audio buttons to every card tile inside Card Explorer.


## v9.4 cleanup
- Simplified Card Explorer top area to just the HSK 1 Cards title, search bar, and tags.
- Added audio button for the example sentence in Practice feedback.
- Restored a subtle jade + red palette across the app backgrounds and cards.


## v9.5 navigation fix
- Fixed Practice / Write Hanzi / Situations tabs after the simplified Card Explorer.
- App opens directly on Cards → All words.
- Clicking Cards returns to the All words explorer.
- Practice example audio survives completed/restarted sessions.


## v10 Practice redesign
- Redesigned each practice block around one clear Start practice action.
- Added a Practice mode selector: Mixed, Meaning, Listening, Hanzi & Pinyin, Type Hanzi, Association.
- Mixed mode remains the default and rotates through all exercise types.
- Replaced the full 15-word row with a compact vocabulary preview.
- Added variable Mandarin result phrases plus a light success/error chime.
- Correct phrases and retry phrases are randomly varied and spoken in Mandarin.


## v10.1 illustrated hero polish
- Restored the illustrated look of the approved Practice mockup.
- Added an SVG scenic hero (red sun, mountains, pavilion, lake, watercolor feel) to the Start practice panel.
- Added a subtle bamboo/ink landscape accent behind the block header area.
- Kept the v10 functionality intact while matching the mockup more closely.


## v10.2 approved mockup artwork
- The Start Practice panel now uses artwork extracted directly from the approved mockup image.
- The scenic pavilion / red sun / mountains are a real PNG asset inside the project instead of a CSS/SVG recreation.
- Desktop keeps the art on the left with content on the right; mobile overlays the content over a softened full-bleed version.


## v10.3 full mockup background polish
- Added the top-right mountains + bamboo using imagery extracted directly from the approved mockup.
- Replaced the synthetic header accent with a real composite PNG asset from the mockup.
- The Practice block should now feel much closer to the screenshot reference as a whole, not only in the Start Practice card.


## v10.4 global scenic theme
- Extended the bamboo + mountain ambience to the whole app, not just the Practice section.
- Added fixed global background art using the approved mockup assets:
  - mountains + bamboo at the top-right
  - scenic watercolor accent at the bottom-left
- Converted major app surfaces into soft glass-paper cards so the background can be felt behind all sections.
- Removed the Practice-only header overlay because the ambience is now shared globally.


## v10.5 cleanup and Hanzi emphasis
- Removed the accidental `35%` artifact from the scenic global background by rebuilding the top-right artwork from clean crops.
- Made the global bamboo/mountain ambience softer and prettier across the full app.
- Increased Hanzi prominence in Practice previews, word chips, and Hanzi-based exercise states.


## v10.6 card flip + clean background
- Removed the global bamboo/mountain image background.
- Cards now use a real 3D front/back flip animation.
- `Show meaning` rotates the card to its reverse side.
- `Show front` rotates it back.
- Moving to Previous / Next / Shuffle or opening a different word always resets to the front.


## v10.7 card face styling
- Front face uses a warm white/cream paper tone.
- Back face uses a very light jade tone.
- Replaced oversized `Show meaning` / `Show front` buttons with matching compact pills:
  - `↻ Reveal`
  - `↻ Front`
- Both flip controls now have the same size, placement, and hierarchy.


## v10.8 edge navigation + cleaner flip controls
- Tapping the left edge of the card goes to the previous word.
- Tapping the right edge goes to the next word.
- Edge navigation uses subtle chevrons that become visible on hover/focus.
- Removed the long “Tap the Hanzi…” helper sentence from the front.
- Refined flip controls to smaller paired pills:
  - `↻ Answer`
  - `↻ Question`
- Existing next/previous navigation still resets every new card to its front.


## v10.9 compact question face + true edge tap navigation
- Removed the visible left/right side buttons completely.
- The card itself now detects taps/clicks in its left and right edge zones:
  - left edge → previous card
  - right edge → next card
- Interactive content such as Hanzi/audio/flip buttons is excluded from edge navigation.
- The front/question face now sizes to its own content instead of inheriting the taller back-face height.
- Replaced text flip pills with one small circular `↻` control on both faces.


## v11 balanced card faces
- Removed the long vocabulary/practice/source footer note from the app.
- Front and back card faces now use the same visual height.
- The front is vertically balanced again instead of looking compressed.
- The circular flip control is slightly larger while staying minimal.
