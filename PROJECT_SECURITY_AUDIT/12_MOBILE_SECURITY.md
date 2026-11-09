# 12. Mobile SCADA & Responsive Viewport Security Audit
## Panorama Water Tank Monitor (Mobile HMI Experience)

**Audit Date:** November 9, 2026  
**Audited Surface:** Mobile Browser (Android Chrome, iOS Safari), Responsive Breakpoints (< 768px, 768–1024px, > 1024px)  

---

### 1. Viewport Adaptation & Touch Target Safety

| Viewport Category | Resolution | Sidebar / Navigation Behavior | Layout Safeguards |
|---|---|---|---|
| **Compact Mobile** | 320 × 640 | Desktop sidebar hidden (`display: none !important`); Hamburger button active | `max-width: 100vw; overflow-x: hidden` prevents accidental horizontal scrolling |
| **Standard Mobile** | 360 × 800 | Slide-in drawer (`min(320px, 85vw)`) with backdrop blur (`z-index: 9999`) | Touch targets meet minimum 44 × 44px ergonomic requirement |
| **Modern Smartphone** | 390 × 844 | Drawer auto-collapses on route selection | 2-column key-value metrics; full-width mobile train cards |
| **Tablet Portrait** | 768 × 1024 | Responsive auto-fit grid (`minmax(min(100%, 280px), 1fr)`) | High-density SCADA tables wrapped in momentum touch scroll containers |
| **Desktop Workstation**| 1366 × 768 | Persistent 240px SCADA navigation sidebar with collapse option | Fixed multi-column tabular SCADA control surface |

---

### 2. Mobile-Specific Vulnerability Surface

1. **Touch Target Misclicks & Unintended Actions:**
   - In industrial contexts, operating an HMI on a mobile phone while wearing gloves or in moving rolling stock carries high risk of unintended state mutations.
   - **Safeguards:** Critical actions (such as acknowledging alarms or resetting configurations) require secondary confirmation dialogs, preventing accidental taps.
2. **Data Caching & Offline Vulnerability:**
   - Mobile browsers cache static JS bundles aggressively.
   - **Mitigation:** Deployed single-page app decoder with query hash redirection and cache-busting headers.
   - **Local Storage Cleansing:** Logging out cleanses `panorama_token` and cached user objects from `localStorage`.
