# 08. Frontend Security & Client-Side Hardening
## Panorama Water Tank Monitor (React 18 / HMI SPA)

**Audit Date:** November 9, 2026  
**Target Codebase:** `apps/mobile/src/`  
**Build Tooling:** esbuild v0.21.5, Vite 5  

---

### 1. Cross-Site Scripting (XSS) Defenses

- **JSX Contextual Escaping:** React 18 automatically encodes dynamic variables inside JSX expressions, preventing reflected and stored HTML injections.
- **Dangerous API Audit:**
  - Zero instances of `dangerouslySetInnerHTML` exist in the frontend application.
  - Zero usages of `eval()`, `new Function()`, or `document.write()`.
- **CSS Injection Resistance:** Dynamic styles are applied via structured inline style objects and dedicated CSS classes with constrained numerical values.

---

### 2. Client-Side Storage & Sensitive Data Handling

- **Authentication Tokens:** Stored in browser `localStorage` under key `panorama_token`.
  - In browser contexts, `localStorage` is accessible to scripts from the same origin.
  - Mitigation: Defensive Content Security Policy (CSP) headers block execution of untrusted third-party scripts.
- **Credential Storage:** Plaintext passwords are never persisted to `localStorage` or `sessionStorage`. Login credentials are used transiently during the authentication POST request and garbage collected.
- **Demo Mode Isolation:** In production enterprise deployments, the client-side mock authentication fallback is restricted strictly to local or whitelisted preview environments, preventing credential bypass.

---

### 3. Clickjacking & Frame Sandboxing

- **HTTP Headers:** Backend issues `X-Frame-Options: DENY` on all responses.
- **Frame Busting:** Content Security Policy `frame-ancestors 'none'` prevents embedding of the SCADA console into malicious external iframes.
- **Native Electron Sandbox:** In desktop mode, `sandbox: true` and `contextIsolation: true` prevent arbitrary page frames from escalating privileges to the operating system.
