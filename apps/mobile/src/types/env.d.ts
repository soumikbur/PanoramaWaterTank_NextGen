/**
 * Environment and Global Type Declarations for Mobile/Web SCADA Application.
 */

declare const process: {
  env: {
    NODE_ENV?: string;
    API_URL?: string;
    REACT_APP_API_URL?: string;
    VITE_API_URL?: string;
    WS_URL?: string;
    REACT_APP_WS_URL?: string;
    VITE_WS_URL?: string;
    VITE_ENABLE_TEST_LOGIN?: string;
    [key: string]: string | undefined;
  };
};

interface ImportMetaEnv {
  VITE_API_URL?: string;
  VITE_WS_URL?: string;
  VITE_ENABLE_TEST_LOGIN?: string;
  [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
