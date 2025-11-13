import sanitize from 'sanitize-html';

/**
 * A list of tags for which style attributes are allowed, but only
 * for attributes commonly useful for text styling (e.g centering text,
 * changing colors, etc).
 */
const tagNamesAllowingTextStyling = [
    'div',
    'nav',
    'img',
    'span', // Also required for comment @mentions to be styled appropriately
    'a',
    'p',
    'b',
    'strong',
    'em',
    'i',
    'td',
    'code',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
];

/**
 * A list of tags for which style attributes are allowed, but only
 * for attributes commonly useful for div styling (e.g centering text,
 * changing colors, etc). This is used to allow the use of div tags
 * in markdown tiles.
 */
const tagNamesAllowingDivStyle = ['div'];

const colorRegexes = [
    /^[a-zA-Z]+$/, // Color names: red, blue, green, etc.
    /^#[0-9a-fA-F]{3}$/, // Hex colors: #000 Note: we don't allow alpha hex colors (4 digits)
    /^#[0-9a-fA-F]{6}$/, // Hex colors: #000000 Note: we don't allow alpha hex colors (8 digits)
    /^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/, // RGB colors: rgb(0, 0, 0) Note: we don't allow rgba
];

/**
 * Defines a list of CSS properties and value RegExps, which will be allowed as part of the
 * style attribute in the above tags.
 */
const allowedTextStylingProperties: NonNullable<
    sanitize.IOptions['allowedStyles']
>[string] = {
    'font-size': [/^\d+(?:px|em|rem|%)$/], // 12px, 1em, 20%
    'font-style': [/^(?:normal|italic|oblique)$/, /^oblique \d+deg$/], //  normal, italic, oblique, oblique 10deg
    'font-weight': [/^\d+$/, /^(?:normal|bold|lighter|bolder)$/], //  100, 500, normal, bold, lighter, bolder
    'line-height': [/^\d+(?:px|em|rem|%)$/], // 1.5, 20px, 120%
    'letter-spacing': [/^\d+(?:px|em|rem|%)$/], // 1px, 0.2em, 10%
    'word-spacing': [/^\d+(?:px|em|rem|%)$/], // 1px, 0.2em, 10%
    'text-align': [/^(?:left|right|center|justify)$/], //  left, right, center, justify
    'text-decoration': [/^(?:none|underline|overline|line-through)$/], //  none, underline, overline, line-through
    color: colorRegexes,
    'background-color': colorRegexes,
    background: [...colorRegexes, /^transparent$/, /^none$/],
    'border-radius': [/^(\d+(?:px|em|rem|%))(\s+\d+(?:px|em|rem|%))*$/],
    'border-top-left-radius': [/^\d+(?:px|em|rem|%)$/],
    'border-top-right-radius': [/^\d+(?:px|em|rem|%)$/],
    'border-bottom-left-radius': [/^\d+(?:px|em|rem|%)$/],
    'border-bottom-right-radius': [/^\d+(?:px|em|rem|%)$/],
    height: [/^\d+(?:px|em|rem|%)$/],
    width: [/^\d+(?:px|em|rem|%)$/],
    margin: [/^(\d+(?:px|em|rem|%))(\s+\d+(?:px|em|rem|%))*$/],
    'margin-bottom': [/^\d+(?:px|em|rem|%)$/],
    'margin-top': [/^\d+(?:px|em|rem|%)$/],
    'margin-left': [/^\d+(?:px|em|rem|%)$/],
    'margin-right': [/^\d+(?:px|em|rem|%)$/],
    padding: [/^(\d+(?:px|em|rem|%))(\s+\d+(?:px|em|rem|%))*$/],
    'padding-bottom': [/^\d+(?:px|em|rem|%)$/],
    'padding-top': [/^\d+(?:px|em|rem|%)$/],
    'padding-left': [/^\d+(?:px|em|rem|%)$/],
    'padding-right': [/^\d+(?:px|em|rem|%)$/],
    float: [/^(?:left|right|none)$/],
    clear: [/^(?:left|right|both|none)$/],
};

/**
 * Defines a list of CSS properties and value RegExps, which will be allowed as part of the
 * style attribute in the div tag.
 */
const allowedDivStyleProperties: NonNullable<
    sanitize.IOptions['allowedStyles']
