# Abu Twins Retail

ThemeForest-oriented Elementor canvas for multi-branch phone retail. Built for **Elementor Pro Theme Builder**, with optional live widgets from the **Abu Twins Invent** plugin.

## Design strategy

| Principle | Application |
|-----------|-------------|
| Hello-style canvas | Thin theme chrome. Elementor Pro owns header, footer, and pages. |
| Design tokens | `theme.json` + CSS variables (indigo / emerald brand). |
| Plugin-native widgets | Elementor category **Abu Twins Invent**: stock, warranty, trade-in, branches, staff portal. |
| Global color bridge | Elementor Global Colors map into public widget CSS variables. |
| Graceful fallback | Branded header/footer and **Storefront** page template until Theme Builder templates are assigned. |
| No layout lock-in | **Elementor Canvas** and **Full width** page templates. |

## Requirements

- WordPress 6.4+, PHP 8.1+
- Elementor (free) + Elementor Pro (Theme Builder)
- Optional: Abu Twins Invent plugin for live inventory widgets

## Install

1. Build zip: `make theme-release` (or zip the `abutwins` folder).
2. Appearance → Themes → Upload Theme → activate **Abu Twins Retail**.
3. Install Elementor + Elementor Pro.
4. Optionally install Abu Twins Invent for stock / warranty / trade-in widgets.

## Elementor Pro setup

1. **Site Settings → Global Colors** — Primary `#4F46E5`, Accent `#10B981`, Text `#0F172A`.
2. **Theme Builder → Header / Footer** — assign to Entire Site (theme yields automatically).
3. Pages: use **Elementor Canvas** for landings, or **Full width** to keep theme chrome.
4. Widgets: Elementor panel → **Abu Twins Invent**.

## Quick start without Pro templates

1. Create a page → Template: **Storefront**.
2. Settings → Reading → set as front page.
3. Later rebuild the same sections in Elementor Canvas.

## ThemeForest checklist notes

- GPL-2.0-or-later, no encoded PHP  
- Required templates + screenshot  
- Elementor-first (not options-framework-first)  
- Translation-ready (`abutwins` text domain)  
- Skip link, HTML5, title-tag, custom-logo  
- Documented Theme Builder flow  

## Version

1.2.0

