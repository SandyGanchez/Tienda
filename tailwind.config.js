/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts,scss}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "inverse-on-surface": "#faedfb",
        "secondary": "#a93349",
        "on-tertiary": "#ffffff",
        "on-surface": "#201923",
        "on-primary-fixed-variant": "#533e66",
        "surface-container-lowest": "#ffffff",
        "on-error": "#ffffff",
        "surface-container-low": "#fdeffe",
        "surface-container": "#f7eaf8",
        "primary-fixed-dim": "#d7bcec",
        "surface-variant": "#ebdeed",
        "outline-variant": "#ccc4ce",
        "on-secondary-fixed": "#400010",
        "surface-dim": "#e3d6e4",
        "on-primary": "#ffffff",
        "surface-container-high": "#f1e4f2",
        "on-surface-variant": "#4a454d",
        "on-primary-fixed": "#251237",
        "tertiary-fixed-dim": "#efbbaa",
        "on-tertiary-fixed-variant": "#623e31",
        "on-secondary-container": "#730425",
        "on-secondary": "#ffffff",
        "background": "#fff7fc",
        "error": "#ba1a1a",
        "tertiary-fixed": "#ffdbcf",
        "surface": "#fff7fc",
        "secondary-container": "#fe7488",
        "on-error-container": "#93000a",
        "primary": "#402c53",
        "tertiary": "#4e2d21",
        "inverse-primary": "#d7bcec",
        "secondary-fixed": "#ffdadc",
        "on-background": "#201923",
        "surface-bright": "#fff7fc",
        "outline": "#7b757e",
        "on-secondary-fixed-variant": "#891933",
        "on-tertiary-container": "#e4b1a1",
        "on-primary-container": "#cdb2e1",
        "primary-container": "#58436b",
        "error-container": "#ffdad6",
        "secondary-fixed-dim": "#ffb2b9",
        "primary-fixed": "#f0dbff",
        "on-tertiary-fixed": "#2f140a",
        "inverse-surface": "#352e38",
        "surface-container-highest": "#ebdeed",
        "tertiary-container": "#684336",
        "surface-tint": "#6b557f",
        "coral": "#FB7185",
        "peach-light": "rgba(242, 190, 173, 0.1)"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "xs": "4px",
        "md": "16px",
        "container-margin": "20px",
        "base": "4px",
        "sm": "8px",
        "xl": "32px",
        "gutter": "12px",
        "lg": "24px"
      },
      fontFamily: {
        "label-md": ["Be Vietnam Pro"],
        "display-lg-mobile": ["Plus Jakarta Sans"],
        "body-lg": ["Be Vietnam Pro"],
        "label-sm": ["Be Vietnam Pro"],
        "body-md": ["Be Vietnam Pro"],
        "headline-md": ["Plus Jakarta Sans"],
        "display-lg": ["Plus Jakarta Sans"]
      },
      fontSize: {
        "label-md": ["14px", { "lineHeight": "20px", "letterSpacing": "0.01em", "fontWeight": "600" }],
        "display-lg-mobile": ["32px", { "lineHeight": "40px", "fontWeight": "700" }],
        "body-lg": ["18px", { "lineHeight": "28px", "fontWeight": "400" }],
        "label-sm": ["12px", { "lineHeight": "16px", "fontWeight": "500" }],
        "body-md": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
        "headline-md": ["24px", { "lineHeight": "32px", "fontWeight": "600" }],
        "display-lg": ["40px", { "lineHeight": "48px", "letterSpacing": "-0.02em", "fontWeight": "700" }]
      },
      boxShadow: {
        'pastel': '0px 4px 20px rgba(88, 67, 107, 0.08)',
        'pastel-lg': '0px 8px 30px rgba(88, 67, 107, 0.12)'
      }
    }
  },
  plugins: [],
}
