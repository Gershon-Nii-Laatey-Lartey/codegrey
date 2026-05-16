export function getCodegrey() {
  if (!window.codegrey) {
    throw new Error("Codegrey desktop bridge is unavailable.");
  }
  return window.codegrey;
}

export const desktop = {
  get workspace() {
    return getCodegrey().workspace;
  },
  get git() {
    return getCodegrey().git;
  },
  get brain() {
    return getCodegrey().brain;
  },
  get auth() {
    return getCodegrey().auth;
  },
  get settings() {
    return getCodegrey().settings;
  },
  get terminal() {
    return getCodegrey().terminal;
  },
  get windowControls() {
    return getCodegrey().windowControls;
  },
};
