# Beamer Theme Demo

## Agenda

- Purpose: check the `beamer` theme visual language.
- Expected layout: landscape slide, deep-blue header and footer bars.
- Content blocks should use dark-blue titles with light blue-gray bodies.
- Tables, code, math, and quotes should remain readable in slide format.

## Slide Structure

This paragraph follows an `h2`, so it should render as a compact content block under a dark-blue section title.

### What to inspect

- The top navigation bar should stay fixed across pages.
- The main `h1` should appear as a blue title strip.
- The bottom footer bar should not use Chromium page numbers by default.

## Metrics Table

| Area | Expected result | Check |
| --- | --- | --- |
| Page setup | 128 x 96 mm (4:3), zero margins | Theme PDF options |
| Header | Deep blue top bar | CSS pseudo element |
| Blocks | Dark title + light body | `h2 + p/ul/ol` rules |
| TOC | Independent agenda slide | `includeToc: true` |

## Math Block

Inline math should stay aligned with text, for example $E = mc^2$.

$$
\int_0^1 x^2 dx = \frac{1}{3}
$$

## Code Block

```ts
type Theme = 'academic' | 'beamer';

function shouldShowFooter(theme: Theme): boolean {
  return theme === 'academic';
}
```

## Quote Block

> Beamer mode is intentionally static: it focuses on a slide-like visual structure instead of LaTeX overlays or incremental reveal behavior.

## Long List

- Use this sample with the Beamer theme selected in the sidebar.
- Enable table of contents to confirm the first generated page keeps the slide styling.
- Leave page numbers disabled to confirm the dark footer bar is the only footer treatment.
- Export to PDF and inspect whether each block keeps enough breathing room on a landscape page.

## TEST

### A

**a**: b

test

1

2

3

4

5

6

7

8

9

10

11

12

13

14

15

### B

TEST

### C

AAA

BBB

$$
1+1=2
$$