>[string] = {
    // layout properties
    display: [/^(?:block|inline|inline-block|flex|grid|none|contents)$/],
    position: [/^(?:static|relative|absolute|fixed|sticky)$/],
    'z-index': [/^-?\d+$/, /^auto$/],

    // Flexbox properties
    'justify-content': [
        /^(?:flex-start|flex-end|center|space-between|space-around|space-evenly)$/,
    ],
    'align-items': [/^(?:flex-start|flex-end|center|baseline|stretch)$/],
    'align-content': [
        /^(?:flex-start|flex-end|center|space-between|space-around|space-evenly|stretch)$/,
    ],
    'align-self': [/^(?:auto|flex-start|flex-end|center|baseline|stretch)$/],
    'flex-direction': [/^(?:row|row-reverse|column|column-reverse)$/],
    'flex-wrap': [/^(?:nowrap|wrap|wrap-reverse)$/],
    'flex-grow': [/^\d+$/],
    'flex-shrink': [/^\d+$/],
    'flex-basis': [/^\d+(?:px|em|rem|%)$/, /^auto$/],
    flex: [/^(?:none|auto|\d+(?:\s+\d+)?(?:\s+\d+(?:px|em|rem|%)|auto)?)$/],

    // Grid properties
    'grid-template-columns': [/^[a-zA-Z0-9s\-.]+$/],
    'grid-template-rows': [/^[a-zA-Z0-9s\-.]+$/],
    'grid-column': [/^[a-zA-Z0-9s\-.]+$/],
    'grid-row': [/^[a-zA-Z0-9s\-.]+$/],
    'grid-gap': [/^\d+(?:px|em|rem|%)$/],
    'grid-column-gap': [/^\d+(?:px|em|rem|%)$/],
    'grid-row-gap': [/^\d+(?:px|em|rem|%)$/],

    // Size properties
    width: [/^\d+(?:px|em|rem|%|vw|vh)$/, /^auto$/],
    height: [/^\d+(?:px|em|rem|%|vh|vw)$/, /^auto$/],
    'min-width': [/^\d+(?:px|em|rem|%|vw|vh)$/],
    'min-height': [/^\d+(?:px|em|rem|%|vh|vw)$/],
    'max-width': [/^\d+(?:px|em|rem|%|vw|vh)$/, /^none$/],
    'max-height': [/^\d+(?:px|em|rem|%|vh|vw)$/, /^none$/],

    // Padding properties
    padding: [
        /^\d+(?:px|em|rem|%)$/,
        /^\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)$/,
        /^\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)$/,
        /^\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)$/,
    ],
    'padding-top': [/^\d+(?:px|em|rem|%)$/],
    'padding-right': [/^\d+(?:px|em|rem|%)$/],
    'padding-bottom': [/^\d+(?:px|em|rem|%)$/],
    'padding-left': [/^\d+(?:px|em|rem|%)$/],

    // Margin properties
    margin: [
        /^\d+(?:px|em|rem|%)$/,
        /^auto$/,
        /^\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)$/,
        /^\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)$/,
        /^\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)$/,
    ],
    'margin-top': [/^\d+(?:px|em|rem|%)$/, /^auto$/],
    'margin-right': [/^\d+(?:px|em|rem|%)$/, /^auto$/],
    'margin-bottom': [/^\d+(?:px|em|rem|%)$/, /^auto$/],
    'margin-left': [/^\d+(?:px|em|rem|%)$/, /^auto$/],

    // Border properties
    border: [
        /^(?:none|initial|inherit)$/,
        /^\d+(?:px|em|rem|%)\s+(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\s+[a-zA-Z#0-9]+$/,
    ],
    'border-width': [
        /^\d+(?:px|em|rem|%)$/,
        /^\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)$/,
        /^\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)$/,
        /^\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)$/,
    ],
    'border-style': [
        /^(?:solid|dashed|dotted|double|groove|ridge|inset|outset|none)$/,
    ],
    'border-color': colorRegexes,
    'border-radius': [
        /^\d+(?:px|em|rem|%)$/,
        /^\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)$/,
        /^\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)$/,
        /^\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)\s+\d+(?:px|em|rem|%)$/,
    ],
    'border-top-left-radius': [/^\d+(?:px|em|rem|%)$/],
    'border-top-right-radius': [/^\d+(?:px|em|rem|%)$/],
    'border-bottom-left-radius': [/^\d+(?:px|em|rem|%)$/],
    'border-bottom-right-radius': [/^\d+(?:px|em|rem|%)$/],
    'border-right': [
        /^(?:none|initial|inherit)$/,
        /^\d+(?:px|em|rem|%)\s+(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\s+[a-zA-Z#0-9]+$/,
    ],
    'border-left': [
        /^(?:none|initial|inherit)$/,
        /^\d+(?:px|em|rem|%)\s+(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\s+[a-zA-Z#0-9]+$/,
    ],
    'border-top': [
        /^(?:none|initial|inherit)$/,
        /^\d+(?:px|em|rem|%)\s+(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\s+[a-zA-Z#0-9]+$/,
    ],
    'border-bottom': [
        /^(?:none|initial|inherit)$/,
        /^\d+(?:px|em|rem|%)\s+(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\s+[a-zA-Z#0-9]+$/,
    ],

    // Background properties
    'background-color': colorRegexes,
    'background-image': [/^url\(['"]?[^'"]*['"]?\)$/, /^none$/],
    'background-size': [
        /^(?:cover|contain|auto|initial|inherit)$/,
        /^\d+(?:px|em|rem|%|auto)(?:\s+\d+(?:px|em|rem|%|auto))?$/,
    ],
    'background-position': [
        /^(?:left|right|top|bottom|center)$/,
        /^\d+(?:px|em|rem|%)(?:\s+\d+(?:px|em|rem|%))?$/,
    ],
    'background-repeat': [
        /^(?:repeat|no-repeat|repeat-x|repeat-y|space|round)$/,
    ],

    // Text properties
    color: colorRegexes,
    'font-size': [/^\d+(?:px|em|rem|%)$/],
    'font-weight': [/^\d+$/, /^(?:normal|bold|lighter|bolder)$/],
    'font-family': [/^[a-zA-Z\s,]+$/, /^['"][^'"]*['"]$/],
    'line-height': [/^\d+(?:px|em|rem|%)$/, /^\d+$/],
    'text-align': [/^(?:left|right|center|justify)$/],
    'text-decoration': [/^(?:none|underline|overline|line-through)$/],
    'white-space': [/^(?:normal|nowrap|pre|pre-wrap|pre-line)$/],
    'word-wrap': [/^(?:normal|break-word)$/],
    'overflow-wrap': [/^(?:normal|break-word|break-all)$/],

    // Transform properties
    transform: [/^(?:none|translate|rotate|scale|skew|matrix)(?:\([^)]*\))?$/],
    'transform-origin': [
        /^(?:left|right|top|bottom|center)$/,
        /^\d+(?:px|em|rem|%)(?:\s+\d+(?:px|em|rem|%))?$/,
    ],

    // Transition and animation properties
    transition: [/^[a-zA-Z-]+\s+\d+(?:ms|s)(?:\s+[a-zA-Z-]+)?$/],
    'transition-duration': [/^\d+(?:ms|s)$/],
    'transition-timing-function': [
        /^(?:ease|linear|ease-in|ease-out|ease-in-out)$/,
    ],

    // Other common properties
    opacity: [/^[01]?\.?\d+$/],
    'box-shadow': [
        /^(?:none|inset\s+)?\d+(?:px|em|rem)\s+\d+(?:px|em|rem)(?:\s+\d+(?:px|em|rem))?(?:\s+[a-zA-Z#0-9]+)?$/,
    ],
    'text-shadow': [
        /^(?:none|\d+(?:px|em|rem)\s+\d+(?:px|em|rem)(?:\s+\d+(?:px|em|rem))?(?:\s+[a-zA-Z#0-9]+)?)$/,
    ],
    cursor: [/^(?:auto|default|pointer|text|wait|move|not-allowed|help)$/],
    'user-select': [/^(?:auto|none|text|all)$/],
    'pointer-events': [
        /^(?:auto|none|all|fill|stroke|visible|visibleFill|visibleStroke|painted|fill|stroke|all)$/,
    ],
};

/**
 * If you want to modify sanitization settings, be sure to merge them
 * with the sane defaults pre-included with sanitize-html.
 */
export const HTML_SANITIZE_DEFAULT_RULES: sanitize.IOptions = {
    ...sanitize.defaults,

    allowedAttributes: {
        ...sanitize.defaults.allowedAttributes,
        // Allow @mentions to be styled differently:
        span: [...(sanitize.defaults.allowedAttributes.span ?? []), 'style'],
    },
};

/**
 * Adjusted html sanitization rules for markdown tiles, mainly to
 * allow iframes to be used.
 */
export const HTML_SANITIZE_MARKDOWN_TILE_RULES: sanitize.IOptions = {
    ...HTML_SANITIZE_DEFAULT_RULES,
    allowedTags: [
        ...(HTML_SANITIZE_DEFAULT_RULES.allowedTags || []),
        'iframe',
        'img',
        'picture',
        'source',
    ],

    allowedAttributes: {
        ...HTML_SANITIZE_DEFAULT_RULES.allowedAttributes,

        div: ['style'], // Allow style attribute on div tags
        iframe: ['width', 'height', 'src', 'name'],
        img: ['src', 'width', 'height', 'alt', 'style', 'srcset', 'sizes'],
        picture: [],
        source: ['media', 'srcset', 'sizes', 'type'],

        ...Object.fromEntries(
            tagNamesAllowingTextStyling.map((tagName) => [
                tagName,
                [
                    /** Include any existing allowed attributes from the sanitize-html defaults: */
                    ...(sanitize.defaults.allowedAttributes[tagName] ?? []),
                    'style',
                ],
            ]),
        ),
    },

    allowedStyles: Object.fromEntries([
        ...tagNamesAllowingTextStyling.map((tagName) => [
            tagName,
            allowedTextStylingProperties,
        ]),
        ...tagNamesAllowingDivStyle.map((tagName) => [
            tagName,
            allowedDivStyleProperties,
        ]),
    ]) as Record<
        string,
        NonNullable<sanitize.IOptions['allowedStyles']>[string]
    >,
};

export const sanitizeHtml = (
    input: string,
    ruleSet: sanitize.IOptions = HTML_SANITIZE_DEFAULT_RULES,
): string => sanitize(input, ruleSet);
