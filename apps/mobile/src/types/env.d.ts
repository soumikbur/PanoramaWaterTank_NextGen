/**
 * Environment and Global Type Declarations for Mobile/Web SCADA Application.
 */

declare const process: {
  env?: Record<string, string | undefined>;
};

interface ImportMeta {
  env?: Record<string, string | undefined>;
}
