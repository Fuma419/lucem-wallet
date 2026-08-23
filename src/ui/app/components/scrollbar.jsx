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
        overscrollBehavior: 'none',
        // The library uses a negative bottom margin to hide the native
        // scrollbar. That pulls the last ~15px of a height:100% child
        // (Send's Review footer) under the popup clip. No horizontal
        // overflow — drop the gutter.
        overflowX: 'hidden',
        marginBottom: 0,
      }}
    />
  );
}

export const Scrollbars = RCScrollbars;
