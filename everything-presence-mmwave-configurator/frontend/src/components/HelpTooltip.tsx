import type React from 'react';
import { InfoTrigger } from './primitives/Field';

interface HelpTooltipProps {
  children: React.ReactNode;
  id?: string;
  label?: string;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ children, id, label = 'More information' }) => (
  <InfoTrigger content={children} label={label} id={id} />
);
