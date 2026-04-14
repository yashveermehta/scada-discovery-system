# Design System Specification: The Industrial High-Fidelity Framework

## 1. Overview & Creative North Star
### The Creative North Star: "The Precision Chronometer"
In the high-stakes environment of a SCADA NOC, the interface must function with the mechanical accuracy of a luxury timepiece. This design system moves away from the "soft" web and toward "Industrial Precision." It is an editorial approach to data monitoring where the interface feels like a machined instrument carved from obsidian and inlaid with brass.

To break the "standard dashboard" feel, this system utilizes **Hard-Edge Brutalism** (0px border radii) paired with **Tonal Depth**. We reject the generic grid in favor of intentional asymmetry, where data density is balanced by wide "Obsidian" voids, allowing the critical "Brass" alerts to command immediate authority.

---

## 2. Color Architecture
The palette is a sophisticated interplay between deep, light-absorbing voids and metallic, high-visibility accents.

### The Palette
- **Background (Obsidian):** `#070a12` — The foundation of the system.
- **Primary (Brass):** `#e6c364` (Primary) / `#c9a84c` (Primary Container) — Use for critical interactions and active states.
- **Node Spectrum:** 
    - Router: `#5b7fa6`
    - Switch: `#4a8c6f`
    - PLC: `#a07840`
    - RTU: `#7a6a9e`
    - Rogue: `#9c6060` (Error/Alert)

### The "No-Line" Rule
Prohibit the use of 1px solid borders for sectioning. Structural boundaries must be defined solely through background color shifts.
- A `surface-container-low` section sitting on a `surface` background provides a soft, professional transition.
- Use `surface-container-highest` (`#31353e`) only for small interactive elements that need to "pop" from the obsidian base.

### Surface Hierarchy & Nesting
Treat the UI as a series of machined layers. Use the surface-container tiers to create depth:
1. **Base:** `surface-dim` (`#10131c`)
2. **Primary Workspaces:** `surface-container-low` (`#181b24`)
3. **Information Nodes:** `surface-container-high` (`#272a33`)

### Signature Textures
Main CTAs and critical data headers should use a subtle vertical gradient transitioning from `primary` (`#e6c364`) to `primary-container` (`#c9a84c`). This mimics the way light hits polished brass, providing a "soul" that flat hex codes cannot achieve.

---

## 3. Typography
This system uses a tri-font strategy to balance editorial sophistication with technical utility.

| Role | Font Family | Character | Usage |
| :--- | :--- | :--- | :--- |
| **Display/Headline** | Space Grotesk | Tech-Forward | High-level NOC status and section headers. |
| **Body/Title** | Inter | Neutral/Legible | Descriptive text and system labels. |
| **Technical Data** | JetBrains Mono | Monospaced | **All technical labels, IP addresses, and telemetry.** |

**Hierarchy Note:** 
Use `display-lg` (Space Grotesk) for single-number metrics (e.g., "99.8% Uptime") to create an editorial impact. All raw data must remain in JetBrains Mono to signify its status as "unfiltered system information."

---

## 4. Elevation & Depth
In an industrial interface, we do not use "fuzziness" to show depth. We use tonal layering and "Ghost Borders."

- **The Layering Principle:** Place a `surface-container-lowest` card inside a `surface-container-low` section. The subtle shift in dark tones creates a "carved out" look rather than a "pasted on" look.
- **Ambient Shadows:** Shadows are rarely used. If a floating modal is required, use a massive blur (40px+) at 8% opacity using the `on-surface` color. It should feel like an ambient glow, not a drop shadow.
- **The "Ghost Border":** For high-density data tables where separation is mandatory, use the `outline-variant` (`#4d4637`) at 15% opacity. This creates a "suggestion" of a line that disappears into the obsidian background when not focused.
- **Hard Edges:** All containers, buttons, and inputs must have a **0px border-radius**. This reinforces the industrial, rugged nature of the SCADA environment.

---

## 5. Components

### Buttons
- **Primary:** Solid Brass (`primary`). Text in `on-primary` (`#3d2e00`). No rounding.
- **Secondary:** Ghost style. No background. `Ghost Border` (15% opacity Brass). Text in `primary`.
- **States:** On hover, apply a `surface-bright` overlay at 10% to "illuminate" the brass.

### Connection Lines (The "Nerve" System)
- **Token:** `#1c2840`.
- **Styling:** Lines should be 1.5px thick. Use "Manhattan" routing (right angles only). Never use diagonal lines; they break the industrial grid.

### Data Chips
- **Usage:** Representing node status (PLC, RTU, etc.).
- **Style:** No fill. Use a 1px `Ghost Border` of the node’s specific color. Text in JetBrains Mono, all caps.

### Input Fields
- **Style:** Underline only. No four-sided boxes.
- **Active State:** The underline transitions from `outline` to `primary` (Brass). Helper text must be in `label-sm` JetBrains Mono.

### Cards & Lists
- **Rule:** Absolute prohibition of divider lines.
- **Separation:** Use vertical white space from the spacing scale (multiples of 8px) or subtle shifts between `surface-container-low` and `surface-container-high`.

---

## 6. Do's and Don'ts

### Do
- **DO** use JetBrains Mono for all numeric values to ensure character alignment in live-updating data.
- **DO** use intentional asymmetry. A large, empty obsidian space next to a dense brass data column creates a high-end, "curated" feel.
- **DO** use "Glassmorphism" for temporary overlays. Apply a 12px `backdrop-blur` to `surface-container-low` at 70% opacity.

### Don't
- **DON'T** use any border-radius. Even a 2px radius destroys the "Precision Chronometer" aesthetic.
- **DON'T** use pure white. All "white" text should use `on-surface-variant` (`#d0c5b2`) to maintain the aged, industrial brass tone.
- **DON'T** use standard "Success/Warning/Error" colors. Use the defined Node Spectrum (PLC, RTU, Rogue) to maintain the system's unique visual identity.

---

## 7. Signature Interaction: The "Pulse"
When a node (PLC/RTU) updates, do not use a standard loading spinner. Instead, apply a brief "Brass" glow (`primary`) to the container's background that fades over 300ms. This mimics the electrical pulse of industrial hardware.