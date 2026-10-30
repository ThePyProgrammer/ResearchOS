const colors = require('tailwindcss/colors.js')

// Keep utility variants and opacity modifiers working in both themes. Background,
// foreground and border roles are separate: a dark button is not a text color.
const families = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky']
const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const backgrounds = ['#191919', '#262626', '#303030', '#3b3b3b', '#484848', '#545454', '#454545', '#363636', '#262626', '#1e1e1e', '#141414']
const foregrounds = ['#fafafa', '#ededed', '#dedede', '#cecece', '#a3a3a3', '#ababab', '#bdbdbd', '#d4d4d4', '#e3e3e3', '#ededed', '#fafafa']
const borders = ['#292929', '#303030', '#383838', '#484848', '#626262', '#777777', '#888888', '#999999', '#aaaaaa', '#bbbbbb', '#cccccc']
const rgb = hex => hex.replace('#', '').match(/../g).map(n => parseInt(n, 16))
const mix = (a, b, weight) => rgb(a).map((n, i) => Math.round(n * (1 - weight) + rgb(b)[i] * weight)).join(' ')
const value = (role, family, shade) => `rgb(var(--${role}-${family}-${shade}) / <alpha-value>)`
const palette = role => Object.fromEntries(families.map(family => [family, Object.fromEntries(shades.map(shade => [shade, value(role, family, shade)]))]))

const lightVariables = { '--surface': '255 255 255', '--sidebar': '30 41 59' }
const darkVariables = { '--surface': '30 30 30', '--sidebar': '24 24 24' }
for (const [index, family] of families.entries()) {
  for (const [i, shade] of shades.entries()) {
    const original = colors[family][shade]
    const accent = colors[family]
    for (const role of ['fg', 'bg', 'line']) {
      const key = `--${role}-${family}-${shade}`
      lightVariables[key] = rgb(original).join(' ')
      if (index < 5) {
        darkVariables[key] = rgb(({ fg: foregrounds, bg: backgrounds, line: borders })[role][i]).join(' ')
      } else if (role === 'bg') {
        darkVariables[key] = shade <= 300 ? mix('#1e1e1e', accent[400], [0.10, 0.16, 0.23, 0.30][i]) : rgb(accent[shade]).join(' ')
      } else if (role === 'line') {
        darkVariables[key] = mix('#1e1e1e', accent[400], shade <= 300 ? 0.35 : 0.65)
      } else {
        // Blue 400 keeps links clear on charcoal; solid buttons retain the
        // same blue 600 as light mode so white labels remain readable.
        darkVariables[key] = rgb(accent[shade >= 500 ? (family === 'blue' ? 400 : 300) : shade]).join(' ')
      }
    }
  }
}

const themePlugin = ({ addBase }) => addBase({
  ':root': lightVariables,
  'html.dark': darkVariables,
  // The sidebar is dark in either theme; preserve its translucent white hovers.
  '.theme-sidebar': { '--surface': '255 255 255', colorScheme: 'dark' },
})

module.exports = { palette, themePlugin }
