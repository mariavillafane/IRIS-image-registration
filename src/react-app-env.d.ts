/// <reference types="react-scripts" />

interface Window {
  /** Server info fetched at startup (see src/index.tsx). */
  __SERVER_INFO__?: import("./types").ServerInfo;
}
