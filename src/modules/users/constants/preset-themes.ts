export const PRESET_THEMES = ['default'] as const;

export type PresetTheme = (typeof PRESET_THEMES)[number];
