import { AppearanceSettingsDto } from '../dto/appearance-settings.dto';
import { AppearanceStyleDto } from '../dto/appearance-settings.dto';

const DEFAULT_STYLE: AppearanceStyleDto = {
  template: 'professional',
  accentColour: '#0EA5E9',
  backgroundColour: '#ffffff',
  textColour: '#111827',
  font: 'inter',
  cornerStyle: 'rounded',
  spacing: 20,
  theme: 'light',
};

export const DEFAULT_APPEARANCE: AppearanceSettingsDto = {
  global: { ...DEFAULT_STYLE },
  components: {
    bio: { ...DEFAULT_STYLE },
    links: { ...DEFAULT_STYLE },
    projects: { ...DEFAULT_STYLE },
    cta: { ...DEFAULT_STYLE },
  },
};
