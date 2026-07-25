# markdown2pdf formula rendering repros

This file intentionally contains edge cases that are likely to render incorrectly
with the current exporter.

## 1. mathtools command

The following requires the MathJax mathtools extension. In the current build,
`\mathclap` may appear as red literal text in the PDF.

$$
\mathclap{x+y}
$$

## 2. Dollar text mistaken for inline math

The price should remain plain text, and only `$x+1$` should be math:

Price is $5 plus inline $x+1$.

This escaped dollar should remain text, and only `$y$` should be math:

Escaped opener: \$x$ then real $y$.

## 3. Inline code containing math delimiters

The inline code below should stay exactly as `$x$`, not become `\(x\)`:

`$x$`

## 4. Fenced code containing math delimiters

The fenced code below should remain source code. It should not render math and
should not leave legacy math placeholders in the PDF.

```tex
$x$
$$y$$
\mathclap{x+y}
```

## 5. Display math inside paragraph text

This line has display delimiters in the middle: $$x^2 + y^2 = z^2$$ text after the formula.

List item with display delimiters: $$a+b$$ trailing text after display math.

Before a single-dollar block without blank lines:
$
a+b
$
After the single-dollar block.
