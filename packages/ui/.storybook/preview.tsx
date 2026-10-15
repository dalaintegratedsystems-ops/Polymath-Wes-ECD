import type { Decorator, Preview } from '@storybook/react-vite';
import { useEffect } from 'react';
import './storybook.css';

const withTheme: Decorator = (Story, ctx) => {
  const theme = ctx.globals.theme as 'light' | 'dark';
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return <Story />;
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
    viewport: { value: 'phone360', isRotated: false },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    viewport: {
      options: {
        phone360: {
          name: 'Mid-range Android (360×780)',
          styles: { width: '360px', height: '780px' },
          type: 'mobile',
        },
        phone412: {
          name: 'Large Android (412×915)',
          styles: { width: '412px', height: '915px' },
          type: 'mobile',
        },
        tablet: {
          name: 'Tablet (768×1024)',
          styles: { width: '768px', height: '1024px' },
          type: 'tablet',
        },
      },
    },
  },
};

export default preview;
