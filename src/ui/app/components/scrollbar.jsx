import React from 'react';
import { Scrollbars as RCScrollbars } from 'react-custom-scrollbars-2';

/**
 * react-custom-scrollbars-2 default view background reads as a flat gray slab on
 * dark themed pages (HW import, full-tab flows). Use as `renderView` on nested Scrollbars.
 */
export function lucemTransparentScrollView({ style, ...props }) {
  return (
    <div
      {...props}
      style={{
        ...style,
        backgroundColor: 'transparent',
      }}
    />
  );
}

export const Scrollbars = RCScrollbars;
