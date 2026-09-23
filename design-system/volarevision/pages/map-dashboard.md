# Map Dashboard Page Overrides

> **PROJECT:** VolareVision
> **Generated:** 2026-09-23 22:04:37
> **Page Type:** Dashboard / Data View

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1400px or full-width
- **Grid:** 12-column grid for data flexibility

### Spacing Overrides

- **Content Density:** High — optimize for information display

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

The map dashboard runs in dark mode over CARTO dark tiles. It uses the skill's
"Ride Hailing / Transportation" dark palette (`--domain color "dark mode map dashboard"`)
while keeping Master's primary blue and orange accent:

| Role | Hex | Token |
|------|-----|-------|
| Background | `#0F172A` | `--color-background` |
| Surface (panel) | `#192134` | `--color-surface` |
| Field | `#10182B` | `--color-field` |
| Field border | `#3B4A63` | `--color-field-border` |
| Foreground | `#F8FAFC` | `--color-foreground` |
| Muted text | `#94A3B8` | `--color-muted` |
| Primary / CTA | `#2563EB` | `--color-primary` |
| Focus ring | `#60A5FA` | `--color-ring` |
| Error text | `#F87171` | `--color-danger` |
| Route: fuel (solid) | `#22C55E` | `--color-route-fuel` |
| Route: passengers (dashed) | `#3B82F6` | `--color-route-pax` |
| Route: max profit (dotted) | `#F97316` | `--color-route-profit` |

Routes are told apart by line pattern and icon as well as by colour.

### Component Overrides

- Avoid: Unoptimized full-size images

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: Hover tooltips, chart zoom on click, row highlighting on hover, smooth filter animations, data loading spinners
- Performance: Use appropriate size and format (WebP)
