import {
  mdiThemeLightDark,
  mdiWeatherNight,
  mdiWhiteBalanceSunny,
} from '@mdi/js';
import { type ThemeMode, useThemeContext } from '../../contexts/ThemeContext';
import { Segmented } from '../primitives';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: mdiWhiteBalanceSunny },
  { value: 'dark', label: 'Dark', icon: mdiWeatherNight },
  { value: 'auto', label: 'Match Home Assistant', icon: mdiThemeLightDark },
] as const;

export const ThemeSegmented = ({
  iconOnly = false,
}: {
  iconOnly?: boolean;
}) => {
  const { themeMode, setThemeMode } = useThemeContext();
  return (
    <Segmented<ThemeMode>
      ariaLabel="Theme"
      value={themeMode}
      onChange={setThemeMode}
      options={OPTIONS}
      iconOnly={iconOnly}
      size={iconOnly ? 'sm' : 'md'}
    />
  );
};
